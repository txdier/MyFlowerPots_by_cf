import { jsonResponse, errorResponse } from '../utils/response-utils';
import {
  isDefaultImage,
  extractObjectKeyFromUrl,
  deleteFileFromR2
} from '../utils/storage-utils';

export async function handlePotsRequest(
  request: Request,
  env: any,
  ctx: any,
  path: string,
  url: URL,
  token: string | null
): Promise<Response> {
  await ensurePotsRuntimeSchema(env);
  // 1️⃣ 花盆列表
  if (request.method === 'GET' && path === '/api/pots') {
    return handleGetPots(request, env, url, token);
  }

  // 1️⃣ 花盆状态数量
  if (request.method === 'GET' && path === '/api/pots/counts') {
    return handleGetPotStatusCounts(env, token);
  }

  // 2️⃣ 花盆详情
  if (request.method === 'GET' && path.match(/^\/api\/pots\/[^/]+$/)) {
    return handleGetPotDetail(path, env, url, token);
  }

  // 3️⃣ 创建花盆
  if (request.method === 'POST' && path === '/api/pots') {
    return handleCreatePot(request, env, token);
  }

  // 4️⃣ 批量归档
  if (request.method === 'POST' && path === '/api/pots/archive') {
    return handleBatchArchivePots(request, env, token);
  }

  // 8️⃣ 重新排序 (New) - 必须在通用 ID 匹配之前
  if (request.method === 'PUT' && path === '/api/pots/reorder') {
    return handleReorderPots(request, env, url, token);
  }

  // 4️⃣ 归档 / 恢复花盆
  if (request.method === 'POST' && path.match(/^\/api\/pots\/[^/]+\/archive$/)) {
    return handleArchivePot(request, env, path, token);
  }

  if (request.method === 'POST' && path.match(/^\/api\/pots\/[^/]+\/restore$/)) {
    return handleRestorePot(env, path, token);
  }

  // 4️⃣ 更新花盆
  if (request.method === 'PUT' && path.match(/^\/api\/pots\/[^/]+$/)) {
    return handleUpdatePot(request, env, ctx, path, url, token);
  }

  // 5️⃣ 删除花盆
  if (request.method === 'DELETE' && path.match(/^\/api\/pots\/[^/]+$/)) {
    return handleDeletePot(env, ctx, path, url, token);
  }


  // 6️⃣ 养护记录
  if (request.method === 'GET' && path.match(/^\/api\/pots\/[^/]+\/care-records$/)) {
    return handleGetCareRecords(path, env, token);
  }

  // 7️⃣ 时间线
  if (request.method === 'GET' && path.match(/^\/api\/pots\/[^/]+\/timelines$/)) {
    return handleGetTimelines(path, env, token);
  }

  // 8️⃣ 花盆统计 (新增)
  if (request.method === 'GET' && path.match(/^\/api\/pots\/[^/]+\/stats$/)) {
    return handleGetPotStats(path, env, token);
  }

  return errorResponse('Not Found', 404);
}

