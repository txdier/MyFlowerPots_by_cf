import { env } from 'cloudflare:workers';
import {
  applyD1Migrations,
  createExecutionContext,
  reset,
  waitOnExecutionContext,
  type D1Migration,
} from 'cloudflare:test';
import { expect, inject } from 'vitest';
import worker from '../../src/index';

export type ApiOptions = {
  method?: string;
  token?: string;
  body?: unknown;
  headers?: Record<string, string>;
};

export type ApiFormOptions = {
  method?: string;
  token?: string;
  formData: FormData;
  headers?: Record<string, string>;
};

export type ApiResult<T = any> = {
  response: Response;
  status: number;
  json: T;
  text: string;
};

export type TestUser = {
  email: string;
  password: string;
  token: string;
  userId: string;
};

export const TEST_TURNSTILE_TOKEN = 'test-turnstile-token';

type RegisterUserOptions = {
  email?: string;
  password?: string;
  displayName?: string | null;
  emailVerified?: boolean;
};

const migrations = inject('d1Migrations') as D1Migration[];

const tablesToDrop = [
  'support_replies',
  'support_emails',
  'pot_comments',
  'pot_activity_reads',
  'pot_activity_events',
  'messages',
  'page_visits_daily',
  'page_visits',
  'pot_batch_invites',
  'pot_view_invites',
  'pot_collab_invites',
  'pot_viewers',
  'pot_collaborators',
  'care_schedules',
  'timelines',
  'care_records',
  'plant_synonyms',
  'plants',
  'pots',
  'users',
  'd1_migrations',
];

function assertTestBindings() {
  expect((env as any).JWT_SECRET).toBe('smoke-test-secret-with-enough-length');
  expect((env as any).APP_BASE_URL).toBe('https://example.test');
  expect((env as any).RESEND_API_KEY || '').toBe('');
}

export function testDb(): D1Database {
  const database = (env as any).DB as D1Database | undefined;
  if (!database) {
    throw new Error('Worker API tests require the DB binding.');
  }
  return database;
}

export async function resetWorkerTestDatabase() {
  assertTestBindings();
  await reset();

  const database = testDb();
  await database.batch(
    tablesToDrop.map((table) => database.prepare(`DROP TABLE IF EXISTS ${table}`))
  );
  await applyD1Migrations(database, migrations);
}

export async function api<T = any>(path: string, options: ApiOptions = {}): Promise<ApiResult<T>> {
  const headers = new Headers(options.headers || {});
  if (options.token) {
    headers.set('Authorization', `Bearer ${options.token}`);
  }

  let body: BodyInit | undefined;
  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(options.body);
  }

  return dispatch<T>(path, {
    method: options.method || (body ? 'POST' : 'GET'),
    headers,
    body,
  });
}

export async function apiForm<T = any>(path: string, options: ApiFormOptions): Promise<ApiResult<T>> {
  const headers = new Headers(options.headers || {});
  if (options.token) {
    headers.set('Authorization', `Bearer ${options.token}`);
  }

  return dispatch<T>(path, {
    method: options.method || 'POST',
    headers,
    body: options.formData,
  });
}

async function dispatch<T>(path: string, init: RequestInit): Promise<ApiResult<T>> {
  const request = new Request(`https://example.test${path}`, init);
  const ctx = createExecutionContext();
  const response = await worker.fetch(request, env, ctx);
  await waitOnExecutionContext(ctx);
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;

  return {
    response,
    status: response.status,
    json,
    text,
  };
}

export async function expectOk<T = any>(result: Promise<ApiResult<T>> | ApiResult<T>): Promise<T> {
  const resolved = await result;
  expect(resolved.status, resolved.text).toBeGreaterThanOrEqual(200);
  expect(resolved.status, resolved.text).toBeLessThan(300);
  expect((resolved.json as any)?.success, resolved.text).toBe(true);
  return resolved.json;
}

export function expectStatus(result: ApiResult, status: number) {
  expect(result.status, result.text).toBe(status);
}

