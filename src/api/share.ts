import { jsonResponse, errorResponse } from '../utils/response-utils';

/**
 * 处理分享相关的请求
 */
export async function handleShareRequest(
  request: Request,
  env: any,
  path: string,
  userId: string | null
): Promise<Response> {
  // 1️⃣ 获取公共分享详情 (免登录)
  if (request.method === 'GET' && path.startsWith('/api/public/pots/')) {
    const token = path.split('/').pop();
    if (!token) return errorResponse('Token required', 400);
    return handleGetPublicPot(token, env);
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

  return errorResponse('Not Found', 404);
}

async function handleEnableShare(potId: string, userId: string, env: any): Promise<Response> {
  // 校验所有权 (仅主人可开启/重置分享)
  const pot = await env.DB.prepare('SELECT id FROM pots WHERE id = ? AND user_id = ?').bind(potId, userId).first();
  if (!pot) return errorResponse('Pot not found or access denied', 404);

  // 生成新的随机 Token
  const shareToken = crypto.randomUUID().replace(/-/g, '');

  await env.DB.prepare('UPDATE pots SET is_shared = 1, share_token = ? WHERE id = ?').bind(shareToken, potId).run();

  return jsonResponse({ success: true, data: { token: shareToken } });
}

async function handleDisableShare(potId: string, userId: string, env: any): Promise<Response> {
  // 校验所有权
  const pot = await env.DB.prepare('SELECT id FROM pots WHERE id = ? AND user_id = ?').bind(potId, userId).first();
  if (!pot) return errorResponse('Pot not found or access denied', 404);

  await env.DB.prepare('UPDATE pots SET is_shared = 0, share_token = NULL WHERE id = ?').bind(potId).run();

  return jsonResponse({ success: true });
}

async function handleGetPublicPot(token: string, env: any): Promise<Response> {
  // 1. 获取花盆基本信息
  const pot = await env.DB.prepare(`
    SELECT id, user_id, name, plant_type, note, plant_date, image_url, last_care, last_care_action
    FROM pots
    WHERE share_token = ? AND is_shared = 1
  `).bind(token).first();

  if (!pot) return errorResponse('Share link invalid or expired', 404);

  // 2. 获取养护记录 (脱敏，仅返回必要信息)
  const { results: careRecords } = await env.DB.prepare(`
    SELECT cr.type, cr.action, cr.care_date, cr.description, cr.image_url, u.display_name as operator_name
    FROM care_records cr
    LEFT JOIN users u ON cr.user_id = u.id
    WHERE cr.pot_id = ?
    ORDER BY cr.care_date DESC, cr.id DESC
    LIMIT 50
  `).bind(pot.id).all();

  // 3. 获取时间轴 (脱敏)
  const { results: timelines } = await env.DB.prepare(`
    SELECT t.date, t.description, t.images, u.display_name as operator_name
    FROM timelines t
    LEFT JOIN users u ON t.user_id = u.id
    WHERE t.pot_id = ?
    ORDER BY t.date DESC, t.id DESC
    LIMIT 20
  `).bind(pot.id).all();

  return jsonResponse({
    success: true,
    data: {
      pot,
      careRecords: careRecords.map((r: any) => ({
        ...r,
        date: r.care_date,
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
