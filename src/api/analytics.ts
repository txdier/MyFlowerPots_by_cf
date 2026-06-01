type WaitUntilContext = {
  waitUntil(promise: Promise<unknown>): void;
};

type AnalyticsEngineDataset = {
  writeDataPoint(dataPoint: {
    indexes: string[];
    blobs: string[];
    doubles: number[];
  }): void;
};

export type AnalyticsSource = 'analytics-engine' | 'd1-fallback';

export const ANALYTICS_ENGINE_RETENTION_DAYS = 90;

const DEFAULT_ANALYTICS_ENGINE_DATASET = 'my_flower_pots_page_visits';

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

  if (writePageVisitToAnalyticsEngine(env, path, request)) {
    return;
  }

  if (ctx?.waitUntil) {
    ctx.waitUntil(recordD1PageVisit(env, path));
    return;
  }

  const task = recordD1PageVisit(env, path);
  task.catch((error) => {
    console.error('Failed to queue page visit:', error);
  });
}

export async function recordPageVisit(env: any, path: string, request?: Request): Promise<void> {
  path = normalizePagePath(path);

  if (!TRACKED_PAGE_PATHS.has(path)) {
    return;
  }

  if (writePageVisitToAnalyticsEngine(env, path, request)) {
    return;
  }

  await recordD1PageVisit(env, path);
}

function writePageVisitToAnalyticsEngine(env: any, path: string, request?: Request): boolean {
  const dataset = getPageAnalyticsDataset(env);
  if (!dataset) {
    return false;
  }

  const normalizedPath = normalizePagePath(path);
  if (!TRACKED_PAGE_PATHS.has(normalizedPath)) {
    return true;
  }

  try {
    const requestUrl = request ? new URL(request.url) : null;
    const cf = ((request as any)?.cf || {}) as Record<string, unknown>;
    const country = String(cf.country || request?.headers.get('cf-ipcountry') || '');
    const colo = String(cf.colo || '');

    dataset.writeDataPoint({
      indexes: [normalizedPath],
      blobs: [
        normalizedPath,
        getAnalyticsDateString(env),
        requestUrl?.hostname || '',
        country,
        colo,
      ],
      doubles: [1],
    });
  } catch (error) {
    console.error('Failed to record page visit in Analytics Engine:', error);
  }

  return true;
}

function getPageAnalyticsDataset(env: any): AnalyticsEngineDataset | null {
  const dataset = env?.PAGE_ANALYTICS;
  return dataset && typeof dataset.writeDataPoint === 'function' ? dataset : null;
}

