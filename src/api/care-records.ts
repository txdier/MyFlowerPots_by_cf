import { jsonResponse, errorResponse } from '../utils/response-utils';
import {
  isDefaultImage,
  extractObjectKeyFromUrl,
  deleteFileFromR2
} from '../utils/storage-utils';

export async function handleCareRecordsRequest(
  request: Request,
  env: any,
  path: string,
  token: string | null
): Promise<Response> {
  // 1️⃣ 获取单条养护记录详情: GET /api/care-records/detail/{id}
  if (request.method === 'GET' && path.match(/^\/api\/care-records\/detail\/[^/]+$/)) {
    const id = path.split('/')[4];
    return handleGetCareRecordDetail(request, env, id, token);
  }

  // 2️⃣ 获取花盆的养护记录列表: GET /api/care-records/{potId}
  if (request.method === 'GET' && path.match(/^\/api\/care-records\/[^/]+$/)) {
    const potId = path.split('/')[3];
    return handleGetCareRecords(request, env, potId, token);
  }

  // 2️⃣ 创建养护记录: POST /api/care-records
  if (request.method === 'POST' && path === '/api/care-records') {
    return handleCreateCareRecord(request, env, token);
  }

  // 3️⃣ 更新养护记录: PUT /api/care-records/{id}
  if (request.method === 'PUT' && path.match(/^\/api\/care-records\/[^/]+$/)) {
    const id = path.split('/')[3];
    return handleUpdateCareRecord(request, env, id, token);
  }

  // 4️⃣ 删除养护记录: DELETE /api/care-records/{id}
  if (request.method === 'DELETE' && path.match(/^\/api\/care-records\/[^/]+$/)) {
    const id = path.split('/')[3];
    return handleDeleteCareRecord(request, env, id, token);
  }

  return errorResponse('Not Found', 404);
}

async function handleGetCareRecordDetail(request: Request, env: any, id: string, token: string | null): Promise<Response> {
  try {
    // 安全加固：校验该记录所属的花盆是否属于当前用户
    const record = await env.DB
      .prepare(`
        SELECT r.* FROM care_records r
        JOIN pots p ON r.pot_id = p.id
        WHERE r.id = ? AND p.user_id = ?
      `)
      .bind(id, token)
      .first();

    if (!record) {
      return errorResponse('Record not found', 404);
    }

    return jsonResponse({
      success: true,
      data: {
        id: record.id,
        potId: record.pot_id,
        type: record.type,
        action: record.action,
        description: record.description,
        imageUrl: record.image_url,
        date: record.care_date,
        createdAt: record.created_at
      }
    });
  } catch (error) {
    console.error('Get care record detail error:', error);
    return errorResponse('Failed to get record detail', 500);
  }
}

async function handleGetCareRecords(request: Request, env: any, potId: string, token: string | null): Promise<Response> {
  try {
    if (!potId) {
      return errorResponse('Missing potId', 400);
    }

    // 安全加固：校验花盆归属权
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
          pot_id,
          type,
          action,
          description,
          care_date,
          created_at
        FROM care_records
        WHERE pot_id = ?
        ORDER BY care_date DESC
        LIMIT 20
      `)
      .bind(potId)
      .all();

    return jsonResponse({
      success: true,
      data: results.map((record: any) => ({
        id: record.id,
        potId: record.pot_id,
        type: record.type,
        action: record.action,
        description: record.description,
        date: record.care_date,
        createdAt: record.created_at
      }))
    });

  } catch (error) {
    console.error('Get care records error:', error);
    return errorResponse('Failed to get care records', 500);
  }
}

async function handleCreateCareRecord(request: Request, env: any, token: string | null): Promise<Response> {
  try {
    const body: any = await request.json();
    const { potId, type, types, action, actions, careDate, description, imageUrl, imageUrls } = body;

    if (!potId || !careDate) {
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

    // 统一处理为数组
    const finalTypes = types || (type ? [type] : []);
    const finalActions = actions || (action ? [action] : []);

    if (finalTypes.length === 0) {
      return errorResponse('At least one type is required', 400);
    }

    // 统一图片为 JSON 字符串
    // 前端现在发送 imageUrls 数组。如果旧前端发送 imageUrl，兼容处理。
    const finalImageUrls = imageUrls || (imageUrl ? [imageUrl] : []);
    const storedImageValue = finalImageUrls.length > 0 ? JSON.stringify(finalImageUrls) : null;

    // 使用事务（Batch）执行多条记录插入
    const statements = finalTypes.map((t: string, idx: number) => {
      return env.DB.prepare(`
        INSERT INTO care_records (
          pot_id,
          type,
          action,
          care_date,
          description,
          image_url,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        potId,
        t,
        finalActions[idx] || t, // 如果没有对应action，回退到type名
        careDate,
        description || null,
        storedImageValue, // 存储 JSON 字符串
        new Date().toISOString()
      );
    });

    // 同时更新花盆的 last_care 和 last_care_action
    const lastAction = finalActions.join('、');
    statements.push(
      env.DB.prepare('UPDATE pots SET last_care = ?, last_care_action = ? WHERE id = ?')
        .bind(careDate, lastAction, potId)
    );

    // [New] 如果有图片，自动推送到生长轨迹 (Timeline)
    if (finalImageUrls.length > 0) {
      const timelineDesc = `【${lastAction}】${description || ''}`;
      // Timeline 表的 images 本身就是 JSON 字符串
      const timelineImagesJson = JSON.stringify(finalImageUrls);
      statements.push(
        env.DB.prepare(`
          INSERT INTO timelines (
            pot_id,
            date,
            description,
            images,
            created_at
          ) VALUES (?, ?, ?, ?, ?)
        `).bind(
          potId,
          careDate,
          timelineDesc,
          timelineImagesJson,
          new Date().toISOString()
        )
      );
    }

    await env.DB.batch(statements);

    return jsonResponse({ success: true, count: finalTypes.length });

  } catch (error) {
    console.error('Create care record error:', error);
    return errorResponse('Failed to create care record', 500);
  }
}

