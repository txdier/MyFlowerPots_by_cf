export async function recordPageVisit(env: any, path: string): Promise<void> {
  // 归一化根路径
  if (path === '/' || path === '') {
    path = '/index.html';
  }

  // 只统计 .html 页面
  if (!path.endsWith('.html') && path !== '/index.html') {
    return;
  }

  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  try {
    // 同时更新总计表和每日表
    const batch = [
      env.DB.prepare(`
        INSERT INTO page_visits (path, visit_count, last_updated)
        VALUES (?, 1, datetime('now'))
        ON CONFLICT(path) DO UPDATE SET
          visit_count = visit_count + 1,
          last_updated = datetime('now')
      `).bind(path),
      env.DB.prepare(`
        INSERT INTO page_visits_daily (path, visit_date, visit_count)
        VALUES (?, ?, 1)
        ON CONFLICT(path, visit_date) DO UPDATE SET
          visit_count = visit_count + 1
      `).bind(path, today),
    ];
    await env.DB.batch(batch);
  } catch (error) {
    console.error('Failed to record page visit:', error);
  }
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
