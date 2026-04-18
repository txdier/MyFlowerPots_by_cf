type WaitUntilContext = {
  waitUntil(promise: Promise<unknown>): void;
};

const TRACKED_PAGE_PATHS = new Set([
  '/',
  '/add-pot',
  '/admin-inbox',
  '/admin-plants',
  '/admin-stats',
  '/all-records',
  '/all-timelines',
  '/care-record',
  '/edit-pot',
  '/error',
  '/pot-detail',
  '/profile',
  '/reset-password',
]);

export function queuePageVisit(ctx: WaitUntilContext | undefined, env: any, path: string): void {
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

    await Promise.all([
      totalVisit.run(),
      dailyVisit.run(),
    ]);
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
