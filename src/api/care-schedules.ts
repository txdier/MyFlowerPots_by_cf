import { jsonResponse, errorResponse } from '../utils/response-utils';
import { findAccessiblePot } from '../utils/pot-access-utils';

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

const SCHEDULE_KIND_SQL = `
CASE
  WHEN lower(trim(cs.care_type)) IN ('water', 'watering', 'change_water', 'water_change', 'changewater', '换水', '浇水') THEN 'water'
  WHEN lower(trim(cs.care_type)) IN ('fertilize', 'fertilizer', 'feed', '施肥') THEN 'fertilize'
  WHEN lower(trim(cs.care_type)) IN ('trim', 'prune', 'pruning', '修剪') THEN 'prune'
  WHEN lower(trim(cs.care_type)) IN ('repot', 're-pot', '换盆') THEN 'repot'
  WHEN lower(trim(cs.care_type)) IN ('pest', 'pests', '除虫', '病虫害') THEN 'pest'
  ELSE 'custom'
END
`;

const RECORD_KIND_SQL = `
CASE
  WHEN lower(trim(COALESCE(cr.type, ''))) IN ('water', 'watering', 'change_water', 'water_change', 'changewater', '换水', '浇水')
    OR instr(lower(trim(COALESCE(cr.action, ''))), '换水') > 0
    OR instr(lower(trim(COALESCE(cr.action, ''))), '浇水') > 0
    OR instr(lower(trim(COALESCE(cr.action, ''))), '补水') > 0
    THEN 'water'
  WHEN lower(trim(COALESCE(cr.type, ''))) IN ('fertilize', 'fertilizer', 'feed', '施肥')
    OR instr(lower(trim(COALESCE(cr.action, ''))), '施肥') > 0
    OR instr(lower(trim(COALESCE(cr.action, ''))), '追肥') > 0
    THEN 'fertilize'
  WHEN lower(trim(COALESCE(cr.type, ''))) IN ('trim', 'prune', 'pruning', '修剪')
    OR instr(lower(trim(COALESCE(cr.action, ''))), '修剪') > 0
    OR instr(lower(trim(COALESCE(cr.action, ''))), '打顶') > 0
    OR instr(lower(trim(COALESCE(cr.action, ''))), '摘心') > 0
    THEN 'prune'
  WHEN lower(trim(COALESCE(cr.type, ''))) IN ('repot', 're-pot', '换盆')
    OR instr(lower(trim(COALESCE(cr.action, ''))), '换盆') > 0
    OR instr(lower(trim(COALESCE(cr.action, ''))), '翻盆') > 0
    THEN 'repot'
  WHEN lower(trim(COALESCE(cr.type, ''))) IN ('pest', 'pests', '除虫', '病虫害')
    OR instr(lower(trim(COALESCE(cr.action, ''))), '除虫') > 0
    OR instr(lower(trim(COALESCE(cr.action, ''))), '病虫害') > 0
    OR instr(lower(trim(COALESCE(cr.action, ''))), '杀虫') > 0
    THEN 'pest'
  ELSE 'custom'
END
`;

export async function getPotCareSchedulesWithLastCare(env: any, potId: string): Promise<any[]> {
    const { results } = await env.DB.prepare(`
    WITH schedule_rows AS (
      SELECT
        cs.*,
        ${SCHEDULE_KIND_SQL} AS schedule_kind,
        lower(trim(COALESCE(cs.custom_action, ''))) AS custom_action_l
      FROM care_schedules cs
      WHERE cs.pot_id = ?
    ),
    record_rows AS (
      SELECT
        cr.pot_id,
        date(NULLIF(cr.care_date, '')) AS care_date,
        lower(trim(COALESCE(cr.type, ''))) AS record_type_raw,
        lower(trim(COALESCE(cr.action, ''))) AS record_action_raw,
        ${RECORD_KIND_SQL} AS record_kind
      FROM care_records cr
      WHERE cr.pot_id = ?
    )
    SELECT
      sr.*,
      (
        SELECT MAX(rr.care_date)
        FROM record_rows rr
        WHERE rr.pot_id = sr.pot_id
          AND (
            (sr.schedule_kind <> 'custom' AND rr.record_kind = sr.schedule_kind)
            OR (
              sr.schedule_kind = 'custom'
              AND sr.custom_action_l <> ''
              AND (rr.record_type_raw = sr.custom_action_l OR rr.record_action_raw = sr.custom_action_l)
            )
          )
      ) AS schedule_last_care
    FROM schedule_rows sr
    ORDER BY sr.care_type ASC
  `).bind(potId, potId).all();

    return (results || []) as any[];
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

    if (request.method === 'GET' && path === '/api/care-schedules') {
        return handleGetAllSchedules(env, userId);
    }

    if (request.method === 'GET' && path === '/api/care-schedules/reminders') {
        return handleGetReminders(env, userId);
    }

    const potMatch = path.match(/^\/api\/care-schedules\/pot\/([^/]+)$/);
    if (request.method === 'GET' && potMatch) {
        return handleGetSchedulesByPot(env, userId, potMatch[1]);
    }

    if (request.method === 'POST' && path === '/api/care-schedules') {
        return handleCreateSchedule(request, env, userId);
    }

    const updateMatch = path.match(/^\/api\/care-schedules\/(\d+)$/);
    if (request.method === 'PUT' && updateMatch) {
        return handleUpdateSchedule(request, env, userId, parseInt(updateMatch[1]));
    }

    const deleteMatch = path.match(/^\/api\/care-schedules\/(\d+)$/);
    if (request.method === 'DELETE' && deleteMatch) {
        return handleDeleteSchedule(env, userId, parseInt(deleteMatch[1]));
    }

    return errorResponse('Not Found', 404);
}

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

