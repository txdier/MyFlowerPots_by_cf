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

function hasCommentAccess(row: any, allowViewer: boolean): boolean {
  return row?.is_owner === 1
    || row?.is_collaborator === 1
    || (allowViewer && row?.is_viewer === 1);
}

async function markUserMessageRead(env: any, messageId: string, userId: string) {
  return env.DB.prepare(`
    UPDATE messages SET status = 'read'
    WHERE id = ? AND user_id = ? AND status = 'unread'
  `).bind(messageId, userId).run();
}

async function deleteUserMessage(env: any, messageId: string, userId: string) {
  return env.DB.prepare(`
    DELETE FROM messages
    WHERE id = ? AND user_id = ?
  `).bind(messageId, userId).run();
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

async function getCommentPotContext(env: any, potId: string, userId: string, allowViewer: boolean) {
  const row = await env.DB.prepare(`
    SELECT
      p.id,
      p.user_id,
      p.name,
      p.share_token,
      p.is_shared,
      COALESCE(p.status, 'active') as status,
      sender.display_name as sender_display_name,
      sender.email as sender_email,
      CASE WHEN p.user_id = ? THEN 1 ELSE 0 END as is_owner,
      CASE WHEN pc.user_id IS NULL THEN 0 ELSE 1 END as is_collaborator,
      CASE WHEN pv.user_id IS NULL THEN 0 ELSE 1 END as is_viewer
    FROM pots p
    LEFT JOIN users sender
      ON sender.id = ?
    LEFT JOIN pot_collaborators pc
      ON pc.pot_id = p.id AND pc.user_id = ?
    LEFT JOIN pot_viewers pv
      ON pv.pot_id = p.id AND pv.user_id = ?
    WHERE p.id = ?
  `).bind(userId, userId, userId, userId, potId).first();

  if (!row) {
    return { error: errorResponse('Pot not found', 404) };
  }

  if (!hasCommentAccess(row, allowViewer)) {
    return { error: errorResponse('Access denied', 403) };
  }

  return {
    pot: {
      id: row.id,
      user_id: row.user_id,
      name: row.name,
      share_token: row.share_token,
      is_shared: row.is_shared,
      status: row.status
    },
    senderName: pickSenderName({
      display_name: row.sender_display_name,
      email: row.sender_email
    })
  };
}

async function getReplyCommentContext(env: any, commentId: string, userId: string, allowViewer: boolean) {
  const row = await env.DB.prepare(`
    SELECT
      c.id as comment_id,
      c.pot_id,
      c.sender_id as parent_sender_id,
      c.parent_comment_id,
      parent_sender.display_name as parent_display_name,
      parent_sender.email as parent_email,
      p.id,
      p.user_id,
      p.name,
      p.share_token,
      p.is_shared,
      COALESCE(p.status, 'active') as status,
      sender.display_name as sender_display_name,
      sender.email as sender_email,
      CASE WHEN p.user_id = ? THEN 1 ELSE 0 END as is_owner,
      CASE WHEN pc.user_id IS NULL THEN 0 ELSE 1 END as is_collaborator,
      CASE WHEN pv.user_id IS NULL THEN 0 ELSE 1 END as is_viewer
    FROM pot_comments c
    JOIN pots p
      ON p.id = c.pot_id
    LEFT JOIN users parent_sender
      ON parent_sender.id = c.sender_id
    LEFT JOIN users sender
      ON sender.id = ?
    LEFT JOIN pot_collaborators pc
      ON pc.pot_id = p.id AND pc.user_id = ?
    LEFT JOIN pot_viewers pv
      ON pv.pot_id = p.id AND pv.user_id = ?
    WHERE c.id = ?
  `).bind(userId, userId, userId, userId, commentId).first();

  if (!row) {
    return { error: errorResponse('Comment not found', 404) };
  }

  if (row.parent_comment_id) {
    return { error: errorResponse('Only top-level comments can be replied to', 400) };
  }

  if (!hasCommentAccess(row, allowViewer)) {
    return { error: errorResponse('Access denied', 403) };
  }

  return {
    pot: {
      id: row.id,
      user_id: row.user_id,
      name: row.name,
      share_token: row.share_token,
      is_shared: row.is_shared,
      status: row.status
    },
    parentComment: {
      id: row.comment_id,
      pot_id: row.pot_id,
      sender_id: row.parent_sender_id,
      parent_comment_id: row.parent_comment_id,
      display_name: row.parent_display_name,
      email: row.parent_email
    },
    senderName: pickSenderName({
      display_name: row.sender_display_name,
      email: row.sender_email
    }),
    replyToName: pickSenderName({
      display_name: row.parent_display_name,
      email: row.parent_email
    })
  };
}

async function getCommentRecipients(env: any, potId: string, potOwnerId: string, senderId: string): Promise<Set<string>> {
  const recipients = new Set<string>();
  if (potOwnerId && potOwnerId !== senderId) {
    recipients.add(potOwnerId);
  }

  const memberRows = await env.DB.prepare(`
    SELECT user_id
    FROM pot_collaborators
    WHERE pot_id = ? AND user_id != ?
    UNION
    SELECT user_id
    FROM pot_viewers
    WHERE pot_id = ? AND user_id != ?
  `).bind(potId, senderId, potId, senderId).all();

  for (const row of memberRows.results || []) {
    if (row.user_id) {
      recipients.add(row.user_id);
    }
  }

  return recipients;
}

function buildCommentNotificationStatements(
  env: any,
  pot: any,
  senderId: string,
  senderName: string,
  recipients: Set<string>,
  content: string,
  meta: { commentId: string; parentCommentId?: string | null; replyToName?: string | null }
): any[] {
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

  return inserts;
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

      const accessResult = await getPotWithAccess(env, potId, userId, shareToken, { allowPublicShare: false, allowViewer: true });
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
      const body = await request.json() as { potId?: string; content?: string };
      const potId = body.potId?.trim();
      const content = body.content?.trim();

      if (!potId) return errorResponse('Pot ID required', 400);
      if (!content) return errorResponse('Comment content required', 400);

      const context = await getCommentPotContext(env, potId, userId, true);
      if (context.error) return context.error;
      const { pot, senderName } = context;
      if (String(pot.status || 'active').toLowerCase() === 'archived') {
        return errorResponse('Archived pot is read-only', 403);
      }

      const commentId = createCommentId();
      const recipients = await getCommentRecipients(env, potId, pot.user_id, userId);
      await env.DB.batch([
        env.DB.prepare(`
          INSERT INTO pot_comments (id, pot_id, sender_id, content)
          VALUES (?, ?, ?, ?)
        `).bind(commentId, potId, userId, content),
        ...buildCommentNotificationStatements(env, pot, userId, senderName, recipients, content, {
          commentId,
          parentCommentId: null,
          replyToName: null
        })
      ]);

      return jsonResponse({ success: true, data: { recipientCount: recipients.size, commentId } });
    } catch (error: any) {
      return errorResponse(error.message, 500);
    }
  }

  // POST /api/messages/pot-comment-reply - 回复植物留言
  if (request.method === 'POST' && path === '/api/messages/pot-comment-reply') {
    if (!userId) return errorResponse('Authentication required', 401);
    try {
      const body = await request.json() as { commentId?: string; content?: string };
      const commentId = body.commentId?.trim();
      const content = body.content?.trim();

      if (!commentId) return errorResponse('Comment ID required', 400);
      if (!content) return errorResponse('Reply content required', 400);

      const context = await getReplyCommentContext(env, commentId, userId, true);
      if (context.error) return context.error;
      const { pot, parentComment, senderName, replyToName } = context;
      if (String(pot.status || 'active').toLowerCase() === 'archived') {
        return errorResponse('Archived pot is read-only', 403);
      }

      const replyId = createCommentId('reply');
      const recipients = await getCommentRecipients(env, parentComment.pot_id, pot.user_id, userId);
      await env.DB.batch([
        env.DB.prepare(`
          INSERT INTO pot_comments (id, pot_id, sender_id, parent_comment_id, content)
          VALUES (?, ?, ?, ?, ?)
        `).bind(replyId, parentComment.pot_id, userId, commentId, content),
        ...buildCommentNotificationStatements(env, pot, userId, senderName, recipients, content, {
          commentId: replyId,
          parentCommentId: commentId,
          replyToName
        })
      ]);

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
	      await markUserMessageRead(env, id, userId);
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
	      await deleteUserMessage(env, id, userId);
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
