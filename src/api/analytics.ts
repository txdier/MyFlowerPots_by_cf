type WaitUntilContext = {
  waitUntil(promise: Promise<unknown>): void;
};

const TRACKED_PAGE_PATHS = new Set([
  '/',
  '/add-pot',
  '/admin-inbox',
  '/admin-cache',
  '/admin-plants',
  '/admin-stats',
  '/admin-users',
  '/all-records',
  '/all-timelines',
  '/care-record',
  '/edit-pot',
  '/error',
  '/pot-detail',
  '/profile',
  '/reset-password',
]);

const DEFAULT_PAGE_VISIT_THROTTLE_MS = 30 * 60 * 1000;
const PAGE_VISIT_THROTTLE_MAX_ENTRIES = 1000;
let lastPageVisitThrottleCleanup = 0;
const recentPageVisitKeys = new Map<string, number>();

export function queuePageVisit(
  ctx: WaitUntilContext | undefined,
  env: any,
  path: string,
  request?: Request
): void {
  path = normalizePagePath(path);

  if (!TRACKED_PAGE_PATHS.has(path)) {
    return;
  }

  if (request && shouldThrottlePageVisit(path, request, env)) {
    return;
  }

  if (ctx?.waitUntil) {
    ctx.waitUntil(recordPageVisit(env, path));
    return;
  }

  const task = recordPageVisit(env, path);
  task.catch((error) => {
    console.error('Failed to queue page visit:', error);
  });
}

export async function recordPageVisit(env: any, path: string): Promise<void> {
  if (!env?.DB) {
    console.warn('Skipping page visit recording: DB binding unavailable');
    return;
  }

  path = normalizePagePath(path);
  const visitDate = getAnalyticsDateString(env);

  // 只统计站内页面，路径统一为无扩展名形式。
  if (!TRACKED_PAGE_PATHS.has(path)) {
    return;
  }

  try {
    // 访问统计是 best-effort 后台任务，不需要和响应路径共享事务。
    const totalVisit = env.DB.prepare(`
        INSERT INTO page_visits (path, visit_count, last_updated)
        VALUES (?, 1, datetime('now'))
        ON CONFLICT(path) DO UPDATE SET
          visit_count = visit_count + 1,
          last_updated = datetime('now')
      `).bind(path);

    const dailyVisit = env.DB.prepare(`
        INSERT INTO page_visits_daily (path, visit_date, visit_count)
        VALUES (?, ?, 1)
        ON CONFLICT(path, visit_date) DO UPDATE SET
          visit_count = visit_count + 1
      `).bind(path, visitDate);

    await env.DB.batch([totalVisit, dailyVisit]);
  } catch (error) {
    console.error('Failed to record page visit:', error);
  }
}

function normalizePagePath(path: string): string {
  if (!path) return '/';
  const cleanPath = path.split('?')[0].split('#')[0].trim();
  if (cleanPath === '' || cleanPath === '/') return '/';
  const withLeadingSlash = cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`;
  const withoutTrailingSlash = withLeadingSlash.replace(/\/+$/, '') || '/';
  const withoutHtml = withoutTrailingSlash.replace(/\.html$/i, '');
  return withoutHtml === '/index' ? '/' : withoutHtml;
}

function getPageVisitThrottleMs(env: any): number {
  const configuredSeconds = Number(env?.PAGE_VISIT_THROTTLE_SECONDS || 0);
  if (Number.isFinite(configuredSeconds) && configuredSeconds > 0) {
    return configuredSeconds * 1000;
  }
  return DEFAULT_PAGE_VISIT_THROTTLE_MS;
}

function shouldThrottlePageVisit(path: string, request: Request, env: any): boolean {
  const now = Date.now();
  const throttleMs = getPageVisitThrottleMs(env);
  cleanupRecentPageVisits(now, throttleMs);

  const visitorKey = [
    request.headers.get('authorization') || '',
    request.headers.get('cookie') || '',
    request.headers.get('cf-connecting-ip') || '',
    request.headers.get('x-forwarded-for') || '',
    request.headers.get('user-agent') || ''
  ].join('|');
  const key = `${path}:${hashThrottleKey(visitorKey || 'anonymous')}`;
  const lastSeen = recentPageVisitKeys.get(key) || 0;

  if (lastSeen && now - lastSeen < throttleMs) {
    return true;
  }

  recentPageVisitKeys.set(key, now);
  return false;
}

function cleanupRecentPageVisits(now: number, throttleMs: number): void {
  if (
    now - lastPageVisitThrottleCleanup < throttleMs
    && recentPageVisitKeys.size <= PAGE_VISIT_THROTTLE_MAX_ENTRIES
  ) {
    return;
  }

  lastPageVisitThrottleCleanup = now;
  for (const [key, timestamp] of recentPageVisitKeys) {
    if (now - timestamp >= throttleMs) {
      recentPageVisitKeys.delete(key);
    }
  }

  if (recentPageVisitKeys.size <= PAGE_VISIT_THROTTLE_MAX_ENTRIES) {
    return;
  }

  const overflow = recentPageVisitKeys.size - PAGE_VISIT_THROTTLE_MAX_ENTRIES;
  let removed = 0;
  for (const key of recentPageVisitKeys.keys()) {
    recentPageVisitKeys.delete(key);
    removed++;
    if (removed >= overflow) break;
  }
}

function hashThrottleKey(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function getAnalyticsDateString(env: any, offsetDays = 0): string {
  const timeZone = env?.ANALYTICS_TIMEZONE || 'Asia/Shanghai';
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (!year || !month || !day) {
    return date.toISOString().split('T')[0];
  }

  return `${year}-${month}-${day}`;
}

// 获取统计数据，支持日期范围筛选
export async function getAnalytics(env: any, startDate?: string, endDate?: string): Promise<any[]> {
  try {
    // 如果提供了日期范围，从 page_visits_daily 表按日期汇总
    if (startDate && endDate) {
      const { results } = await env.DB.prepare(`
        SELECT path, SUM(visit_count) as visit_count, MAX(visit_date) as last_updated
        FROM page_visits_daily
        WHERE visit_date >= ? AND visit_date <= ?
        GROUP BY path
        ORDER BY visit_count DESC
      `).bind(startDate, endDate).all();
      return results || [];
    }

    // 不带日期筛选时，从总计表获取
    const { results } = await env.DB.prepare(`
      SELECT path, visit_count, last_updated 
      FROM page_visits 
      ORDER BY visit_count DESC
    `).all();
    return results || [];
  } catch (error) {
    console.error('Failed to get analytics:', error);
    return [];
  }
}

// 获取每日趋势数据
export async function getDailyTrend(env: any, startDate: string, endDate: string): Promise<any[]> {
  try {
    const { results } = await env.DB.prepare(`
      SELECT visit_date, SUM(visit_count) as total_visits
      FROM page_visits_daily
      WHERE visit_date >= ? AND visit_date <= ?
      GROUP BY visit_date
      ORDER BY visit_date ASC
    `).bind(startDate, endDate).all();
    return results || [];
  } catch (error) {
    console.error('Failed to get daily trend:', error);
    return [];
  }
}
