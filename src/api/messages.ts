import { jsonResponse, errorResponse } from '../utils/response-utils';

function createCommentId(prefix = 'comment'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function parseExtraData(raw: string | null): any {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function pickSenderName(row: any): string {
  return row?.display_name || row?.sender_display_name || row?.email || row?.sender_email || '一位成员';
}

function trimCommentText(content: string, maxLength: number): string {
  const normalized = (content || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength)}...`;
}

async function getPotWithAccess(
  env: any,
  potId: string,
  userId: string | null,
  shareToken?: string | null,
  options?: { allowPublicShare?: boolean; allowViewer?: boolean }
) {
  const pot = await env.DB.prepare(`
    SELECT id, user_id, name, share_token, is_shared, COALESCE(status, 'active') as status
    FROM pots
    WHERE id = ?
  `).bind(potId).first();
  if (!pot) {
    return { error: errorResponse('Pot not found', 404) };
  }

  let access = null;
  if (userId) {
    access = await env.DB.prepare(`
      SELECT 1
      FROM pots
      WHERE id = ? AND user_id = ?
      UNION
      SELECT 1
      FROM pot_collaborators
      WHERE pot_id = ? AND user_id = ?
      UNION
      SELECT 1
      FROM pot_viewers
      WHERE pot_id = ? AND user_id = ?
      LIMIT 1
    `).bind(
      potId,
      userId,
      potId,
      userId,
      options?.allowViewer ? potId : '__disabled__',
      options?.allowViewer ? userId : '__disabled__'
    ).first();
  }

  if (!access && shareToken && options?.allowPublicShare) {
    access = await env.DB.prepare(`
      SELECT 1
      FROM pots
      WHERE id = ? AND share_token = ? AND is_shared = 1
    `).bind(potId, shareToken).first();
  }

  if (!access) {
    return { error: errorResponse('Access denied', 403) };
  }

  return { pot };
}

async function getCommentRecipients(env: any, potId: string, potOwnerId: string, senderId: string): Promise<Set<string>> {
  const recipients = new Set<string>();
  if (potOwnerId && potOwnerId !== senderId) {
    recipients.add(potOwnerId);
  }

  const collaboratorRows = await env.DB.prepare(`
    SELECT user_id
    FROM pot_collaborators
    WHERE pot_id = ? AND user_id != ?
  `).bind(potId, senderId).all();

  for (const row of collaboratorRows.results || []) {
    if (row.user_id) {
      recipients.add(row.user_id);
    }
  }

  const viewerRows = await env.DB.prepare(`
    SELECT user_id
    FROM pot_viewers
    WHERE pot_id = ? AND user_id != ?
  `).bind(potId, senderId).all();

  for (const row of viewerRows.results || []) {
    if (row.user_id) {
      recipients.add(row.user_id);
    }
  }

  return recipients;
}

async function createCommentNotifications(
  env: any,
  pot: any,
  senderId: string,
  senderName: string,
  recipients: Set<string>,
  content: string,
  meta: { commentId: string; parentCommentId?: string | null; replyToName?: string | null }
): Promise<void> {
  const title = meta.parentCommentId
    ? `花盆「${pot.name}」有新回复`
    : `花盆「${pot.name}」有新留言`;
  const summary = meta.parentCommentId
    ? `${senderName} 回复 ${meta.replyToName || '一位成员'}：${content}`
    : `${senderName}：${content}`;

  const baseExtra = {
    potId: pot.id,
    senderName,
    comment: content,
    commentId: meta.commentId,
    parentCommentId: meta.parentCommentId || null,
    replyToName: meta.replyToName || null
  };

  const inserts = [
    env.DB.prepare(`
      INSERT INTO messages (user_id, sender_id, type, status, title, content, related_id, extra_data)
      VALUES (?, ?, 'pot_comment', 'read', ?, ?, ?, ?)
    `).bind(
      senderId,
      senderId,
      title,
      summary,
      pot.id,
      JSON.stringify({ ...baseExtra, selfCopy: true })
    )
  ];

  for (const recipientId of recipients) {
    inserts.push(
      env.DB.prepare(`
        INSERT INTO messages (user_id, sender_id, type, title, content, related_id, extra_data)
        VALUES (?, ?, 'pot_comment', ?, ?, ?, ?)
      `).bind(
        recipientId,
        senderId,
        title,
        summary,
        pot.id,
        JSON.stringify({ ...baseExtra, selfCopy: false })
      )
    );
  }

  await env.DB.batch(inserts);
}

export async function handleMessagesRequest(
  request: Request,
  env: any,
  path: string,
  userId: string | null
): Promise<Response> {
  // GET /api/messages - 获取消息列表
  if (request.method === 'GET' && path === '/api/messages') {
    if (!userId) return errorResponse('Authentication required', 401);
    try {
      const messages = await env.DB.prepare(`
        SELECT
          m.*,
          sender.display_name as sender_display_name,
          sender.email as sender_email
        FROM messages m
        LEFT JOIN users sender ON sender.id = m.sender_id
        WHERE m.user_id = ?
        ORDER BY created_at DESC 
        LIMIT 100
      `).bind(userId).all();
      return jsonResponse({ success: true, data: messages.results });
    } catch (error: any) {
      return errorResponse(error.message, 500);
    }
  }

  // GET /api/messages/pot-comments/:potId - 获取花盆留言流
  if (request.method === 'GET' && path.match(/^\/api\/messages\/pot-comments\/[^/]+$/)) {
    try {
      const potId = path.split('/').pop();
      const url = new URL(request.url);
      const shareToken = url.searchParams.get('shareToken')?.trim();
      if (!potId) return errorResponse('Pot ID required', 400);

      const accessResult = await getPotWithAccess(env, potId, userId, shareToken, { allowPublicShare: true, allowViewer: true });
      if (accessResult.error) return accessResult.error;

      const { results } = await env.DB.prepare(`
        SELECT
          c.id,
          c.pot_id,
          c.sender_id,
          c.parent_comment_id,
          c.content,
          c.created_at,
          u.display_name,
          u.email
        FROM pot_comments c
        LEFT JOIN users u ON u.id = c.sender_id
        WHERE c.pot_id = ?
        ORDER BY c.created_at ASC, c.id ASC
        LIMIT 200
      `).bind(potId).all();

      const topLevelComments: any[] = [];
      const commentMap = new Map<string, any>();
      for (const row of results || []) {
        const item = {
          id: row.id,
          senderId: row.sender_id,
          senderName: pickSenderName(row),
          comment: row.content || '',
          createdAt: row.created_at,
          replies: [],
          latestReply: null,
          isLegacy: false
        };

        if (!row.parent_comment_id) {
          topLevelComments.push(item);
          commentMap.set(row.id, item);
          continue;
        }

        const parent = commentMap.get(row.parent_comment_id);
        if (!parent) continue;

        const reply = {
          id: row.id,
          senderId: row.sender_id,
          senderName: pickSenderName(row),
          comment: row.content || '',
          createdAt: row.created_at
        };

        parent.replies.push(reply);

        if (!parent.latestReply || `${reply.createdAt}|${reply.id}` > `${parent.latestReply.createdAt}|${parent.latestReply.id}`) {
          parent.latestReply = reply;
        }
      }

      const legacyRows = await env.DB.prepare(`
        SELECT
          id,
          sender_id,
          content,
          extra_data,
          created_at
        FROM messages
        WHERE related_id = ?
          AND type = 'pot_comment'
        ORDER BY created_at DESC, id DESC
        LIMIT 60
      `).bind(potId).all();

      const seen = new Set<string>();
      for (const row of legacyRows.results || []) {
        const extra = parseExtraData(row.extra_data);
        if (extra.commentId) continue;

        const item = {
          id: `legacy_${row.id}`,
          senderId: row.sender_id,
          senderName: extra.senderName || '一位成员',
          comment: extra.comment || row.content || '',
          createdAt: row.created_at,
          replies: [],
          latestReply: null,
          isLegacy: true
        };
        const dedupeKey = `${item.senderId || ''}|${item.comment}|${item.createdAt}`;
        if (seen.has(dedupeKey) || !item.comment) continue;
        seen.add(dedupeKey);
        topLevelComments.push(item);
      }

      topLevelComments.sort((a, b) => `${a.createdAt}|${a.id}`.localeCompare(`${b.createdAt}|${b.id}`));

      return jsonResponse({ success: true, data: topLevelComments.slice(-60) });
    } catch (error: any) {
      return errorResponse(error.message, 500);
    }
  }

  // POST /api/messages/pot-comment - 发送植物留言
  if (request.method === 'POST' && path === '/api/messages/pot-comment') {
    if (!userId) return errorResponse('Authentication required', 401);
    try {
      const body = await request.json() as { potId?: string; content?: string; shareToken?: string };
      const potId = body.potId?.trim();
      const content = body.content?.trim();
      const shareToken = body.shareToken?.trim();

      if (!potId) return errorResponse('Pot ID required', 400);
      if (!content) return errorResponse('Comment content required', 400);

      const accessResult = await getPotWithAccess(env, potId, userId, shareToken, { allowPublicShare: false, allowViewer: true });
      if (accessResult.error) return accessResult.error;
      const pot = accessResult.pot;
      if (String(pot.status || 'active').toLowerCase() === 'archived') {
        return errorResponse('Archived pot is read-only', 403);
      }

      const sender = await env.DB.prepare(`
        SELECT display_name, email
        FROM users
        WHERE id = ?
      `).bind(userId).first();
      const senderName = sender?.display_name || sender?.email || '一位成员';

      const commentId = createCommentId();
      await env.DB.prepare(`
        INSERT INTO pot_comments (id, pot_id, sender_id, content)
        VALUES (?, ?, ?, ?)
      `).bind(commentId, potId, userId, content).run();

      const recipients = await getCommentRecipients(env, potId, pot.user_id, userId);
      await createCommentNotifications(env, pot, userId, senderName, recipients, content, {
        commentId,
        parentCommentId: null,
        replyToName: null
      });

      return jsonResponse({ success: true, data: { recipientCount: recipients.size, commentId } });
    } catch (error: any) {
      return errorResponse(error.message, 500);
    }
  }

  // POST /api/messages/pot-comment-reply - 回复植物留言
  if (request.method === 'POST' && path === '/api/messages/pot-comment-reply') {
    if (!userId) return errorResponse('Authentication required', 401);
    try {
      const body = await request.json() as { commentId?: string; content?: string; shareToken?: string };
      const commentId = body.commentId?.trim();
      const content = body.content?.trim();
      const shareToken = body.shareToken?.trim();

      if (!commentId) return errorResponse('Comment ID required', 400);
      if (!content) return errorResponse('Reply content required', 400);

      const parentComment = await env.DB.prepare(`
        SELECT
          c.id,
          c.pot_id,
          c.sender_id,
          c.parent_comment_id,
          u.display_name,
          u.email
        FROM pot_comments c
        LEFT JOIN users u ON u.id = c.sender_id
        WHERE c.id = ?
      `).bind(commentId).first();

      if (!parentComment) return errorResponse('Comment not found', 404);
      if (parentComment.parent_comment_id) return errorResponse('Only top-level comments can be replied to', 400);

      const accessResult = await getPotWithAccess(env, parentComment.pot_id, userId, shareToken, { allowPublicShare: false, allowViewer: true });
      if (accessResult.error) return accessResult.error;
      const pot = accessResult.pot;
      if (String(pot.status || 'active').toLowerCase() === 'archived') {
        return errorResponse('Archived pot is read-only', 403);
      }

      const sender = await env.DB.prepare(`
        SELECT display_name, email
        FROM users
        WHERE id = ?
      `).bind(userId).first();
      const senderName = sender?.display_name || sender?.email || '一位成员';
      const replyToName = pickSenderName(parentComment);

      const replyId = createCommentId('reply');
      await env.DB.prepare(`
        INSERT INTO pot_comments (id, pot_id, sender_id, parent_comment_id, content)
        VALUES (?, ?, ?, ?, ?)
      `).bind(replyId, parentComment.pot_id, userId, commentId, content).run();

      const recipients = await getCommentRecipients(env, parentComment.pot_id, pot.user_id, userId);
      await createCommentNotifications(env, pot, userId, senderName, recipients, content, {
        commentId: replyId,
        parentCommentId: commentId,
        replyToName
      });

      return jsonResponse({
        success: true,
        data: {
          recipientCount: recipients.size,
          commentId: replyId,
          replyToName,
          preview: `${trimCommentText(senderName, 12)}：${trimCommentText(content, 16)}`
        }
      });
    } catch (error: any) {
      return errorResponse(error.message, 500);
    }
  }

  // DELETE /api/messages/pot-comment/:id - 删除留言或回复
  if (request.method === 'DELETE' && path.match(/^\/api\/messages\/pot-comment\/[^/]+$/)) {
    if (!userId) return errorResponse('Authentication required', 401);
    try {
      const commentId = path.split('/').pop();
      if (!commentId) return errorResponse('Comment ID required', 400);

      const comment = await env.DB.prepare(`
        SELECT
          c.id,
          c.pot_id,
          c.sender_id,
          c.parent_comment_id,
          p.user_id as pot_owner_id
        FROM pot_comments c
        JOIN pots p ON p.id = c.pot_id
        WHERE c.id = ?
      `).bind(commentId).first();

      if (!comment) return errorResponse('Comment not found', 404);

      const accessResult = await getPotWithAccess(env, comment.pot_id, userId, null, { allowPublicShare: false, allowViewer: true });
      if (accessResult.error) return accessResult.error;

      const canDelete = comment.sender_id === userId || comment.pot_owner_id === userId;
      if (!canDelete) {
        return errorResponse('Only the comment author or pot owner can delete this comment', 403);
      }

      if (!comment.parent_comment_id) {
        await env.DB.batch([
          env.DB.prepare(`DELETE FROM pot_comments WHERE parent_comment_id = ?`).bind(commentId),
          env.DB.prepare(`DELETE FROM pot_comments WHERE id = ?`).bind(commentId)
        ]);
      } else {
        await env.DB.prepare(`DELETE FROM pot_comments WHERE id = ?`).bind(commentId).run();
      }

      return jsonResponse({ success: true, data: { commentId } });
    } catch (error: any) {
      return errorResponse(error.message, 500);
    }
  }

  // GET /api/messages/unread-count - 获取未读数
  if (request.method === 'GET' && path === '/api/messages/unread-count') {
    if (!userId) return errorResponse('Authentication required', 401);
    try {
      const unread: any = await env.DB.prepare(`
        SELECT COUNT(*) as unread_count FROM messages 
        WHERE user_id = ? AND status = 'unread'
      `).bind(userId).first();
      return jsonResponse({ success: true, count: unread?.unread_count || 0 });
    } catch (error: any) {
      return errorResponse(error.message, 500);
    }
  }

  // POST /api/messages/:id/read - 标记已读
  if (request.method === 'POST' && path.match(/^\/api\/messages\/[^/]+\/read$/)) {
    if (!userId) return errorResponse('Authentication required', 401);
    try {
      const id = path.split('/')[3];
      await env.DB.prepare(`
        UPDATE messages SET status = 'read' 
        WHERE id = ? AND user_id = ? AND status = 'unread'
      `).bind(id, userId).run();
      return jsonResponse({ success: true });
    } catch (error: any) {
      return errorResponse(error.message, 500);
    }
  }

  // POST /api/messages/read-all - 全部标记已读
  if (request.method === 'POST' && path === '/api/messages/read-all') {
    if (!userId) return errorResponse('Authentication required', 401);
    try {
      await env.DB.prepare(`
        UPDATE messages SET status = 'read' 
        WHERE user_id = ? AND status = 'unread'
      `).bind(userId).run();
      return jsonResponse({ success: true });
    } catch (error: any) {
      return errorResponse(error.message, 500);
    }
  }

  // DELETE /api/messages/:id - 删除单条消息
  const deleteMatch = path.match(/^\/api\/messages\/([^/]+)$/);
  if (request.method === 'DELETE' && deleteMatch) {
    if (!userId) return errorResponse('Authentication required', 401);
    try {
      const id = deleteMatch[1];
      await env.DB.prepare(`
        DELETE FROM messages 
        WHERE id = ? AND user_id = ?
      `).bind(id, userId).run();
      return jsonResponse({ success: true });
    } catch (error: any) {
      return errorResponse(error.message, 500);
    }
  }

  // POST /api/messages/clear-read - 清理已读消息
  if (request.method === 'POST' && path === '/api/messages/clear-read') {
    if (!userId) return errorResponse('Authentication required', 401);
    try {
      await env.DB.prepare(`
        DELETE FROM messages 
        WHERE user_id = ? AND (status = 'read' OR status = 'processed')
      `).bind(userId).run();
      return jsonResponse({ success: true });
    } catch (error: any) {
      return errorResponse(error.message, 500);
    }
  }

  return errorResponse('Not Found', 404);
}