async function ensurePotsRuntimeSchema(env: any): Promise<void> {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS pot_viewers (
      pot_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (pot_id, user_id)
    )
  `).run();
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS pot_collab_invites (
      id TEXT PRIMARY KEY,
      pot_id TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      revoked_at TEXT,
      max_views INTEGER DEFAULT 5,
      view_count INTEGER DEFAULT 0,
      claim_session_id TEXT,
      claimed_by_user_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_viewers_user ON pot_viewers(user_id)').run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_viewers_pot ON pot_viewers(pot_id)').run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_collab_invites_pot ON pot_collab_invites(pot_id)').run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_collab_invites_token ON pot_collab_invites(token)').run();

  const columns = [
    'ALTER TABLE pots ADD COLUMN show_comment_danmaku INTEGER DEFAULT 1',
    "ALTER TABLE pots ADD COLUMN status TEXT DEFAULT 'active'",
    'ALTER TABLE pots ADD COLUMN archived_at TEXT',
    'ALTER TABLE pots ADD COLUMN archive_reason TEXT',
    'ALTER TABLE pots ADD COLUMN archive_note TEXT'
  ];

  for (const statement of columns) {
    try {
      await env.DB.prepare(statement).run();
    } catch (error: any) {
      const message = String(error?.message || error || '');
      if (!message.includes('duplicate column name')) {
        throw error;
      }
    }
  }

  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_pots_user_status ON pots(user_id, status)').run();
}

async function handleGetPots(
  request: Request,
  env: any,
  url: URL,
  token: string | null
): Promise<Response> {
  // 安全加固：强制使用 Token 中的 userId，忽略 URL 中的查询参数，防止越权查看他人列表
  const userId = token;
  if (!userId) {
    return errorResponse('Authentication required', 401);
  }

  const statusParam = String(url.searchParams.get('status') || 'active').trim().toLowerCase();
  const status = ['active', 'archived', 'all'].includes(statusParam) ? statusParam : 'active';
  const selectedColumns = `
        id,
        user_id,
        name,
        plant_type,
        note,
        plant_date,
        image_url,
        last_care,
        last_care_action,
        COALESCE(status, 'active') as status,
        archived_at,
        archive_reason,
        archive_note,
        EXISTS(SELECT 1 FROM pot_collaborators WHERE pot_id = pots.id AND user_id = ?) as is_collaborator,
        EXISTS(SELECT 1 FROM pot_viewers WHERE pot_id = pots.id AND user_id = ?) as is_viewer,
        (SELECT COUNT(*) FROM pot_collaborators WHERE pot_id = pots.id) as collaborator_count,
        (SELECT COUNT(*) FROM pot_viewers WHERE pot_id = pots.id) as viewer_count
  `;

  if (status === 'archived') {
    const { results } = await env.DB
      .prepare(`
        SELECT
          ${selectedColumns}
        FROM pots
        WHERE COALESCE(status, 'active') = 'archived'
          AND (
            user_id = ?
            OR id IN (SELECT pot_id FROM pot_collaborators WHERE user_id = ?)
            OR id IN (SELECT pot_id FROM pot_viewers WHERE user_id = ?)
          )
        ORDER BY sort_order ASC, archived_at DESC, plant_date DESC
      `)
      .bind(userId, userId, userId, userId, userId)
      .all();

    return jsonResponse({
      success: true,
      data: results
    });
  }

  const statusClause = status === 'all'
    ? ''
    : "AND COALESCE(status, 'active') = 'active'";

  const { results } = await env.DB
    .prepare(`
      SELECT
        ${selectedColumns}
      FROM pots
      WHERE (
          user_id = ?
          OR id IN (SELECT pot_id FROM pot_collaborators WHERE user_id = ?)
          OR id IN (SELECT pot_id FROM pot_viewers WHERE user_id = ?)
        )
        ${statusClause}
      ORDER BY sort_order ASC, plant_date DESC
    `)
    .bind(userId, userId, userId, userId, userId)
    .all();

  return jsonResponse({
    success: true,
    data: results
  });
}

async function handleGetPotStatusCounts(env: any, token: string | null): Promise<Response> {
  const userId = token;
  if (!userId) {
    return errorResponse('Authentication required', 401);
  }

  const active = await env.DB.prepare(`
    SELECT COUNT(*) as count
    FROM pots
    WHERE COALESCE(status, 'active') = 'active'
      AND (
        user_id = ?
        OR id IN (SELECT pot_id FROM pot_collaborators WHERE user_id = ?)
        OR id IN (SELECT pot_id FROM pot_viewers WHERE user_id = ?)
      )
  `).bind(userId, userId, userId).first();

  const archived = await env.DB.prepare(`
    SELECT COUNT(*) as count
    FROM pots
    WHERE COALESCE(status, 'active') = 'archived'
      AND (
        user_id = ?
        OR id IN (SELECT pot_id FROM pot_collaborators WHERE user_id = ?)
        OR id IN (SELECT pot_id FROM pot_viewers WHERE user_id = ?)
      )
  `).bind(userId, userId, userId).first();

  return jsonResponse({
    success: true,
    data: {
      active: Number((active as any)?.count || 0),
      archived: Number((archived as any)?.count || 0)
    }
  });
}

async function handleGetPotDetail(path: string, env: any, url: URL, token: string | null): Promise<Response> {
  const potId = path.split('/')[3];

  // 安全加固：必须登录且只能查看属于自己的花盆
  const userId = token;
  if (!userId) {
    return errorResponse('Authentication required', 401);
  }

  const pot = await env.DB
    .prepare(`
      SELECT
        pots.id,
        pots.user_id,
        pots.name,
        pots.plant_type,
        pots.note,
        pots.plant_date,
        pots.image_url,
        pots.last_care,
        pots.last_care_action,
        pots.share_token,
        pots.is_shared,
        pots.show_comment_danmaku,
        COALESCE(pots.status, 'active') as status,
        pots.archived_at,
        pots.archive_reason,
        pots.archive_note,
        EXISTS(SELECT 1 FROM pot_collaborators WHERE pot_id = pots.id AND user_id = ?) as is_collaborator,
        EXISTS(SELECT 1 FROM pot_viewers WHERE pot_id = pots.id AND user_id = ?) as is_viewer,
        (SELECT COUNT(*) FROM pot_collaborators WHERE pot_id = pots.id) as collaborator_count,
        (SELECT COUNT(*) FROM pot_viewers WHERE pot_id = pots.id) as viewer_count,
        u.display_name as owner_name
      FROM pots
      LEFT JOIN users u ON pots.user_id = u.id
      WHERE pots.id = ?
        AND (
          pots.user_id = ?
          OR pots.id IN (SELECT pot_id FROM pot_collaborators WHERE user_id = ?)
          OR pots.id IN (SELECT pot_id FROM pot_viewers WHERE user_id = ?)
        )
    `)
    .bind(userId, userId, potId, userId, userId, userId)
    .first();

  if (!pot) {
    return errorResponse('not found', 404);
  }

  return jsonResponse({
    success: true,
    data: pot
  });
}

async function handleCreatePot(request: Request, env: any, token: string | null): Promise<Response> {
  try {
    const body = await request.json() as {
      id?: string;
      userId?: string;
      name?: string;
      plantType?: string;
      note?: string;
      plantDate?: string;
      imageUrl?: string;
      lastCare?: string;
      createInitialTimeline?: boolean | number | string;
    };
    const {
      id,
      userId,
      name,
      plantType,
      note,
      plantDate,
      imageUrl,
      lastCare,
      createInitialTimeline
    } = body;

    if (!id || !userId || !name) {
      return errorResponse('missing fields', 400);
    }

    // 安全加固：校验 Body 中的 userId 必须匹配 Token，防止给别人增加花盆
    if (userId !== token) {
      return errorResponse('Forbidden: You can only create pots for yourself', 403);
    }

    // 检查用户是否存在及获取状态
    const user = await env.DB
      .prepare('SELECT id, user_type, email_verified, max_pots, is_disabled FROM users WHERE id = ?')
      .bind(userId)
      .first();

    if (!user) {
      return errorResponse('User not found', 404);
    }

    // 安全加固：检查账号是否被禁用
    if (user.is_disabled === 1) {
      return errorResponse('Account disabled. Please contact support.', 403);
    }

    // 获取当前花盆数量
    const potCountResult = await env.DB
      .prepare('SELECT COUNT(*) as count FROM pots WHERE user_id = ?')
      .bind(userId)
      .first();
    const count = (potCountResult?.count as number) || 0;

    // 检查限制
    const userType = user.user_type;
    const isEmailVerified = user.email_verified === 1 || user.email_verified === true;

    // 确定上限
    let limit = 3; // 默认游客限制
    if (user.max_pots !== null && user.max_pots !== undefined) {
      // 优先使用个性化限额
      limit = user.max_pots;
    } else {
      // 否则使用系统默认阶梯
      if (user.user_type === 'email') {
        limit = user.email_verified === 1 ? 50 : 10;
      }
    }

    if (count >= limit) {
      if (userType === 'anonymous' || userType === 'device') {
        return errorResponse('您当前正以游客身份体验，最多可创建 3 个花盆。请注册账号以永久保存数据并解锁更多名额。', 403);
      } else if (userType === 'email' && !isEmailVerified) {
        return errorResponse('您的邮箱尚未验证，最多可创建 10 个花盆。请前往邮箱完成验证以保护账号安全并解锁更多可用花盆数量。', 403);
      } else if (userType === 'email' && isEmailVerified) {
        return errorResponse('您已达到 50 个花盆的上限。如需管理更多植物，请联系支持。', 403);
      } else {
        return errorResponse(`您已达到 ${limit} 个花盆的上限。`, 403);
      }
    }

    const createPotStatement = env.DB.prepare(`
        INSERT INTO pots (
          id,
          user_id,
          name,
          plant_type,
          note,
          plant_date,
          image_url,
          last_care
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        id,
        userId,
        name,
        plantType || null,
        note || null,
        plantDate || null,
        imageUrl || null,
        lastCare || null
      );

    const shouldCreateInitialTimeline =
      createInitialTimeline === true ||
      createInitialTimeline === 1 ||
      createInitialTimeline === 'true';

    if (shouldCreateInitialTimeline) {
      const now = new Date().toISOString();
      const timelineDate = plantDate || now.split('T')[0];
      const timelineImages = imageUrl ? JSON.stringify([imageUrl]) : null;
      const createTimelineStatement = env.DB.prepare(`
        INSERT INTO timelines (
          pot_id,
          date,
          description,
          images,
          created_at,
          user_id
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).bind(
        id,
        timelineDate,
        '开始记录这株植物的成长',
        timelineImages,
        now,
        userId
      );

      await env.DB.batch([createPotStatement, createTimelineStatement]);
    } else {
      await createPotStatement.run();
    }

    return jsonResponse({
      success: true,
      initialTimelineCreated: shouldCreateInitialTimeline
    });

  } catch (error) {
    console.error('Create pot error:', error);

    // 检查是否是外键约束错误
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('FOREIGN KEY constraint failed')) {
      return errorResponse('User not found', 400);
    }

    return errorResponse('Failed to create pot', 500);
  }
}

function normalizeArchiveText(value: unknown, fallback = ''): string {
  const text = String(value ?? '').trim();
  return (text || fallback).slice(0, 500);
}

async function sealArchivedPotAccess(env: any, potId: string, ownerId: string, potName: string): Promise<void> {
  const { results: collaborators } = await env.DB.prepare(`
    SELECT c.user_id
    FROM pot_collaborators c
    WHERE c.pot_id = ?
  `).bind(potId).all();

  await env.DB.batch([
    env.DB.prepare(`
      INSERT OR IGNORE INTO pot_viewers (pot_id, user_id)
      SELECT pot_id, user_id
      FROM pot_collaborators
      WHERE pot_id = ?
    `).bind(potId),
    env.DB.prepare(`
      DELETE FROM pot_collaborators
      WHERE pot_id = ?
    `).bind(potId),
    env.DB.prepare(`
      UPDATE pot_collab_invites
      SET revoked_at = datetime('now')
      WHERE pot_id = ?
        AND used_at IS NULL
        AND revoked_at IS NULL
    `).bind(potId)
  ]);

  const formerCollaborators = ((collaborators || []) as { user_id: string }[])
    .map(item => String(item.user_id || '').trim())
    .filter(Boolean);

  if (formerCollaborators.length === 0) return;

  const content = `花盆「${potName || '未命名'}」已由主人归档，您的共同照料权限已调整为只读查看。历史记录仍可查看，但不能继续编辑或新增养护记录。`;
  const notifications = formerCollaborators.map(targetUserId =>
    env.DB.prepare(`
      INSERT INTO messages (user_id, sender_id, type, title, content, related_id)
      VALUES (?, ?, 'system_info', '花盆已归档，权限已调整', ?, ?)
    `).bind(targetUserId, ownerId, content, potId)
  );

  try {
    await env.DB.batch(notifications);
  } catch (error) {
    console.error('Failed to send archive permission notifications:', error);
  }
}

async function handleArchivePot(
  request: Request,
  env: any,
  path: string,
  token: string | null
): Promise<Response> {
  try {
    const potId = path.split('/')[3];
    const userId = token;
    if (!userId) {
      return errorResponse('Authentication required', 401);
    }

    const body = await request.json().catch(() => ({})) as { reason?: string; note?: string };
    const reason = normalizeArchiveText(body.reason, '其他').slice(0, 80);
    const note = normalizeArchiveText(body.note);
    const archivedAt = new Date().toISOString();

    const pot = await env.DB.prepare(`
      SELECT id, name
      FROM pots
      WHERE id = ? AND user_id = ?
    `).bind(potId, userId).first();

    if (!pot) {
      return errorResponse('Pot not found or access denied', 404);
    }

    const result = await env.DB.prepare(`
      UPDATE pots
      SET status = 'archived',
          archived_at = ?,
          archive_reason = ?,
          archive_note = ?
      WHERE id = ? AND user_id = ?
    `).bind(archivedAt, reason, note || null, potId, userId).run();

    if (!result.meta || result.meta.changes === 0) {
      return errorResponse('Pot not found or access denied', 404);
    }

    await sealArchivedPotAccess(env, potId, userId, pot.name || '未命名');

    return jsonResponse({
      success: true,
      message: 'Pot archived successfully'
    });
  } catch (error) {
    console.error('Archive pot error:', error);
    return errorResponse('Failed to archive pot', 500);
  }
}

async function handleRestorePot(
  env: any,
  path: string,
  token: string | null
): Promise<Response> {
  try {
    const potId = path.split('/')[3];
    const userId = token;
    if (!userId) {
      return errorResponse('Authentication required', 401);
    }

    const result = await env.DB.prepare(`
      UPDATE pots
      SET status = 'active',
          archived_at = NULL,
          archive_reason = NULL,
          archive_note = NULL
      WHERE id = ? AND user_id = ?
    `).bind(potId, userId).run();

    if (!result.meta || result.meta.changes === 0) {
      return errorResponse('Pot not found or access denied', 404);
    }

    return jsonResponse({
      success: true,
      message: 'Pot restored successfully'
    });
  } catch (error) {
    console.error('Restore pot error:', error);
    return errorResponse('Failed to restore pot', 500);
  }
}

async function handleBatchArchivePots(
  request: Request,
  env: any,
  token: string | null
): Promise<Response> {
  try {
    const userId = token;
    if (!userId) {
      return errorResponse('Authentication required', 401);
    }

    const body = await request.json() as { potIds?: string[]; reason?: string; note?: string };
    const requestedPotIds = Array.isArray(body.potIds)
      ? Array.from(new Set(body.potIds.map(id => String(id || '').trim()).filter(Boolean)))
      : [];

    if (requestedPotIds.length === 0) {
      return errorResponse('Missing potIds', 400);
    }

    const placeholders = requestedPotIds.map(() => '?').join(', ');
    const { results: ownedPots } = await env.DB.prepare(`
      SELECT id, name FROM pots
      WHERE id IN (${placeholders}) AND user_id = ?
    `).bind(...requestedPotIds, userId).all();

    const ownedPotRows = (ownedPots || []) as { id: string; name?: string | null }[];
    const ownedPotIds = ownedPotRows.map((pot: any) => pot.id);
    if (ownedPotIds.length === 0) {
      return errorResponse('No owned pots found in the given IDs', 403);
    }

    const reason = normalizeArchiveText(body.reason, '其他').slice(0, 80);
    const note = normalizeArchiveText(body.note);
    const archivedAt = new Date().toISOString();
    const statements = ownedPotIds.map((potId: string) =>
      env.DB.prepare(`
        UPDATE pots
        SET status = 'archived',
            archived_at = ?,
            archive_reason = ?,
            archive_note = ?
        WHERE id = ? AND user_id = ?
      `).bind(archivedAt, reason, note || null, potId, userId)
    );

    await env.DB.batch(statements);
    for (const pot of ownedPotRows) {
      await sealArchivedPotAccess(env, pot.id, userId, pot.name || '未命名');
    }

    return jsonResponse({
      success: true,
      count: ownedPotIds.length,
      skipped: requestedPotIds.length - ownedPotIds.length
    });
  } catch (error) {
    console.error('Batch archive pots error:', error);
    return errorResponse('Failed to batch archive pots', 500);
  }
}

async function handleUpdatePot(
  request: Request,
  env: any,
  ctx: any,
  path: string,
  url: URL,
  token: string | null
): Promise<Response> {
  try {
    const potId = path.split('/')[3];
    const body = await request.json() as {
      name?: string;
      plantType?: string;
      note?: string;
      plantDate?: string;
      imageUrl?: string;
      lastCare?: string;
    };
    const {
      name,
      plantType,
      note,
      plantDate,
      imageUrl,
      lastCare
    } = body;

    // 验证用户权限
    const userId = token;
    if (!userId) {
      return errorResponse('Authentication required', 401);
    }

    // 检查花盆是否存在且属于当前用户
    const pot = await env.DB
      .prepare('SELECT id FROM pots WHERE id = ? AND user_id = ?')
      .bind(potId, userId)
      .first();

    if (!pot) {
      return errorResponse('Pot not found or access denied', 404);
    }

    // 构建更新语句（只更新提供的字段）
    const updates: string[] = [];
    const values: any[] = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }
    if (plantType !== undefined) {
      updates.push('plant_type = ?');
      values.push(plantType);
    }
    if (note !== undefined) {
      updates.push('note = ?');
      values.push(note);
    }
    if (plantDate !== undefined) {
      updates.push('plant_date = ?');
      values.push(plantDate);
    }
    if (imageUrl !== undefined) {
      updates.push('image_url = ?');
      values.push(imageUrl);
    }
    if (lastCare !== undefined) {
      updates.push('last_care = ?');
      values.push(lastCare);
    }

    if (updates.length === 0) {
      return errorResponse('No fields to update', 400);
    }

    // 构建 SQL 语句（包含 WHERE 条件）
    const sql = `
      UPDATE pots 
      SET ${updates.join(', ')}
      WHERE id = ? AND user_id = ?
    `;

    // 添加 WHERE 条件参数到值数组
    values.push(potId, userId);

    // 使用展开运算符绑定参数
    await env.DB.prepare(sql).bind(...values).run();

    return jsonResponse({
      success: true,
      message: 'Pot updated successfully'
    });

  } catch (error) {
    console.error('Update pot error:', error);
    return errorResponse('Failed to update pot', 500);
  }
}

async function handleDeletePot(
  env: any,
  ctx: any,
  path: string,
  url: URL,
  token: string | null
): Promise<Response> {
  try {
    const potId = path.split('/')[3];

    // 验证用户权限
    const userId = token;
    if (!userId) {
      return errorResponse('Authentication required', 401);
    }

    // 检查花盆是否存在且属于当前用户
    const pot = await env.DB
      .prepare('SELECT id, image_url FROM pots WHERE id = ? AND user_id = ?')
      .bind(potId, userId)
      .first();

    if (!pot) {
      return errorResponse('Pot not found or access denied', 404);
    }

    // 1. 删除花盆图片（如果不是默认图片）
    let imageDeleted = false;
    if (pot.image_url && !isDefaultImage(pot.image_url)) {
      const objectKey = extractObjectKeyFromUrl(pot.image_url);
      if (objectKey) {
        imageDeleted = await deleteFileFromR2(env, objectKey);
      }
    }

    // 2. 获取时间线图片（用于后续删除）
    const timelines = await env.DB
      .prepare('SELECT id, images FROM timelines WHERE pot_id = ?')
      .bind(potId)
      .all();

    // 3. 使用事务删除数据库记录
    await env.DB.batch([
      env.DB.prepare('DELETE FROM care_records WHERE pot_id = ?').bind(potId),
      env.DB.prepare('DELETE FROM timelines WHERE pot_id = ?').bind(potId),
      env.DB.prepare('DELETE FROM pots WHERE id = ? AND user_id = ?').bind(potId, userId)
    ]);

    // 4. 删除时间线图片（异步，不阻塞主流程）
    if (timelines.results && timelines.results.length > 0) {
      ctx.waitUntil((async () => {
        try {
          let totalImages = 0;
          let deletedImages = 0;

          for (const timeline of (timelines.results as any[])) {
            if (timeline.images) {
              try {
                const images = JSON.parse(timeline.images);
                if (Array.isArray(images)) {
                  totalImages += images.length;
                  for (const imageUrl of images) {
                    if (!isDefaultImage(imageUrl)) {
                      const objectKey = extractObjectKeyFromUrl(imageUrl);
                      if (objectKey) {
                        const deleted = await deleteFileFromR2(env, objectKey);
                        if (deleted) deletedImages++;
                      }
                    }
                  }
                }
              } catch (parseError) {
                console.error('解析时间线图片失败:', parseError, timeline.images);
              }
            }
          }
        } catch (asyncError) {
          console.error('异步删除时间线图片失败:', asyncError);
        }
      })());
    }

    return jsonResponse({
      success: true,
      message: 'Pot and related records deleted successfully',
      data: {
        imageDeleted,
        timelineCount: timelines.results?.length || 0
      }
    });

  } catch (error) {
    console.error('Delete pot error:', error);
    return errorResponse('Failed to delete pot', 500);
  }
}
interface CareRecord {
  id: string;
  type: string;
  action: string;
  care_date: string;
  description: string | null;
  image_url: string | null;
}

async function handleGetCareRecords(path: string, env: any, token: string | null): Promise<Response> {
  const potId = path.split('/')[3];

  // 安全加固：校验该花盆是否属于该用户 (主或协作者)
  const pot = await env.DB
    .prepare(`
      SELECT id FROM pots WHERE id = ? AND user_id = ?
      UNION
      SELECT pot_id FROM pot_collaborators WHERE pot_id = ? AND user_id = ?
      UNION
      SELECT pot_id FROM pot_viewers WHERE pot_id = ? AND user_id = ?
    `)
    .bind(potId, token, potId, token, potId, token)
    .first();

  if (!pot) {
    return errorResponse('Pot not found or access denied', 404);
  }

  const { results } = await env.DB
    .prepare(`
      SELECT
        cr.id,
        cr.type,
        cr.action,
        cr.care_date,
        cr.description,
        cr.image_url,
        u.display_name as operator_name
      FROM care_records cr
      LEFT JOIN users u ON cr.user_id = u.id
      WHERE cr.pot_id = ?
      ORDER BY cr.care_date DESC, cr.id DESC
    `)
    .bind(potId)
    .all();

  return jsonResponse({
    success: true,
    data: (results as unknown as (CareRecord & { operator_name: string | null })[]).map(r => ({
      ...r,
      date: r.care_date,
      imageUrl: r.image_url,
      operatorName: r.operator_name || null
    }))
  });
}

async function handleGetTimelines(path: string, env: any, token: string | null): Promise<Response> {
  const potId = path.split('/')[3];

  // 安全加固：校验该花盆是否属于该用户 (主或协作者)
  const pot = await env.DB
    .prepare(`
      SELECT id FROM pots WHERE id = ? AND user_id = ?
      UNION
      SELECT pot_id FROM pot_collaborators WHERE pot_id = ? AND user_id = ?
      UNION
      SELECT pot_id FROM pot_viewers WHERE pot_id = ? AND user_id = ?
    `)
    .bind(potId, token, potId, token, potId, token)
    .first();

  if (!pot) {
    return errorResponse('Pot not found or access denied', 404);
  }

  const { results } = await env.DB
    .prepare(`
      SELECT
        t.id,
        t.date,
        t.description,
        t.images,
        t.video,
        t.created_at,
        u.display_name as operator_name
      FROM timelines t
      LEFT JOIN users u ON t.user_id = u.id
      WHERE t.pot_id = ?
      ORDER BY t.date DESC, t.id DESC
    `)
    .bind(potId)
    .all();

  return jsonResponse({
    success: true,
    data: (results as any[]).map(r => ({
      ...r,
      operatorName: r.operator_name || null
    }))
  });
}

async function handleReorderPots(
  request: Request,
  env: any,
  url: URL,
  token: string | null
): Promise<Response> {
  try {
    const body = await request.json();
    const { potIds } = body as { potIds: string[] };

    if (!Array.isArray(potIds)) {
      return errorResponse('Invalid potIds, expected array', 400);
    }

    const userId = token;
    if (!userId) {
      return errorResponse('Authentication required', 401);
    }

    const stmts = potIds.map((id, index) => {
      return env.DB.prepare('UPDATE pots SET sort_order = ? WHERE id = ? AND user_id = ?')
        .bind(index, id, userId);
    });

    await env.DB.batch(stmts);

    return jsonResponse({
      success: true,
      message: 'Pots reordered successfully'
    });
  } catch (error) {
    console.error('Reorder pots error:', error);
    return errorResponse('Failed to reorder pots', 500);
  }
}

// 花盆养护统计
async function handleGetPotStats(path: string, env: any, token: string | null): Promise<Response> {
  const potId = path.split('/')[3];

  // 安全加固：校验该花盆是否属于该用户 (主或协作者)
  const pot = await env.DB
    .prepare(`
      SELECT id FROM pots WHERE id = ? AND user_id = ?
      UNION
      SELECT pot_id FROM pot_collaborators WHERE pot_id = ? AND user_id = ?
      UNION
      SELECT pot_id FROM pot_viewers WHERE pot_id = ? AND user_id = ?
    `)
    .bind(potId, token, potId, token, potId, token)
    .first();

  if (!pot) {
    return errorResponse('Pot not found or access denied', 404);
  }

  try {
    // 1. 获取近30天养护记录统计 (按类型分组)
    const recentStats = await env.DB.prepare(`
      SELECT 
        type, 
        COUNT(*) as count,
        MAX(care_date) as last_date
      FROM care_records 
      WHERE pot_id = ? 
        AND care_date >= date('now', '-30 days')
      GROUP BY type
    `).bind(potId).all();

    // 2. 获取总体统计
    const totalStats = await env.DB.prepare(`
      SELECT 
        COUNT(*) as total_records,
        MIN(care_date) as first_care,
        MAX(care_date) as last_care,
        COUNT(DISTINCT care_date) as care_days
      FROM care_records WHERE pot_id = ?
    `).bind(potId).first();

    // 3. 按类型获取总计数
    const typeStats = await env.DB.prepare(`
      SELECT 
        type,
        COUNT(*) as total_count
      FROM care_records 
      WHERE pot_id = ?
      GROUP BY type
    `).bind(potId).all();

    return jsonResponse({
      success: true,
      data: {
        recent: recentStats.results || [],
        total: totalStats || { total_records: 0, care_days: 0 },
        byType: typeStats.results || []
      }
    });

  } catch (error) {
    console.error('Get pot stats error:', error);
    return errorResponse('Failed to get pot stats', 500);
  }
}
