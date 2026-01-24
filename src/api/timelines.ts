import { jsonResponse, errorResponse } from '../utils/response-utils';
import {
  isDefaultImage,
  extractObjectKeyFromUrl,
  deleteFileFromR2
} from '../utils/storage-utils';

export async function handleTimelinesRequest(
  request: Request,
  env: any,
  path: string,
  token: string | null
): Promise<Response> {
  // 1️⃣ 创建时间线记录: POST /api/timelines
  if (request.method === 'POST' && path === '/api/timelines') {
    return handleCreateTimeline(request, env, token);
  }

  // 2️⃣ 更新时间线记录: PUT /api/timelines/{id}
  if (request.method === 'PUT' && path.match(/^\/api\/timelines\/[^/]+$/)) {
    const id = path.split('/')[3];
    return handleUpdateTimeline(request, env, id, token);
  }

  // 3️⃣ 删除时间线记录: DELETE /api/timelines/{id}
  if (request.method === 'DELETE' && path.match(/^\/api\/timelines\/[^/]+$/)) {
    const id = path.split('/')[3];
    return handleDeleteTimeline(request, env, id, token);
  }

  return errorResponse('Not Found', 404);
}

async function handleCreateTimeline(request: Request, env: any, token: string | null): Promise<Response> {
  try {
    const body = await request.json();
    const {
      potId,
      date,
      description,
      images,
      video,
      createdAt
    } = body;

    if (!potId || !date) {
      return errorResponse('missing fields', 400);
    }

    // 安全加固：校验目标花盆归属权
    const pot = await env.DB
      .prepare('SELECT id FROM pots WHERE id = ? AND user_id = ?')
      .bind(potId, token)
      .first();

    if (!pot) {
      return errorResponse('Pot not found or access denied', 404);
    }

    // 处理图片：如果是数组，转为 JSON 字符串
    const imagesStr = Array.isArray(images) ? JSON.stringify(images) : images;

    await env.DB
      .prepare(`
        INSERT INTO timelines (
          pot_id,
          date,
          description,
          images,
          video,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `)
      .bind(
        potId,
        date,
        description || null,
        imagesStr || null,
        video || null,
        createdAt || new Date().toISOString()
      )
      .run();

    return jsonResponse({ success: true });

  } catch (error) {
    console.error('Create timeline error:', error);
    return errorResponse('Failed to create timeline', 500);
  }
}

async function handleUpdateTimeline(request: Request, env: any, id: string, token: string | null): Promise<Response> {
  try {
    const body = await request.json();
    const { date, description, images, video } = body;

    // 安全加固：检查记录是否存在且属于该用户
    const existing = await env.DB
      .prepare(`
        SELECT t.id, t.images, t.video FROM timelines t
        JOIN pots p ON t.pot_id = p.id
        WHERE t.id = ? AND p.user_id = ?
      `)
      .bind(id, token)
      .first();

    if (!existing) {
      return errorResponse('Record not found', 404);
    }

    // 处理图片更新时的 R2 清理逻辑（比较新旧列表）
    if (images !== undefined) {
      const newImages = Array.isArray(images) ? images : (images ? JSON.parse(images) : []);
      let oldImages: string[] = [];
      try {
        oldImages = existing.images ? JSON.parse(existing.images) : [];
      } catch (e) {
        console.warn('解析旧图片失败:', e);
      }

      // 找出被移除的图片
      const removedImages = oldImages.filter(img => !newImages.includes(img));
      for (const imgUrl of removedImages) {
        if (!isDefaultImage(imgUrl)) {
          const key = extractObjectKeyFromUrl(imgUrl);
          if (key) await deleteFileFromR2(env, key);
        }
      }
    }

    // 构建更新 SQL
    const updates: string[] = [];
    const values: any[] = [];

    if (date !== undefined) {
      updates.push('date = ?');
      values.push(date);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      values.push(description);
    }
    if (images !== undefined) {
      updates.push('images = ?');
      values.push(Array.isArray(images) ? JSON.stringify(images) : images);
    }
    if (video !== undefined) {
      updates.push('video = ?');
      values.push(video);
    }

    if (updates.length === 0) {
      return errorResponse('No fields to update', 400);
    }

    values.push(id);
    await env.DB
      .prepare(`UPDATE timelines SET ${updates.join(', ')} WHERE id = ?`)
      .bind(...values)
      .run();

    return jsonResponse({ success: true });

  } catch (error) {
    console.error('Update timeline error:', error);
    return errorResponse('Failed to update timeline', 500);
  }
}

async function handleDeleteTimeline(request: Request, env: any, id: string, token: string | null): Promise<Response> {
  try {
    // 安全加固：检查记录是否存在且属于该用户
    const existing = await env.DB
      .prepare(`
        SELECT t.id, t.images, t.video FROM timelines t
        JOIN pots p ON t.pot_id = p.id
        WHERE t.id = ? AND p.user_id = ?
      `)
      .bind(id, token)
      .first();

    if (!existing) {
      return errorResponse('Record not found', 404);
    }

    // 清理所有关联图片
    if (existing.images) {
      try {
        const images = JSON.parse(existing.images);
        if (Array.isArray(images)) {
          for (const imgUrl of images) {
            if (!isDefaultImage(imgUrl)) {
              const key = extractObjectKeyFromUrl(imgUrl);
              if (key) await deleteFileFromR2(env, key);
            }
          }
        }
      } catch (e) {
        console.error('解析时间线图片失败:', e);
      }
    }

    // TODO: 清理视频资源

    await env.DB
      .prepare('DELETE FROM timelines WHERE id = ?')
      .bind(id)
      .run();

    return jsonResponse({ success: true });

  } catch (error) {
    console.error('Delete timeline error:', error);
    return errorResponse('Failed to delete timeline', 500);
  }
}
