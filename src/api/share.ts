import { jsonResponse, errorResponse } from '../utils/response-utils';
import { findAccessiblePot } from '../utils/pot-access-utils';

/**
 * 处理分享相关的请求
 */
export async function handleShareRequest(
  request: Request,
  env: any,
  path: string,
  userId: string | null
): Promise<Response> {
  if (request.method === 'GET' && path.match(/^\/api\/public\/pots\/by-id\/[^/]+$/)) {
    const id = path.split('/').pop();
    if (!id) return errorResponse('Pot ID required', 400);
    return handleGetPublicPot(request, { id }, env, userId);
  }

  // 1️⃣ 获取公共分享详情 (免登录)
  if (request.method === 'GET' && path.startsWith('/api/public/pots/')) {
    const token = path.split('/').pop();
    if (!token) return errorResponse('Token required', 400);
    return handleGetPublicPot(request, { token }, env, userId);
  }

  // 以下接口需要授权
  if (!userId) return errorResponse('Authentication required', 401);

  // 2️⃣ 开启分享
  if (request.method === 'POST' && path.match(/^\/api\/share\/enable\/[^/]+$/)) {
    const potId = path.split('/').pop();
    return handleEnableShare(potId!, userId, env);
  }

  // 3️⃣ 关闭分享
  if (request.method === 'POST' && path.match(/^\/api\/share\/disable\/[^/]+$/)) {
    const potId = path.split('/').pop();
    return handleDisableShare(potId!, userId, env);
  }

  if (request.method === 'POST' && path.match(/^\/api\/share\/comment-danmaku\/[^/]+$/)) {
    const potId = path.split('/').pop();
    return handleSetCommentDanmaku(potId!, userId, env, request);
  }

  return errorResponse('Not Found', 404);
}

async function handleEnableShare(potId: string, userId: string, env: any): Promise<Response> {
  // 校验所有权 (仅主人可开启/重置分享)
  const pot = await findAccessiblePot(env, potId, userId, 'owner', { select: 'p.id' });
  if (!pot) return errorResponse('Pot not found or access denied', 404);

  // 生成新的随机 Token
  const shareToken = crypto.randomUUID().replace(/-/g, '');

  await env.DB.prepare('UPDATE pots SET is_shared = 1, share_token = ? WHERE id = ?').bind(shareToken, potId).run();

  return jsonResponse({ success: true, data: { token: shareToken } });
}

async function handleDisableShare(potId: string, userId: string, env: any): Promise<Response> {
  // 校验所有权
  const pot = await findAccessiblePot(env, potId, userId, 'owner', { select: 'p.id' });
  if (!pot) return errorResponse('Pot not found or access denied', 404);

  await env.DB.prepare('UPDATE pots SET is_shared = 0, share_token = NULL WHERE id = ?').bind(potId).run();

  return jsonResponse({ success: true });
}

async function handleSetCommentDanmaku(potId: string, userId: string, env: any, request: Request): Promise<Response> {
  const pot = await findAccessiblePot(env, potId, userId, 'owner', {
    select: "p.id, COALESCE(p.status, 'active') as status"
  });
  if (!pot) return errorResponse('Pot not found or access denied', 404);
  if (String(pot.status || 'active').toLowerCase() === 'archived') {
    return errorResponse('Archived pot is read-only', 403);
  }

  const body = await request.json() as { enabled?: boolean | number };
  const enabled = body.enabled ? 1 : 0;

  await env.DB.prepare('UPDATE pots SET show_comment_danmaku = ? WHERE id = ?').bind(enabled, potId).run();
  return jsonResponse({ success: true, data: { enabled } });
}

function parsePublicListLimit(url: URL, name: string, fallback: number): number | null {
  const value = String(url.searchParams.get(name) || '').trim().toLowerCase();
  if (!value) return fallback;
  if (value === 'all') return null;

  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(500, parsed);
}

async function handleGetPublicPot(
  request: Request,
  lookup: { token?: string; id?: string },
  env: any,
  userId: string | null
): Promise<Response> {
  const url = new URL(request.url);
  const careLimit = parsePublicListLimit(url, 'careLimit', 50);
  const timelineLimit = parsePublicListLimit(url, 'timelineLimit', 20);

  // 1. 获取花盆基本信息
  const potWhere = lookup.id
    ? 'id = ? AND is_shared = 1'
    : 'share_token = ? AND is_shared = 1';
  const potLookupValue = lookup.id || lookup.token || '';
  const pot = await env.DB.prepare(`
    SELECT
      id,
      user_id,
      name,
      plant_type,
      note,
      plant_date,
      image_url,
      share_token,
      is_shared,
      last_care,
      last_care_action,
      show_comment_danmaku,
      COALESCE(status, 'active') as status,
      archived_at,
      archive_reason,
      archive_note
    FROM pots
    WHERE ${potWhere}
  `).bind(potLookupValue).first();

  if (!pot) return errorResponse('Share link invalid or expired', 404);

  const isOwner = !!userId && pot.user_id === userId;
  let isCollaborator = false;
  let isViewer = false;
  if (userId && !isOwner) {
    const membership = await env.DB.prepare(`
      SELECT 1
      FROM pot_collaborators
      WHERE pot_id = ? AND user_id = ?
    `).bind(pot.id, userId).first();
    isCollaborator = !!membership;
    if (!isCollaborator) {
      const viewer = await env.DB.prepare(`
        SELECT 1
        FROM pot_viewers
        WHERE pot_id = ? AND user_id = ?
      `).bind(pot.id, userId).first();
      isViewer = !!viewer;
    }
  }

  // 2. 获取养护记录 (脱敏，仅返回必要信息)
  const { results: careRecords } = await env.DB.prepare(`
    SELECT cr.id, cr.pot_id, cr.type, cr.action, cr.care_date, cr.created_at, cr.description, cr.image_url, u.display_name as operator_name
    FROM care_records cr
    LEFT JOIN users u ON cr.user_id = u.id
    WHERE cr.pot_id = ?
    ORDER BY cr.care_date DESC, cr.id DESC
    ${careLimit ? 'LIMIT ?' : ''}
  `).bind(...(careLimit ? [pot.id, careLimit] : [pot.id])).all();

  // 3. 获取时间轴 (脱敏)
  const { results: timelines } = await env.DB.prepare(`
    SELECT t.id, t.date, t.description, t.images, t.video, t.created_at, u.display_name as operator_name
    FROM timelines t
    LEFT JOIN users u ON t.user_id = u.id
    WHERE t.pot_id = ?
    ORDER BY t.date DESC, t.id DESC
    ${timelineLimit ? 'LIMIT ?' : ''}
  `).bind(...(timelineLimit ? [pot.id, timelineLimit] : [pot.id])).all();

  return jsonResponse({
    success: true,
    data: {
      pot,
      viewer: {
        isOwner,
        isCollaborator,
        isViewer
      },
      careRecords: careRecords.map((r: any) => ({
        ...r,
        potId: r.pot_id,
        date: r.care_date,
        createdAt: r.created_at,
        imageUrl: r.image_url,
        operatorName: r.operator_name || '原主人'
      })),
      timelines: timelines.map((t: any) => ({
        ...t,
        operatorName: t.operator_name || '原主人'
      }))
    }
  });
}
