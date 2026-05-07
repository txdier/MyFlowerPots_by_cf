export type PotActivityType =
  | 'timeline_created'
  | 'timeline_updated'
  | 'pot_updated'
  | 'archive_timeline_created';

export type PotActivityState = {
  hasNewActivity: boolean;
  newActivityCount: number;
  latestActivityType: string | null;
  latestActivitySummary: string | null;
  latestActivityAt: string | null;
};

const DEFAULT_ACTIVITY_SUMMARY: Record<PotActivityType, string> = {
  timeline_created: '新增成长轨迹',
  timeline_updated: '更新成长轨迹',
  pot_updated: '更新植物信息',
  archive_timeline_created: '归档时留下新轨迹'
};

function buildPlaceholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ');
}

export async function recordPotActivity(
  env: any,
  potId: string,
  actorId: string | null,
  type: PotActivityType,
  summary?: string | null,
  createdAt?: string | null
): Promise<void> {
  try {
    await env.DB.prepare(`
      INSERT INTO pot_activity_events (pot_id, actor_id, type, summary, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      potId,
      actorId || null,
      type,
      summary || DEFAULT_ACTIVITY_SUMMARY[type],
      createdAt || new Date().toISOString()
    ).run();
  } catch (error) {
    console.error('Failed to record pot activity:', error);
  }
}

export async function markPotActivityRead(
  env: any,
  potId: string,
  userId: string
): Promise<number> {
  const latest: any = await env.DB.prepare(`
    SELECT COALESCE(MAX(id), 0) as latest_event_id
    FROM pot_activity_events
    WHERE pot_id = ?
  `).bind(potId).first();

  const latestEventId = Number(latest?.latest_event_id || 0);
  await env.DB.prepare(`
    INSERT INTO pot_activity_reads (user_id, pot_id, last_read_event_id, read_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, pot_id) DO UPDATE SET
      last_read_event_id = CASE
        WHEN excluded.last_read_event_id > pot_activity_reads.last_read_event_id
        THEN excluded.last_read_event_id
        ELSE pot_activity_reads.last_read_event_id
      END,
      read_at = excluded.read_at
  `).bind(userId, potId, latestEventId, new Date().toISOString()).run();

  return latestEventId;
}

export async function loadPotActivityStates(
  env: any,
  userId: string,
  potIds: string[]
): Promise<Map<string, PotActivityState>> {
  const states = new Map<string, PotActivityState>();
  const uniquePotIds = Array.from(new Set(potIds.map(id => String(id || '').trim()).filter(Boolean)));
  if (uniquePotIds.length === 0) return states;

  const placeholders = buildPlaceholders(uniquePotIds.length);
  const { results } = await env.DB.prepare(`
    SELECT
      pot_id,
      type,
      summary,
      created_at,
      unread_count
    FROM (
      SELECT
        e.pot_id,
        e.type,
        e.summary,
        e.created_at,
        COUNT(*) OVER (PARTITION BY e.pot_id) as unread_count,
        ROW_NUMBER() OVER (PARTITION BY e.pot_id ORDER BY e.id DESC) as row_num
      FROM pot_activity_events e
      LEFT JOIN pot_activity_reads r
        ON r.pot_id = e.pot_id AND r.user_id = ?
      WHERE e.pot_id IN (${placeholders})
        AND e.id > COALESCE(r.last_read_event_id, 0)
        AND (e.actor_id IS NULL OR e.actor_id <> ?)
    )
    WHERE row_num = 1
  `).bind(userId, ...uniquePotIds, userId).all();

  for (const row of (results || []) as any[]) {
    const count = Number(row.unread_count || 0);
    states.set(String(row.pot_id), {
      hasNewActivity: count > 0,
      newActivityCount: count,
      latestActivityType: row.type || null,
      latestActivitySummary: row.summary || null,
      latestActivityAt: row.created_at || null
    });
  }

  return states;
}

export function getEmptyPotActivityState(): PotActivityState {
  return {
    hasNewActivity: false,
    newActivityCount: 0,
    latestActivityType: null,
    latestActivitySummary: null,
    latestActivityAt: null
  };
}
