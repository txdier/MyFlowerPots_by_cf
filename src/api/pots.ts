import { jsonResponse, errorResponse } from '../utils/response-utils';
import {
  deleteImagesFromR2
} from '../utils/storage-utils';
import { findAccessiblePot } from '../utils/pot-access-utils';
import {
  getEmptyPotActivityState,
  loadPotActivityStates,
  markPotActivityRead,
  recordPotActivity
} from '../utils/pot-activity-utils';

export async function handlePotsRequest(
  request: Request,
  env: any,
  ctx: any,
  path: string,
  url: URL,
  token: string | null
): Promise<Response> {
  // 1️⃣ 花盆列表
  if (request.method === 'GET' && path === '/api/pots') {
    return handleGetPots(request, env, url, token);
  }

  // 1️⃣ 花盆状态数量
  if (request.method === 'GET' && path === '/api/pots/counts') {
    return handleGetPotStatusCounts(env, token);
  }

  // 2️⃣ 详情页二级数据聚合
  if (request.method === 'GET' && path.match(/^\/api\/pots\/[^/]+\/detail-bundle$/)) {
    return handleGetPotDetailBundle(path, env, token);
  }

  // 2️⃣ 成员权限调整
  if (request.method === 'PATCH' && path.match(/^\/api\/pots\/[^/]+\/members\/[^/]+\/role$/)) {
    return handleUpdatePotMemberRole(request, env, path, token);
  }

  // 2️⃣ 花盆动态标记已读
  if (request.method === 'POST' && path.match(/^\/api\/pots\/[^/]+\/activity\/read$/)) {
    return handleMarkPotActivityRead(env, path, token);
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
    return handleGetTimelines(path, env, url, token);
  }

  // 8️⃣ 花盆统计 (新增)
  if (request.method === 'GET' && path.match(/^\/api\/pots\/[^/]+\/stats$/)) {
    return handleGetPotStats(path, env, token);
  }

  return errorResponse('Not Found', 404);
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
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10) || 50));
  const offset = (page - 1) * limit;
  const queryLimit = limit + 1;

  const cacheHeaders = {
    'Cache-Control': 'private, max-age=30',
    'Vary': 'Authorization'
  };

  const buildListResponse = async (rows: any[]) => {
    const data = rows.slice(0, limit);
    const hasMore = rows.length > limit;
    const activityStates = await loadPotActivityStates(env, userId, data.map((pot: any) => pot.id));
    const enrichedData = data.map((pot: any) => {
      const state = activityStates.get(String(pot.id)) || getEmptyPotActivityState();
      return {
        ...pot,
        has_new_activity: state.hasNewActivity ? 1 : 0,
        new_activity_count: state.newActivityCount,
        latest_activity_type: state.latestActivityType,
        latest_activity_summary: state.latestActivitySummary,
        latest_activity_at: state.latestActivityAt
      };
    });

    return jsonResponse({
      success: true,
      data: enrichedData,
      page,
      limit,
      hasMore,
      nextPage: hasMore ? page + 1 : null
    }, 200, cacheHeaders);
  };

  // 列表字段：保留首页权限判断所需字段。collaborator_count 只需判断是否存在，用于自有花盆的共同照料标识。
  const selectedColumns = `
        p.id,
        p.user_id,
        p.name,
        p.plant_type,
        p.note,
        p.plant_date,
        p.image_url,
        p.last_care,
        p.last_care_action,
        COALESCE(p.status, 'active') as status,
        p.archived_at,
        p.archive_reason,
        p.archive_note,
        CASE WHEN pc.user_id IS NULL THEN 0 ELSE 1 END as is_collaborator,
        CASE WHEN pv.user_id IS NULL THEN 0 ELSE 1 END as is_viewer,
        CASE WHEN EXISTS (
          SELECT 1
          FROM pot_collaborators owner_pc
          WHERE owner_pc.pot_id = p.id
          LIMIT 1
        ) THEN 1 ELSE 0 END as collaborator_count
  `;

  if (status === 'archived') {
    const { results } = await env.DB
      .prepare(`
        SELECT
          ${selectedColumns}
        FROM pots p
        LEFT JOIN pot_collaborators pc
          ON pc.pot_id = p.id AND pc.user_id = ?
        LEFT JOIN pot_viewers pv
          ON pv.pot_id = p.id AND pv.user_id = ?
        WHERE COALESCE(p.status, 'active') = 'archived'
          AND (
            p.user_id = ?
            OR pc.user_id IS NOT NULL
            OR pv.user_id IS NOT NULL
          )
        ORDER BY p.sort_order ASC, p.archived_at DESC, p.plant_date DESC
        LIMIT ? OFFSET ?
      `)
      .bind(userId, userId, userId, queryLimit, offset)
      .all();

    return buildListResponse(results as any[]);
  }

  const statusClause = status === 'all'
    ? ''
    : "AND COALESCE(p.status, 'active') = 'active'";

  const { results } = await env.DB
    .prepare(`
      SELECT
        ${selectedColumns}
      FROM pots p
      LEFT JOIN pot_collaborators pc
        ON pc.pot_id = p.id AND pc.user_id = ?
      LEFT JOIN pot_viewers pv
        ON pv.pot_id = p.id AND pv.user_id = ?
      WHERE (
          p.user_id = ?
          OR pc.user_id IS NOT NULL
          OR pv.user_id IS NOT NULL
        )
        ${statusClause}
      ORDER BY p.sort_order ASC, p.plant_date DESC
      LIMIT ? OFFSET ?
    `)
    .bind(userId, userId, userId, queryLimit, offset)
    .all();

  return buildListResponse(results as any[]);
}

