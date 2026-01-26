import { jsonResponse, errorResponse } from '../utils/response-utils';

interface CareSchedule {
    id: number;
    pot_id: string;
    care_type: string;
    interval_days: number;
    custom_action: string | null;
    enabled: number;
    created_at: string;
    updated_at: string;
}

export async function handleCareSchedulesRequest(
    request: Request,
    env: any,
    path: string,
    userId: string | null
): Promise<Response> {
    if (!userId) {
        return errorResponse('Authentication required', 401);
    }

    // GET /api/care-schedules - 获取用户所有养护计划
    if (request.method === 'GET' && path === '/api/care-schedules') {
        return handleGetAllSchedules(env, userId);
    }

    // GET /api/care-schedules/reminders - 获取今日待办提醒
    if (request.method === 'GET' && path === '/api/care-schedules/reminders') {
        return handleGetReminders(env, userId);
    }

    // GET /api/care-schedules/pot/:potId - 获取某个花盆的养护计划
    const potMatch = path.match(/^\/api\/care-schedules\/pot\/([^/]+)$/);
    if (request.method === 'GET' && potMatch) {
        return handleGetSchedulesByPot(env, userId, potMatch[1]);
    }

    // POST /api/care-schedules - 创建养护计划
    if (request.method === 'POST' && path === '/api/care-schedules') {
        return handleCreateSchedule(request, env, userId);
    }

    // PUT /api/care-schedules/:id - 更新养护计划
    const updateMatch = path.match(/^\/api\/care-schedules\/(\d+)$/);
    if (request.method === 'PUT' && updateMatch) {
        return handleUpdateSchedule(request, env, userId, parseInt(updateMatch[1]));
    }

    // DELETE /api/care-schedules/:id - 删除养护计划
    const deleteMatch = path.match(/^\/api\/care-schedules\/(\d+)$/);
    if (request.method === 'DELETE' && deleteMatch) {
        return handleDeleteSchedule(env, userId, parseInt(deleteMatch[1]));
    }

    return errorResponse('Not Found', 404);
}

// 获取用户所有养护计划
async function handleGetAllSchedules(env: any, userId: string): Promise<Response> {
    const { results } = await env.DB.prepare(`
    SELECT cs.*, p.name as pot_name, p.image_url as pot_image
    FROM care_schedules cs
    JOIN pots p ON cs.pot_id = p.id
    WHERE p.user_id = ?
    ORDER BY cs.created_at DESC
  `).bind(userId).all();

    return jsonResponse({
        success: true,
        data: results || []
    });
}

// 获取某个花盆的养护计划
async function handleGetSchedulesByPot(env: any, userId: string, potId: string): Promise<Response> {
    // 验证花盆归属
    const pot = await env.DB.prepare('SELECT id FROM pots WHERE id = ? AND user_id = ?')
        .bind(potId, userId).first();

    if (!pot) {
        return errorResponse('Pot not found or access denied', 404);
    }

    const { results } = await env.DB.prepare(`
    SELECT * FROM care_schedules WHERE pot_id = ? ORDER BY care_type ASC
  `).bind(potId).all();

    return jsonResponse({
        success: true,
        data: results || []
    });
}

// 获取今日待办提醒
async function handleGetReminders(env: any, userId: string): Promise<Response> {
    // 查询所有启用的养护计划，计算是否到期
    const { results } = await env.DB.prepare(`
    SELECT 
      cs.id as schedule_id,
      cs.care_type,
      cs.interval_days,
      cs.custom_action,
      p.id as pot_id,
      p.name as pot_name,
      p.image_url as pot_image,
      p.last_care,
      CASE 
        WHEN p.last_care IS NULL THEN 999
        ELSE julianday('now') - julianday(p.last_care)
      END as days_since_care
    FROM care_schedules cs
    JOIN pots p ON cs.pot_id = p.id
    WHERE p.user_id = ? 
      AND cs.enabled = 1
      AND (
        p.last_care IS NULL 
        OR julianday('now') - julianday(p.last_care) >= cs.interval_days
      )
    ORDER BY days_since_care DESC
  `).bind(userId).all();

    // 格式化结果
    const reminders = (results || []).map((r: any) => ({
        scheduleId: r.schedule_id,
        potId: r.pot_id,
        potName: r.pot_name,
        potImage: r.pot_image,
        careType: r.care_type,
        customAction: r.custom_action,
        intervalDays: r.interval_days,
        daysSinceCare: Math.floor(r.days_since_care),
        lastCare: r.last_care,
        isOverdue: r.days_since_care >= r.interval_days
    }));

    return jsonResponse({
        success: true,
        data: reminders,
        count: reminders.length
    });
}

