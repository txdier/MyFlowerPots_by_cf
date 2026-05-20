import { jsonResponse, errorResponse } from '../utils/response-utils';
import {
  deleteUnreferencedImagesFromR2,
  deleteMediaFromR2,
  getRemovedImageUrls
} from '../utils/storage-utils';
import { findAccessiblePot } from '../utils/pot-access-utils';
import { recordPotActivity } from '../utils/pot-activity-utils';

type TimelineImagePayload = string | string[] | null;

type CreateTimelineRequest = {
  potId?: string;
  date?: string;
  description?: string;
  images?: TimelineImagePayload;
  video?: string | null;
  createdAt?: string;
};

type UpdateTimelineRequest = {
  date?: string;
  description?: string | null;
  images?: TimelineImagePayload;
  video?: string | null;
};

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
    const body = await request.json() as CreateTimelineRequest;
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

    const pot = await findAccessiblePot(env, potId, token, 'manage', { allowArchived: false });

    if (!pot) {
      return errorResponse('Pot not found or access denied', 403);
    }

    // 处理图片：如果是数组，转为 JSON 字符串
    const imagesStr = Array.isArray(images) ? JSON.stringify(images) : images;

    const result = await env.DB
      .prepare(`
        INSERT INTO timelines (
          pot_id,
          date,
          description,
          images,
          video,
          created_at,
          user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        potId,
        date,
        description || null,
        imagesStr || null,
        video || null,
        createdAt || new Date().toISOString(),
        token
      )
      .run();
    await recordPotActivity(env, potId, token, 'timeline_created', '新增成长轨迹', createdAt || null, {
      targetType: 'timeline',
      targetId: result.meta?.last_row_id
    });

    return jsonResponse({ success: true });

  } catch (error) {
    console.error('Create timeline error:', error);
    return errorResponse('Failed to create timeline', 500);
  }
}

async function handleUpdateTimeline(request: Request, env: any, id: string, token: string | null): Promise<Response> {
  try {
    const body = await request.json() as UpdateTimelineRequest;
    const { date, description, images, video } = body;

    // 安全加固：检查记录是否存在且属于该用户 (主或协作者)
    const existing: any = await env.DB
      .prepare(`
        SELECT id, pot_id, images, video
        FROM timelines
        WHERE id = ?
      `)
      .bind(id)
      .first();

    if (!existing) {
      return errorResponse('Record not found', 404);
    }

    const pot = await findAccessiblePot(env, existing.pot_id, token, 'manage', { allowArchived: false });
    if (!pot) {
      return errorResponse('Record not found', 404);
    }

    // 处理图片更新时的 R2 清理逻辑（比较新旧列表）
    if (images !== undefined) {
      await deleteUnreferencedImagesFromR2(env, existing.pot_id, getRemovedImageUrls(existing.images, images), {
        excludeTimelineId: id
      });
    }
    if (video !== undefined && video !== existing.video) {
      await deleteMediaFromR2(env, existing.video, { potId: existing.pot_id });
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
    await recordPotActivity(env, existing.pot_id, token, 'timeline_updated', '更新成长轨迹', null, {
      targetType: 'timeline',
      targetId: id
    });

    return jsonResponse({ success: true });

  } catch (error) {
    console.error('Update timeline error:', error);
    return errorResponse('Failed to update timeline', 500);
  }
}

async function handleDeleteTimeline(request: Request, env: any, id: string, token: string | null): Promise<Response> {
  try {
    // 安全加固：检查记录是否存在且属于该用户 (主或协作者)
    const existing: any = await env.DB
      .prepare(`
        SELECT id, pot_id, images, video
        FROM timelines
        WHERE id = ?
      `)
      .bind(id)
      .first();

    if (!existing) {
      return errorResponse('Record not found', 404);
    }

    const pot = await findAccessiblePot(env, existing.pot_id, token, 'manage', { allowArchived: false });
    if (!pot) {
      return errorResponse('Record not found', 404);
    }

    await deleteUnreferencedImagesFromR2(env, existing.pot_id, existing.images, {
      excludeTimelineId: id
    });
    await deleteMediaFromR2(env, existing.video, { potId: existing.pot_id });

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
