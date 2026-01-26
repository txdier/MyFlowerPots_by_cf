import { getTokenFromHeader } from '../utils/auth-utils';
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
  // 1️⃣ 花盆列表
  if (request.method === 'GET' && path === '/api/pots') {
    return handleGetPots(request, env, url, token);
  }

  // 2️⃣ 花盆详情
  if (request.method === 'GET' && path.match(/^\/api\/pots\/[^/]+$/)) {
    return handleGetPotDetail(path, env, url, token);
  }

  // 3️⃣ 创建花盆
  if (request.method === 'POST' && path === '/api/pots') {
    return handleCreatePot(request, env, token);
  }

  // 8️⃣ 重新排序 (New) - 必须在通用 ID 匹配之前
  if (request.method === 'PUT' && path === '/api/pots/reorder') {
    return handleReorderPots(request, env, url, token);
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

  const { results } = await env.DB
    .prepare(`
      SELECT
        id,
        user_id,
        name,
        plant_type,
        note,
        plant_date,
        image_url,
        last_care,
        last_care_action
      FROM pots
      WHERE user_id = ?
      ORDER BY sort_order ASC, plant_date DESC
    `)
    .bind(userId)
    .all();

  return jsonResponse({
    success: true,
    data: results
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
        id,
        user_id,
        name,
        plant_type,
        note,
        plant_date,
        image_url,
        last_care,
        last_care_action
      FROM pots
      WHERE id = ? AND user_id = ?
    `)
    .bind(potId, userId)
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
    const body = await request.json();
    const {
      id,
      userId,
      name,
      plantType,
      note,
      plantDate,
      imageUrl,
      lastCare
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

    await env.DB
      .prepare(`
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
      )
      .run();

    return jsonResponse({ success: true });

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
    const body = await request.json();
    const {
      name,
      plantType,
      note,
      plantDate,
      imageUrl,
      lastCare
    } = body;

    // 验证用户权限
    const userId = url.searchParams.get('userId') || token;
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
    const userId = url.searchParams.get('userId') || token;
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

  // 安全加固：校验该花盆是否属于该用户
  const pot = await env.DB
    .prepare('SELECT id FROM pots WHERE id = ? AND user_id = ?')
    .bind(potId, token)
    .first();

  if (!pot) {
    return errorResponse('Pot not found or access denied', 404);
  }

  const { results } = await env.DB
    .prepare(`
      SELECT
        id,
        type,
        action,
        care_date,
        description,
        image_url
      FROM care_records
      WHERE pot_id = ?
      ORDER BY care_date DESC, id DESC
    `)
    .bind(potId)
    .all();

  return jsonResponse({
    success: true,
    data: (results as unknown as CareRecord[]).map(r => ({
      ...r,
      date: r.care_date,
      imageUrl: r.image_url
    }))
  });
}

async function handleGetTimelines(path: string, env: any, token: string | null): Promise<Response> {
  const potId = path.split('/')[3];

  // 安全加固：校验该花盆是否属于该用户
  const pot = await env.DB
    .prepare('SELECT id FROM pots WHERE id = ? AND user_id = ?')
    .bind(potId, token)
    .first();

  if (!pot) {
    return errorResponse('Pot not found or access denied', 404);
  }

  const { results } = await env.DB
    .prepare(`
      SELECT
        id,
        date,
        description,
        images,
        video,
        created_at
      FROM timelines
      WHERE pot_id = ?
      ORDER BY date DESC, id DESC
    `)
    .bind(potId)
    .all();

  return jsonResponse({
    success: true,
    data: results
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

    const userId = url.searchParams.get('userId') || token;
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

  // 安全加固：校验该花盆是否属于该用户
  const pot = await env.DB
    .prepare('SELECT id FROM pots WHERE id = ? AND user_id = ?')
    .bind(potId, token)
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