// 创建养护计划
async function handleCreateSchedule(request: Request, env: any, userId: string): Promise<Response> {
    try {
        const body = await request.json() as {
            potId: string;
            careType: string;
            intervalDays: number;
            customAction?: string;
            enabled?: boolean;
        };

        const { potId, careType, intervalDays, customAction, enabled = true } = body;

        if (!potId || !careType || !intervalDays) {
            return errorResponse('Missing required fields: potId, careType, intervalDays', 400);
        }

        // 验证花盆归属
        const pot = await env.DB.prepare('SELECT id FROM pots WHERE id = ? AND user_id = ?')
            .bind(potId, userId).first();

        if (!pot) {
            return errorResponse('Pot not found or access denied', 404);
        }

        // 检查是否已存在相同类型的计划
        const existing = await env.DB.prepare(`
      SELECT id FROM care_schedules WHERE pot_id = ? AND care_type = ?
    `).bind(potId, careType).first();

        if (existing) {
            return errorResponse('Schedule for this care type already exists', 409);
        }

        // 创建计划
        const result = await env.DB.prepare(`
      INSERT INTO care_schedules (pot_id, care_type, interval_days, custom_action, enabled)
      VALUES (?, ?, ?, ?, ?)
    `).bind(potId, careType, intervalDays, customAction || null, enabled ? 1 : 0).run();

        return jsonResponse({
            success: true,
            message: 'Schedule created successfully',
            id: result.meta?.last_row_id
        });

    } catch (error) {
        console.error('Create schedule error:', error);
        return errorResponse('Failed to create schedule', 500);
    }
}

// 更新养护计划
async function handleUpdateSchedule(
    request: Request,
    env: any,
    userId: string,
    scheduleId: number
): Promise<Response> {
    try {
        const body = await request.json() as {
            intervalDays?: number;
            customAction?: string;
            enabled?: boolean;
        };

        // 验证计划归属
        const schedule = await env.DB.prepare(`
      SELECT cs.id FROM care_schedules cs
      JOIN pots p ON cs.pot_id = p.id
      WHERE cs.id = ? AND p.user_id = ?
    `).bind(scheduleId, userId).first();

        if (!schedule) {
            return errorResponse('Schedule not found or access denied', 404);
        }

        // 构建更新语句
        const updates: string[] = [];
        const values: any[] = [];

        if (body.intervalDays !== undefined) {
            updates.push('interval_days = ?');
            values.push(body.intervalDays);
        }
        if (body.customAction !== undefined) {
            updates.push('custom_action = ?');
            values.push(body.customAction);
        }
        if (body.enabled !== undefined) {
            updates.push('enabled = ?');
            values.push(body.enabled ? 1 : 0);
        }

        if (updates.length === 0) {
            return errorResponse('No fields to update', 400);
        }

        updates.push("updated_at = datetime('now')");
        values.push(scheduleId);

        await env.DB.prepare(`
      UPDATE care_schedules SET ${updates.join(', ')} WHERE id = ?
    `).bind(...values).run();

        return jsonResponse({
            success: true,
            message: 'Schedule updated successfully'
        });

    } catch (error) {
        console.error('Update schedule error:', error);
        return errorResponse('Failed to update schedule', 500);
    }
}

// 删除养护计划
async function handleDeleteSchedule(env: any, userId: string, scheduleId: number): Promise<Response> {
    try {
        // 验证计划归属
        const schedule = await env.DB.prepare(`
      SELECT cs.id FROM care_schedules cs
      JOIN pots p ON cs.pot_id = p.id
      WHERE cs.id = ? AND p.user_id = ?
    `).bind(scheduleId, userId).first();

        if (!schedule) {
            return errorResponse('Schedule not found or access denied', 404);
        }

        await env.DB.prepare('DELETE FROM care_schedules WHERE id = ?')
            .bind(scheduleId).run();

        return jsonResponse({
            success: true,
            message: 'Schedule deleted successfully'
        });

    } catch (error) {
        console.error('Delete schedule error:', error);
        return errorResponse('Failed to delete schedule', 500);
    }
}