async function handleUpdateCareRecord(request: Request, env: any, id: string, token: string | null): Promise<Response> {
  try {
    const body: any = await request.json();
    const { type, action, careDate, description, imageUrl, imageUrls } = body;

    // 安全加固：检查记录是否存在且属于该用户
    const existing: any = await env.DB
      .prepare(`
        SELECT r.id, r.image_url FROM care_records r
        JOIN pots p ON r.pot_id = p.id
        WHERE r.id = ? AND p.user_id = ?
      `)
      .bind(id, token)
      .first();

    if (!existing) {
      return errorResponse('Record not found', 404);
    }

    // 构建更新 SQL
    const updates: string[] = [];
    const values: any[] = [];

    if (type !== undefined) {
      updates.push('type = ?');
      values.push(type);
    }
    if (action !== undefined) {
      updates.push('action = ?');
      values.push(action);
    }
    if (careDate !== undefined) {
      updates.push('care_date = ?');
      values.push(careDate);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      values.push(description);
    }

    // 图片更新逻辑
    if (imageUrl !== undefined || imageUrls !== undefined) {
      // 计算新的存储值
      let newStorageValue = null;

      if (imageUrls && Array.isArray(imageUrls)) {
        newStorageValue = imageUrls.length > 0 ? JSON.stringify(imageUrls) : null;
      } else if (imageUrl) {
        newStorageValue = JSON.stringify([imageUrl]);
      }

      // 简单的清理逻辑（仅当完全被覆盖时尝试清理旧图，这里暂不处理复杂的多图清理，避免误删）
      // 如果现有的是单图URL且不在新列表中，可以清理？
      // 由于逻辑变复杂，这里暂先跳过自动清理旧图，防止删除错误。
      // 实际生产中应解析旧 JSON，找出不再使用的 URL 进行删除。

      updates.push('image_url = ?');
      values.push(newStorageValue);
    }

    if (updates.length === 0) {
      return errorResponse('No fields to update', 400);
    }

    values.push(id);
    await env.DB
      .prepare(`UPDATE care_records SET ${updates.join(', ')} WHERE id = ?`)
      .bind(...values)
      .run();

    return jsonResponse({ success: true });

  } catch (error) {
    console.error('Update care record error:', error);
    return errorResponse('Failed to update care record', 500);
  }
}

async function handleDeleteCareRecord(request: Request, env: any, id: string, token: string | null): Promise<Response> {
  try {
    // 安全加固：检查记录是否存在且属于该用户
    const existing = await env.DB
      .prepare(`
        SELECT r.id, r.image_url FROM care_records r
        JOIN pots p ON r.pot_id = p.id
        WHERE r.id = ? AND p.user_id = ?
      `)
      .bind(id, token)
      .first();

    if (!existing) {
      return errorResponse('Record not found', 404);
    }

    // 如果有图片，执行清理逻辑
    if (existing.image_url && !isDefaultImage(existing.image_url)) {
      const objectKey = extractObjectKeyFromUrl(existing.image_url);
      if (objectKey) {
        await deleteFileFromR2(env, objectKey);
      }
    }

    await env.DB
      .prepare('DELETE FROM care_records WHERE id = ?')
      .bind(id)
      .run();

    return jsonResponse({ success: true });

  } catch (error) {
    console.error('Delete care record error:', error);
    return errorResponse('Failed to delete care record', 500);
  }
}