async function handleMarkPotActivityRead(
  env: any,
  path: string,
  token: string | null
): Promise<Response> {
  const potId = decodeURIComponent(path.split('/')[3] || '');
  const userId = token;
  if (!userId) {
    return errorResponse('Authentication required', 401);
  }

  const pot = await findAccessiblePot(env, potId, userId, 'view');
  if (!pot) {
    return errorResponse('Pot not found or access denied', 404);
  }

  const latestEventId = await markPotActivityRead(env, potId, userId);
  return jsonResponse({
    success: true,
    data: {
      potId,
      latestEventId
    }
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

type ArchiveRequestBody = {
  reason?: string;
  note?: string;
  imageUrls?: unknown;
  archiveImageUrls?: unknown;
  imageUrlsByPotId?: Record<string, unknown>;
  archiveImagesByPotId?: Record<string, unknown>;
};

function normalizeArchiveImageUrls(value: unknown): string[] {
  let rawItems: unknown[] = [];

  if (Array.isArray(value)) {
    rawItems = value;
  } else if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      rawItems = Array.isArray(parsed) ? parsed : [trimmed];
    } catch {
      rawItems = [trimmed];
    }
  }

  return Array.from(new Set(
    rawItems
      .map(item => String(item || '').trim())
      .filter(Boolean)
  )).slice(0, 9);
}

function getArchiveImageUrlsForPot(body: ArchiveRequestBody, potId: string): string[] {
  const imagesByPotId = body.archiveImagesByPotId || body.imageUrlsByPotId;
  if (imagesByPotId && typeof imagesByPotId === 'object') {
    return normalizeArchiveImageUrls(imagesByPotId[potId]);
  }

  return normalizeArchiveImageUrls(body.archiveImageUrls ?? body.imageUrls);
}

function buildArchiveTimelineStatement(
  env: any,
  potId: string,
  userId: string,
  archivedAt: string,
  note: string,
  imageUrls: string[]
): any | null {
  if (imageUrls.length === 0) return null;

  const timelineDate = archivedAt.slice(0, 10);
  const description = normalizeArchiveText(note, '归档时留下的最后记录');

  return env.DB.prepare(`
    INSERT INTO timelines (
      pot_id,
      date,
      description,
      images,
      created_at,
      user_id
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    potId,
    timelineDate,
    description,
    JSON.stringify(imageUrls),
    archivedAt,
    userId
  );
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

  const owner = await env.DB.prepare('SELECT display_name, email FROM users WHERE id = ?').bind(ownerId).first();
  const ownerName = owner?.display_name || owner?.email || '有人';
  const content = `${ownerName} 已归档花盆「${potName || '未命名'}」，您的共同照料权限已调整为只读查看。历史记录仍可查看，但不能继续编辑或新增养护记录。`;
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

async function handleUpdatePotMemberRole(
  request: Request,
  env: any,
  path: string,
  token: string | null
): Promise<Response> {
  try {
    const match = path.match(/^\/api\/pots\/([^/]+)\/members\/([^/]+)\/role$/);
    if (!match) return errorResponse('Not Found', 404);

    const potId = decodeURIComponent(match[1]);
    const targetUserId = decodeURIComponent(match[2]);
    const userId = token;
    if (!userId) return errorResponse('Authentication required', 401);

    const body = await request.json() as { role?: string };
    const role = String(body.role || '').trim();
    if (role !== 'viewer' && role !== 'collaborator') {
      return errorResponse('Invalid member role', 400);
    }

    const pot = await findAccessiblePot(env, potId, userId, 'owner', {
      select: "p.id, p.user_id, p.name, COALESCE(p.status, 'active') as status"
    });
    if (!pot) return errorResponse('Pot not found or access denied', 404);
    if (targetUserId === pot.user_id) return errorResponse('Cannot change owner role', 400);
    if (role === 'collaborator' && pot.status === 'archived') {
      return errorResponse('Archived pots do not support collaborators', 400);
    }

    const target = await env.DB.prepare(`
      SELECT
        u.id,
        u.display_name,
        u.email,
        EXISTS(SELECT 1 FROM pot_collaborators WHERE pot_id = ? AND user_id = u.id) as is_collaborator,
        EXISTS(SELECT 1 FROM pot_viewers WHERE pot_id = ? AND user_id = u.id) as is_viewer
      FROM users u
      WHERE u.id = ?
    `).bind(potId, potId, targetUserId).first();
    if (!target || (!target.is_collaborator && !target.is_viewer)) {
      return errorResponse('Member not found', 404);
    }

    const alreadyTargetRole = role === 'collaborator'
      ? !!target.is_collaborator && !target.is_viewer
      : !!target.is_viewer && !target.is_collaborator;

    if (!alreadyTargetRole) {
      if (role === 'collaborator') {
        await env.DB.batch([
          env.DB.prepare(`
            INSERT OR IGNORE INTO pot_collaborators (pot_id, user_id, role)
            VALUES (?, ?, 'collaborator')
          `).bind(potId, targetUserId),
          env.DB.prepare('DELETE FROM pot_viewers WHERE pot_id = ? AND user_id = ?')
            .bind(potId, targetUserId)
        ]);
      } else {
        await env.DB.batch([
          env.DB.prepare(`
            INSERT OR IGNORE INTO pot_viewers (pot_id, user_id)
            VALUES (?, ?)
          `).bind(potId, targetUserId),
          env.DB.prepare('DELETE FROM pot_collaborators WHERE pot_id = ? AND user_id = ?')
            .bind(potId, targetUserId)
        ]);
      }

      const permissionLabel = role === 'collaborator' ? '共同照料' : '仅查看';
      const operator = await env.DB.prepare('SELECT display_name, email FROM users WHERE id = ?').bind(userId).first();
      const operatorName = operator?.display_name || operator?.email || '有人';
      const content = role === 'collaborator'
        ? `${operatorName} 已将您在花盆「${pot.name || '未命名'}」中的权限调整为共同照料。您现在可以新增和编辑养护、时间线、提醒。`
        : `${operatorName} 已将您在花盆「${pot.name || '未命名'}」中的权限调整为仅查看。您仍可查看记录，但不能新增或编辑养护、时间线、提醒。`;
      try {
        await env.DB.prepare(`
          INSERT INTO messages (user_id, sender_id, type, title, content, related_id)
          VALUES (?, ?, 'system_info', ?, ?, ?)
        `).bind(targetUserId, userId, `花盆权限已调整为${permissionLabel}`, content, potId).run();
      } catch (error) {
        console.error('Failed to send member role update notification:', error);
      }
    }

    return jsonResponse({
      success: true,
      data: {
        potId,
        userId: targetUserId,
        role
      }
    });
  } catch (error) {
    console.error('Update pot member role error:', error);
    return errorResponse('Failed to update member role', 500);
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

    const body = await request.json().catch(() => ({})) as ArchiveRequestBody;
    const reason = normalizeArchiveText(body.reason, '其他').slice(0, 80);
    const note = normalizeArchiveText(body.note);
    const imageUrls = getArchiveImageUrlsForPot(body, potId);
    const archivedAt = new Date().toISOString();

    const pot = await findAccessiblePot(env, potId, userId, 'owner', {
      select: 'p.id, p.name'
    });

    if (!pot) {
      return errorResponse('Pot not found or access denied', 404);
    }

    const updateStatement = env.DB.prepare(`
      UPDATE pots
	      SET status = 'archived',
	          archived_at = ?,
	          archive_reason = ?,
	          archive_note = ?
	      WHERE id = ?
	    `).bind(archivedAt, reason, note || null, potId);

    const statements = [updateStatement];
    const timelineStatement = buildArchiveTimelineStatement(env, potId, userId, archivedAt, note, imageUrls);
    if (timelineStatement) statements.push(timelineStatement);

    const archiveResults = await env.DB.batch(statements);
    const result = Array.isArray(archiveResults) ? archiveResults[0] : archiveResults;

    if (!result.meta || result.meta.changes === 0) {
      return errorResponse('Pot not found or access denied', 404);
    }

    await sealArchivedPotAccess(env, potId, userId, pot.name || '未命名');
    if (timelineStatement) {
      await recordPotActivity(env, potId, userId, 'archive_timeline_created', '归档时留下新轨迹', archivedAt);
    }

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

    const pot = await findAccessiblePot(env, potId, userId, 'owner');
    if (!pot) {
      return errorResponse('Pot not found or access denied', 404);
    }

    const result = await env.DB.prepare(`
      UPDATE pots
	      SET status = 'active',
	          archived_at = NULL,
	          archive_reason = NULL,
	          archive_note = NULL
	      WHERE id = ?
	    `).bind(potId).run();

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

    const body = await request.json() as ArchiveRequestBody & { potIds?: string[] };
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

    const statements: any[] = [];
    const activityPotIds: string[] = [];
    for (const potId of ownedPotIds) {
      statements.push(env.DB.prepare(`
        UPDATE pots
        SET status = 'archived',
            archived_at = ?,
            archive_reason = ?,
            archive_note = ?
        WHERE id = ? AND user_id = ?
      `).bind(archivedAt, reason, note || null, potId, userId)
      );

      const imageUrls = getArchiveImageUrlsForPot(body, potId);
      const timelineStatement = buildArchiveTimelineStatement(env, potId, userId, archivedAt, note, imageUrls);
      if (timelineStatement) {
        statements.push(timelineStatement);
        activityPotIds.push(potId);
      }
    }

    await env.DB.batch(statements);
    for (const pot of ownedPotRows) {
      await sealArchivedPotAccess(env, pot.id, userId, pot.name || '未命名');
    }
    for (const potId of activityPotIds) {
      await recordPotActivity(env, potId, userId, 'archive_timeline_created', '归档时留下新轨迹', archivedAt);
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

    const pot = await findAccessiblePot(env, potId, userId, 'owner', {
      allowArchived: false,
      select: `
        p.id,
        p.name,
        p.plant_type,
        p.note,
        p.plant_date,
        p.image_url,
        COALESCE(p.status, 'active') as status
      `
    });

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
	      WHERE id = ?
	    `;
	
	    // 添加 WHERE 条件参数到值数组
	    values.push(potId);

    // 使用展开运算符绑定参数
    await env.DB.prepare(sql).bind(...values).run();
    const contentFieldsChanged = [
      [name, pot.name],
      [plantType, pot.plant_type],
      [note, pot.note],
      [plantDate, pot.plant_date],
      [imageUrl, pot.image_url]
    ].some(([nextValue, oldValue]) => (
      nextValue !== undefined && String(nextValue ?? '').trim() !== String(oldValue ?? '').trim()
    ));

    if (contentFieldsChanged) {
      await recordPotActivity(env, potId, userId, 'pot_updated', '更新植物信息');
    }

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

    const pot = await findAccessiblePot(env, potId, userId, 'owner', {
      select: 'p.id, p.image_url'
    });

    if (!pot) {
      return errorResponse('Pot not found or access denied', 404);
    }

    const imageDeleteResult = await deleteImagesFromR2(env, pot.image_url);
    const imageDeleted = imageDeleteResult.success > 0;

    // 2. 获取记录图片（用于后续删除）
    const timelines = await env.DB
      .prepare('SELECT id, images FROM timelines WHERE pot_id = ?')
      .bind(potId)
      .all();
    const careRecords = await env.DB
      .prepare('SELECT id, image_url FROM care_records WHERE pot_id = ?')
      .bind(potId)
      .all();

    // 3. 使用事务删除数据库记录
    await env.DB.batch([
	      env.DB.prepare('DELETE FROM care_records WHERE pot_id = ?').bind(potId),
	      env.DB.prepare('DELETE FROM timelines WHERE pot_id = ?').bind(potId),
	      env.DB.prepare('DELETE FROM pots WHERE id = ?').bind(potId)
	    ]);

    // 4. 删除记录图片（异步，不阻塞主流程）
    if ((timelines.results && timelines.results.length > 0) || (careRecords.results && careRecords.results.length > 0)) {
      ctx.waitUntil((async () => {
        try {
          for (const timeline of (timelines.results as any[])) {
            if (timeline.images) {
              await deleteImagesFromR2(env, timeline.images);
            }
          }
          for (const record of (careRecords.results as any[])) {
            if (record.image_url) {
              await deleteImagesFromR2(env, record.image_url);
            }
          }
        } catch (asyncError) {
          console.error('异步删除记录图片失败:', asyncError);
        }
      })());
    }

    return jsonResponse({
      success: true,
      message: 'Pot and related records deleted successfully',
      data: {
	        imageDeleted,
	        timelineCount: timelines.results?.length || 0,
          careRecordCount: careRecords.results?.length || 0
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

function parseExtraData(raw: any): any {
  if (!raw) return {};
  try {
    return JSON.parse(String(raw));
  } catch {
    return {};
  }
}

function pickSenderName(row: any): string {
  return row?.display_name || row?.sender_display_name || row?.email || row?.sender_email || '一位成员';
}

function mapCareRecord(row: any) {
  return {
    id: row.id,
    potId: row.pot_id,
    type: row.type,
    action: row.action,
    description: row.description,
    date: row.care_date,
    care_date: row.care_date,
    imageUrl: row.image_url || null,
    image_url: row.image_url || null,
    createdAt: row.created_at,
    operatorName: row.operator_name || null
  };
}

async function getCareRecordsForBundle(env: any, potId: string): Promise<any[]> {
  const { results } = await env.DB
    .prepare(`
      SELECT
        cr.id,
        cr.pot_id,
        cr.type,
        cr.action,
        cr.description,
        cr.care_date,
        cr.image_url,
        cr.created_at,
        u.display_name as operator_name
      FROM care_records cr
      LEFT JOIN users u ON cr.user_id = u.id
      WHERE cr.pot_id = ?
      ORDER BY cr.care_date DESC, cr.id DESC
      LIMIT 50
    `)
    .bind(potId)
    .all();

  return ((results || []) as any[]).map(mapCareRecord);
}

async function getTimelinesForBundle(env: any, potId: string): Promise<any[]> {
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
      LIMIT 10
    `)
    .bind(potId)
    .all();

  return ((results || []) as any[]).map((row) => ({
    ...row,
    operatorName: row.operator_name || null
  }));
}

async function getPotStatsForBundle(env: any, potId: string): Promise<any> {
  const [totalStats, typeRows] = await Promise.all([
    env.DB.prepare(`
      SELECT
        COUNT(*) as total_records,
        MIN(care_date) as first_care,
        MAX(care_date) as last_care,
        COUNT(DISTINCT care_date) as care_days
      FROM care_records
      WHERE pot_id = ?
    `).bind(potId).first(),
    env.DB.prepare(`
      SELECT
        type,
        COUNT(*) as total_count,
        SUM(CASE WHEN care_date >= date('now', '-30 days') THEN 1 ELSE 0 END) as recent_count,
        MAX(CASE WHEN care_date >= date('now', '-30 days') THEN care_date ELSE NULL END) as recent_last_date
      FROM care_records
      WHERE pot_id = ?
      GROUP BY type
    `).bind(potId).all()
  ]);

  const rows = ((typeRows.results || []) as any[]);

  return {
    recent: rows
      .filter((row) => Number(row.recent_count || 0) > 0)
      .map((row) => ({
        type: row.type,
        count: Number(row.recent_count || 0),
        last_date: row.recent_last_date
      })),
    total: totalStats || { total_records: 0, care_days: 0 },
    byType: rows.map((row) => ({
      type: row.type,
      total_count: Number(row.total_count || 0)
    }))
  };
}

async function getCareSchedulesForBundle(env: any, potId: string): Promise<any[]> {
  const { results } = await env.DB.prepare(`
    SELECT * FROM care_schedules WHERE pot_id = ? ORDER BY care_type ASC
  `).bind(potId).all();

  return (results || []) as any[];
}

async function getPotCommentsForBundle(env: any, potId: string): Promise<any[]> {
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
  for (const row of (results || []) as any[]) {
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
  for (const row of (legacyRows.results || []) as any[]) {
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
  return topLevelComments.slice(-60);
}

async function handleGetPotDetailBundle(path: string, env: any, token: string | null): Promise<Response> {
  const potId = path.split('/')[3];
  const userId = token;
  if (!userId) {
    return errorResponse('Authentication required', 401);
  }

  const pot = await findAccessiblePot(env, potId, userId, 'view', {
    select: `
      p.id,
      p.user_id,
      COALESCE(p.status, 'active') as status,
      CASE WHEN pc.user_id IS NULL THEN 0 ELSE 1 END as is_collaborator,
      CASE WHEN pv.user_id IS NULL THEN 0 ELSE 1 END as is_viewer
    `
  });

  if (!pot) {
    return errorResponse('Pot not found or access denied', 404);
  }

  try {
    const canManage = pot.user_id === userId || pot.is_collaborator === 1;
    const isActive = String(pot.status || 'active') === 'active';
    const [careRecords, timelineRecords, potStats, potComments, careSchedules] = await Promise.all([
      getCareRecordsForBundle(env, potId),
      getTimelinesForBundle(env, potId),
      getPotStatsForBundle(env, potId),
      getPotCommentsForBundle(env, potId),
      canManage && isActive ? getCareSchedulesForBundle(env, potId) : Promise.resolve([])
    ]);

    return jsonResponse({
      success: true,
      data: {
        careRecords,
        timelineRecords,
        timelines: timelineRecords,
        potStats,
        careSchedules,
        potComments
      }
    });
  } catch (error) {
    console.error('Get pot detail bundle error:', error);
    return errorResponse('Failed to get pot detail bundle', 500);
  }
}

async function handleGetCareRecords(path: string, env: any, token: string | null): Promise<Response> {
  const potId = path.split('/')[3];

  const pot = await findAccessiblePot(env, potId, token, 'view');

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

async function handleGetTimelines(path: string, env: any, url: URL, token: string | null): Promise<Response> {
  const potId = path.split('/')[3];
  const limitParam = url.searchParams.get('limit');
  const limit = limitParam ? Math.min(100, Math.max(1, parseInt(limitParam, 10) || 20)) : null;

  const pot = await findAccessiblePot(env, potId, token, 'view');

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
      ${limit ? 'LIMIT ?' : ''}
    `)
    .bind(...(limit ? [potId, limit] : [potId]))
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

  const pot = await findAccessiblePot(env, potId, token, 'view');

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
