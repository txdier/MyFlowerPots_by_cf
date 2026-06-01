import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getAnalytics,
  getAnalyticsDateString,
  getDailyTrend,
  queuePageVisit,
  recordPageVisit,
} from '../../src/api/analytics';

function createRequest(url = 'https://app.kaside365.com/?from=test') {
  const request = new Request(url, {
    headers: {
      'cf-connecting-ip': '203.0.113.10',
      'user-agent': 'vitest',
    },
  }) as Request & { cf?: Record<string, string> };

  request.cf = {
    country: 'US',
    colo: 'LAX',
  };

  return request;
}

describe('page visit analytics', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('writes page visits to Analytics Engine without waitUntil or D1 writes', () => {
    const writeDataPoint = vi.fn();
    const batch = vi.fn();
    const env = {
      PAGE_ANALYTICS: { writeDataPoint },
      DB: { batch },
      ANALYTICS_TIMEZONE: 'Asia/Shanghai',
    };
    const ctx = { waitUntil: vi.fn() };
    const request = createRequest();

    queuePageVisit(ctx, env, '/', request);

    expect(ctx.waitUntil).not.toHaveBeenCalled();
    expect(batch).not.toHaveBeenCalled();
    expect(writeDataPoint).toHaveBeenCalledTimes(1);
    expect(writeDataPoint).toHaveBeenCalledWith({
      indexes: ['/'],
      blobs: [
        '/',
        getAnalyticsDateString(env),
        'app.kaside365.com',
        'US',
        'LAX',
      ],
      doubles: [1],
    });
  });

  it('falls back to D1 page visit writes when Analytics Engine is not bound', async () => {
    const statements: Array<{ sql: string; values: unknown[] }> = [];
    const env = {
      DB: {
        prepare: vi.fn((sql: string) => ({
          bind: (...values: unknown[]) => {
            const statement = { sql, values };
            statements.push(statement);
            return statement;
          },
        })),
        batch: vi.fn(),
      },
      ANALYTICS_TIMEZONE: 'Asia/Shanghai',
    };

    await recordPageVisit(env, '/admin-stats');

    expect(env.DB.prepare).toHaveBeenCalledTimes(2);
    expect(env.DB.batch).toHaveBeenCalledTimes(1);
    expect(env.DB.batch).toHaveBeenCalledWith(statements);
    expect(statements[0].values[0]).toBe('/admin-stats');
    expect(statements[1].values).toEqual(['/admin-stats', getAnalyticsDateString(env)]);
  });

  it('queries page totals from Analytics Engine with sample interval correction', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      data: [
        { path: '/admin-stats', visit_count: 7 },
        { path: '/', visit_count: 3 },
      ],
    })));
    vi.stubGlobal('fetch', fetchMock);
    const env = {
      CLOUDFLARE_ACCOUNT_ID: 'account-123',
      ANALYTICS_ENGINE_API_TOKEN: 'token-123',
      PAGE_ANALYTICS_DATASET: 'page_dataset',
    };

    const rows = await getAnalytics(env, '2026-05-06', '2026-05-07');

    expect(rows).toEqual([
      { path: '/admin-stats', visit_count: 7 },
      { path: '/', visit_count: 3 },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.cloudflare.com/client/v4/accounts/account-123/analytics_engine/sql');
    expect(init.headers.Authorization).toBe('Bearer token-123');
    expect(init.body).toContain('page_dataset');
    expect(init.body).toContain('SUM(_sample_interval * double1)');
    expect(init.body).toContain('blob1 AS path');
    expect(init.body).toContain('MAX(timestamp) AS last_updated');
    expect(init.body).not.toContain('MAX(blob2)');
  });

  it('queries daily trend from Analytics Engine by analytics date blob', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      data: [
        { visit_date: '2026-05-06', total_visits: 3 },
        { visit_date: '2026-05-07', total_visits: 4 },
      ],
    })));
    vi.stubGlobal('fetch', fetchMock);
    const env = {
      CLOUDFLARE_ACCOUNT_ID: 'account-123',
      ANALYTICS_ENGINE_API_TOKEN: 'token-123',
      PAGE_ANALYTICS_DATASET: 'page_dataset',
    };

    const rows = await getDailyTrend(env, '2026-05-06', '2026-05-07');

    expect(rows).toEqual([
      { visit_date: '2026-05-06', total_visits: 3 },
      { visit_date: '2026-05-07', total_visits: 4 },
    ]);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.body).toContain('blob2 AS visit_date');
    expect(init.body).toContain('GROUP BY blob2');
  });
});