async function handleGetSchedulesByPot(env: any, userId: string, potId: string): Promise<Response> {
    const pot = await findAccessiblePot(env, potId, userId, 'manage', { allowArchived: false });
    if (!pot) {
        return errorResponse('Pot not found or access denied', 404);
    }

    const results = await getPotCareSchedulesWithLastCare(env, potId);
    return jsonResponse({
        success: true,
        data: results
    });
}

async function handleGetReminders(env: any, userId: string): Promise<Response> {
    const reminders = await getCareRemindersData(env, userId);
    return jsonResponse({
        success: true,
        data: reminders,
        count: reminders.length
    });
}

export async function getCareRemindersData(env: any, userId: string): Promise<any[]> {
    const { results } = await env.DB.prepare(`
    WITH schedule_base AS (
      SELECT
        cs.id AS schedule_id,
        cs.care_type,
        cs.interval_days,
        cs.custom_action,
        cs.created_at,
        p.id AS pot_id,
        p.name AS pot_name,
        p.image_url AS pot_image,
        ${SCHEDULE_KIND_SQL} AS schedule_kind,
        lower(trim(COALESCE(cs.custom_action, ''))) AS custom_action_l
      FROM care_schedules cs
      JOIN pots p ON cs.pot_id = p.id
      WHERE (p.user_id = ? OR p.id IN (SELECT pot_id FROM pot_collaborators WHERE user_id = ?))
        AND cs.enabled = 1
        AND COALESCE(p.status, 'active') = 'active'
    ),
    record_base AS (
      SELECT
        cr.pot_id,
        date(NULLIF(cr.care_date, '')) AS care_date,
        lower(trim(COALESCE(cr.type, ''))) AS record_type_raw,
        lower(trim(COALESCE(cr.action, ''))) AS record_action_raw,
        ${RECORD_KIND_SQL} AS record_kind
      FROM care_records cr
    ),
    schedule_with_last AS (
      SELECT
        sb.*,
        (
          SELECT MAX(rb.care_date)
          FROM record_base rb
          WHERE rb.pot_id = sb.pot_id
            AND (
              (sb.schedule_kind <> 'custom' AND rb.record_kind = sb.schedule_kind)
              OR (
                sb.schedule_kind = 'custom'
                AND sb.custom_action_l <> ''
                AND (rb.record_type_raw = sb.custom_action_l OR rb.record_action_raw = sb.custom_action_l)
              )
            )
        ) AS schedule_last_care
      FROM schedule_base sb
    ),
    due_schedules AS (
      SELECT
        schedule_id,
        care_type,
        interval_days,
        custom_action,
        pot_id,
        pot_name,
        pot_image,
        schedule_last_care,
        COALESCE(
          date(NULLIF(schedule_last_care, '')),
          date(NULLIF(created_at, ''), 'localtime'),
          date('now', 'localtime')
        ) AS reminder_start_date
      FROM schedule_with_last
    )
    SELECT
      schedule_id,
      care_type,
      interval_days,
      custom_action,
      pot_id,
      pot_name,
      pot_image,
      schedule_last_care,
      reminder_start_date,
      julianday(date('now', 'localtime')) - julianday(reminder_start_date) AS days_since_care
    FROM due_schedules
    WHERE julianday(date('now', 'localtime')) - julianday(reminder_start_date) >= interval_days
    ORDER BY days_since_care DESC
  `).bind(userId, userId).all();

    return (results || []).map((r: any) => ({
        scheduleId: r.schedule_id,
        potId: r.pot_id,
        potName: r.pot_name,
        potImage: r.pot_image,
        careType: r.care_type,
        customAction: r.custom_action,
        intervalDays: r.interval_days,
        daysSinceCare: Math.floor(r.days_since_care),
        lastCare: r.schedule_last_care,
        scheduleLastCare: r.schedule_last_care,
        reminderStartDate: r.reminder_start_date,
        isOverdue: r.days_since_care >= r.interval_days
    }));
}

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
            return errorResponse('Missing required schedule fields', 400);
        }
        if (careType === 'custom' && !customAction) {
            return errorResponse('Custom reminder name is required', 400);
        }

        const pot = await findAccessiblePot(env, potId, userId, 'manage', {
            allowArchived: false,
            select: 'p.id'
        });
        if (!pot) {
            return errorResponse('Pot not found or access denied', 404);
        }

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
            return errorResponse(
                careType === 'custom' ? 'Duplicate custom reminder name' : 'Schedule type already exists',
                409
            );
        }

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
      SELECT id, pot_id FROM care_schedules WHERE id = ?
    `).bind(scheduleId).first();
        if (!schedule) {
            return errorResponse('Schedule not found or access denied', 404);
        }

        const pot = await findAccessiblePot(env, schedule.pot_id, userId, 'manage', {
            allowArchived: false,
            select: 'p.id'
        });
        if (!pot) {
            return errorResponse('Schedule not found or access denied', 404);
        }

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

async function handleDeleteSchedule(env: any, userId: string, scheduleId: number): Promise<Response> {
    try {
        const schedule = await env.DB.prepare(`
      SELECT id, pot_id FROM care_schedules WHERE id = ?
    `).bind(scheduleId).first();
        if (!schedule) {
            return errorResponse('Schedule not found or access denied', 404);
        }

        const pot = await findAccessiblePot(env, schedule.pot_id, userId, 'manage', {
            allowArchived: false,
            select: 'p.id'
        });
        if (!pot) {
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
