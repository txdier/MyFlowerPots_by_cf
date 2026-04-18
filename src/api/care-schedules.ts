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
    WHERE (p.user_id = ? OR p.id IN (SELECT pot_id FROM pot_collaborators WHERE user_id = ?))
      AND COALESCE(p.status, 'active') = 'active'
    ORDER BY cs.created_at DESC
  `).bind(userId, userId).all();

    return jsonResponse({
        success: true,
        data: results || []
    });
}

// 获取某个花盆的养护计划
async function handleGetSchedulesByPot(env: any, userId: string, potId: string): Promise<Response> {
    // 验证花盆归属
    const pot = await env.DB.prepare(`
      SELECT id FROM pots WHERE id = ? AND user_id = ?
      UNION
      SELECT pot_id FROM pot_collaborators WHERE pot_id = ? AND user_id = ?
      UNION
      SELECT pot_id FROM pot_viewers WHERE pot_id = ? AND user_id = ?
    `).bind(potId, userId, potId, userId, potId, userId).first();

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
    WITH schedule_base AS (
      SELECT 
        cs.id as schedule_id,
        cs.care_type,
        cs.interval_days,
        cs.custom_action,
        p.id as pot_id,
        p.name as pot_name,
        p.image_url as pot_image,
        p.last_care,
        COALESCE(
          NULLIF(p.last_care, ''),
          NULLIF(p.plant_date, ''),
          date('now', 'localtime')
        ) as reminder_start_date
      FROM care_schedules cs
      JOIN pots p ON cs.pot_id = p.id
      WHERE (p.user_id = ? OR p.id IN (SELECT pot_id FROM pot_collaborators WHERE user_id = ?))
        AND cs.enabled = 1
        AND COALESCE(p.status, 'active') = 'active'
    )
    SELECT 
      schedule_id,
      care_type,
      interval_days,
      custom_action,
      pot_id,
      pot_name,
      pot_image,
      last_care,
      reminder_start_date,
      julianday(date('now', 'localtime')) - julianday(
        reminder_start_date
      ) as days_since_care
    FROM schedule_base
    WHERE julianday(date('now', 'localtime')) - julianday(reminder_start_date) >= interval_days
    ORDER BY days_since_care DESC
  `).bind(userId, userId).all();

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
        reminderStartDate: r.reminder_start_date,
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

        const potId = String(body.potId || '').trim();
        const careType = String(body.careType || '').trim();
        const intervalDays = Number(body.intervalDays);
        const customAction = String(body.customAction || '').trim();
        const { enabled = true } = body;

        if (!potId || !careType || !Number.isFinite(intervalDays) || intervalDays < 1) {
            return errorResponse('缺少必要的提醒信息', 400);
        }

        if (careType === 'custom' && !customAction) {
            return errorResponse('请输入自定义提醒名称', 400);
        }

        // 验证花盆归属或协作权限
        const pot = await env.DB.prepare(`
          SELECT p.id FROM pots p
          LEFT JOIN pot_collaborators pc ON p.id = pc.pot_id
          WHERE p.id = ?
            AND COALESCE(p.status, 'active') = 'active'
            AND (p.user_id = ? OR pc.user_id = ?)
        `).bind(potId, userId, userId).first();

        if (!pot) {
            return errorResponse('Pot not found or access denied', 404);
        }

        // 标准提醒同一类型只允许一个；自定义提醒按名称判重，允许添加多个不同名称。
        const existing = careType === 'custom'
            ? await env.DB.prepare(`
      SELECT id FROM care_schedules
      WHERE pot_id = ?
        AND care_type = 'custom'
        AND lower(trim(COALESCE(custom_action, ''))) = lower(?)
    `).bind(potId, customAction).first()
            : await env.DB.prepare(`
      SELECT id FROM care_schedules WHERE pot_id = ? AND care_type = ?
    `).bind(potId, careType).first();

        if (existing) {
            return errorResponse(careType === 'custom'
                ? '已存在同名自定义提醒'
                : '该类型提醒已存在', 409);
        }

        // 创建计划
        const result = await env.DB.prepare(`
      INSERT INTO care_schedules (pot_id, care_type, interval_days, custom_action, enabled)
      VALUES (?, ?, ?, ?, ?)
    `).bind(potId, careType, intervalDays, careType === 'custom' ? customAction : null, enabled ? 1 : 0).run();

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

        const schedule = await env.DB.prepare(`
      SELECT cs.id FROM care_schedules cs
      JOIN pots p ON cs.pot_id = p.id
      LEFT JOIN pot_collaborators pc ON p.id = pc.pot_id
      WHERE cs.id = ?
        AND COALESCE(p.status, 'active') = 'active'
        AND (p.user_id = ? OR pc.user_id = ?)
    `).bind(scheduleId, userId, userId).first();

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
        const schedule = await env.DB.prepare(`
      SELECT cs.id FROM care_schedules cs
      JOIN pots p ON cs.pot_id = p.id
      LEFT JOIN pot_collaborators pc ON p.id = pc.pot_id
      WHERE cs.id = ?
        AND COALESCE(p.status, 'active') = 'active'
        AND (p.user_id = ? OR pc.user_id = ?)
    `).bind(scheduleId, userId, userId).first();

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