export async function registerUser(label = 'user', options: RegisterUserOptions = {}): Promise<TestUser> {
  const email = options.email || `${label}-${crypto.randomUUID()}@example.test`;
  const password = options.password || 'Password123!';
  const displayName = options.displayName === undefined ? label.slice(0, 12) : options.displayName;
  const json = await expectOk(await api('/api/auth/register', {
    method: 'POST',
    body: {
      email,
      password,
      displayName,
      turnstileToken: TEST_TURNSTILE_TOKEN,
    },
  }));

  const user = {
    email,
    password,
    token: json.token,
    userId: json.userId,
  };

  if (options.emailVerified) {
    await testDb()
      .prepare('UPDATE users SET email_verified = 1 WHERE id = ?')
      .bind(user.userId)
      .run();
  }

  return user;
}

export async function loginUser(user: Pick<TestUser, 'email' | 'password'>): Promise<TestUser> {
  const json = await expectOk(await api('/api/auth/login', {
    method: 'POST',
    body: {
      email: user.email,
      password: user.password,
    },
  }));

  return {
    email: user.email,
    password: user.password,
    token: json.token,
    userId: json.userId,
  };
}

export async function identifyAnonymousUser(): Promise<TestUser> {
  const json = await expectOk(await api('/api/auth/identify', { method: 'POST' }));
  return {
    email: '',
    password: '',
    token: json.token,
    userId: json.userId,
  };
}

export async function createPot(user: TestUser, overrides: Record<string, unknown> = {}) {
  const id = typeof overrides.id === 'string' ? overrides.id : `pot-${crypto.randomUUID()}`;
  await expectOk(await api('/api/pots', {
    method: 'POST',
    token: user.token,
    body: {
      id,
      userId: user.userId,
      name: 'Smoke 月季',
      plantType: '月季',
      note: 'smoke-test',
      plantDate: '2026-04-01',
      createInitialTimeline: true,
      ...overrides,
    },
  }));
  return id;
}

export async function addCollaborator(owner: TestUser, potId: string, collaborator: TestUser) {
  return expectOk(await api(`/api/collaborators/${potId}`, {
    method: 'POST',
    token: owner.token,
    body: { email: collaborator.email },
  }));
}

export async function addViewer(owner: TestUser, potId: string, viewer: TestUser) {
  return expectOk(await api(`/api/viewers/${potId}`, {
    method: 'POST',
    token: owner.token,
    body: { email: viewer.email },
  }));
}

export async function addCareRecord(user: TestUser, potId: string, overrides: Record<string, unknown> = {}) {
  return expectOk(await api('/api/care-records', {
    method: 'POST',
    token: user.token,
    body: {
      potId,
      type: 'water',
      action: 'Water',
      careDate: '2026-04-10',
      description: 'test care',
      ...overrides,
    },
  }));
}

export async function addTimeline(user: TestUser, potId: string, overrides: Record<string, unknown> = {}) {
  return expectOk(await api('/api/timelines', {
    method: 'POST',
    token: user.token,
    body: {
      potId,
      date: '2026-04-11',
      description: 'test timeline',
      ...overrides,
    },
  }));
}

export async function addSchedule(user: TestUser, potId: string, overrides: Record<string, unknown> = {}) {
  return expectOk(await api('/api/care-schedules', {
    method: 'POST',
    token: user.token,
    body: {
      potId,
      careType: 'water',
      intervalDays: 7,
      ...overrides,
    },
  }));
}

export async function enableShare(owner: TestUser, potId: string): Promise<string> {
  const json = await expectOk(await api(`/api/share/enable/${potId}`, {
    method: 'POST',
    token: owner.token,
  }));
  return json.data.token;
}

export async function addTestPlant(id = 'smoke-rose') {
  await testDb().prepare(`
    INSERT INTO plants (
      id, name, category, care_difficulty, basic_info, ornamental_features, care_guide, image_url
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    '月季',
    '花草',
    '中等',
    JSON.stringify({ description: '测试植物' }),
    JSON.stringify({ flower: '月季花' }),
    JSON.stringify({ watering: '见干见湿' }),
    'https://example.test/rose.jpg'
  ).run();

  await testDb().prepare('INSERT INTO plant_synonyms (plant_id, synonym) VALUES (?, ?)')
    .bind(id, '玫瑰')
    .run();
}