async function recordD1PageVisit(env: any, path: string): Promise<void> {
  if (!env?.DB) {
    console.warn('Skipping page visit recording: DB binding unavailable');
    return;
  }

  path = normalizePagePath(path);
  const visitDate = getAnalyticsDateString(env);

  if (!TRACKED_PAGE_PATHS.has(path)) {
    return;
  }

  try {
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

export function getAnalyticsResultSource(rows: any[]): AnalyticsSource {
  return (rows as any)?.source === 'analytics-engine' ? 'analytics-engine' : 'd1-fallback';
}

function withAnalyticsSource<T extends any[]>(rows: T, source: AnalyticsSource): T {
  Object.defineProperty(rows, 'source', {
    value: source,
    enumerable: false,
    configurable: true,
  });
  return rows;
}

export async function getAnalytics(env: any, startDate?: string, endDate?: string): Promise<any[]> {
  if (hasAnalyticsEngineQueryConfig(env)) {
    try {
      const rows = await getAnalyticsFromAnalyticsEngine(env, startDate, endDate);
      return withAnalyticsSource(rows, 'analytics-engine');
    } catch (error) {
      console.error('Failed to get analytics from Analytics Engine:', error);
    }
  }

  return withAnalyticsSource(await getD1Analytics(env, startDate, endDate), 'd1-fallback');
}

export async function getDailyTrend(env: any, startDate: string, endDate: string): Promise<any[]> {
  if (hasAnalyticsEngineQueryConfig(env)) {
    try {
      const rows = await getDailyTrendFromAnalyticsEngine(env, startDate, endDate);
      return withAnalyticsSource(rows, 'analytics-engine');
    } catch (error) {
      console.error('Failed to get daily trend from Analytics Engine:', error);
    }
  }

  return withAnalyticsSource(await getD1DailyTrend(env, startDate, endDate), 'd1-fallback');
}

function hasAnalyticsEngineQueryConfig(env: any): boolean {
  return Boolean(env?.CLOUDFLARE_ACCOUNT_ID && env?.ANALYTICS_ENGINE_API_TOKEN);
}

function getAnalyticsEngineDatasetName(env: any): string {
  const configured = String(env?.PAGE_ANALYTICS_DATASET || '').trim();
  if (/^[A-Za-z0-9_]+$/.test(configured)) {
    return configured;
  }
  return DEFAULT_ANALYTICS_ENGINE_DATASET;
}

function normalizeAnalyticsDate(value: string | undefined, fallback: string): string {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  return fallback;
}

function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}

async function getAnalyticsFromAnalyticsEngine(
  env: any,
  startDate?: string,
  endDate?: string
): Promise<any[]> {
  const today = getAnalyticsDateString(env);
  const defaultStart = getAnalyticsDateString(env, -30);
  const start = normalizeAnalyticsDate(startDate, defaultStart);
  const end = normalizeAnalyticsDate(endDate, today);
  const dataset = getAnalyticsEngineDatasetName(env);
  const sql = `
    SELECT
      blob1 AS path,
      SUM(_sample_interval * double1) AS visit_count,
      MAX(timestamp) AS last_updated
    FROM ${dataset}
    WHERE blob2 >= '${escapeSqlString(start)}' AND blob2 <= '${escapeSqlString(end)}'
    GROUP BY blob1
    ORDER BY visit_count DESC
  `;

  const rows = await queryAnalyticsEngine(env, sql);
  return rows.map((row) => ({
    path: String(row.path || ''),
    visit_count: Number(row.visit_count || 0),
    ...(row.last_updated ? { last_updated: row.last_updated } : {}),
  }));
}

async function getDailyTrendFromAnalyticsEngine(
  env: any,
  startDate: string,
  endDate: string
): Promise<any[]> {
  const start = normalizeAnalyticsDate(startDate, getAnalyticsDateString(env, -30));
  const end = normalizeAnalyticsDate(endDate, getAnalyticsDateString(env));
  const dataset = getAnalyticsEngineDatasetName(env);
  const sql = `
    SELECT
      blob2 AS visit_date,
      SUM(_sample_interval * double1) AS total_visits
    FROM ${dataset}
    WHERE blob2 >= '${escapeSqlString(start)}' AND blob2 <= '${escapeSqlString(end)}'
    GROUP BY blob2
    ORDER BY visit_date ASC
  `;

  const rows = await queryAnalyticsEngine(env, sql);
  return rows.map((row) => ({
    visit_date: String(row.visit_date || ''),
    total_visits: Number(row.total_visits || 0),
  }));
}

async function queryAnalyticsEngine(env: any, sql: string): Promise<any[]> {
  const accountId = encodeURIComponent(String(env.CLOUDFLARE_ACCOUNT_ID));
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/analytics_engine/sql`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.ANALYTICS_ENGINE_API_TOKEN}`,
        'Content-Type': 'text/plain',
      },
      body: sql,
    }
  );
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Analytics Engine SQL API returned ${response.status}: ${text}`);
  }

  if (!text.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if (Array.isArray(parsed?.data)) {
      return parsed.data;
    }
    if (Array.isArray(parsed?.result)) {
      return parsed.result;
    }
  } catch {
    const rows = text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    if (rows.length > 0) {
      return rows;
    }
  }

  return [];
}

async function getD1Analytics(env: any, startDate?: string, endDate?: string): Promise<any[]> {
  try {
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

    const { results } = await env.DB.prepare(`
      SELECT path, visit_count, last_updated
      FROM page_visits
      ORDER BY visit_count DESC
    `).all();
    return results || [];
  } catch (error) {
    console.error('Failed to get D1 analytics:', error);
    return [];
  }
}

async function getD1DailyTrend(env: any, startDate: string, endDate: string): Promise<any[]> {
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
    console.error('Failed to get D1 daily trend:', error);
    return [];
  }
}
