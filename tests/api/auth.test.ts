import { beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import {
  api,
  createPot,
  expectOk,
  expectStatus,
  identifyAnonymousUser,
  loginUser,
  registerUser,
  resetWorkerTestDatabase,
  TEST_TURNSTILE_TOKEN,
  testDb,
} from '../helpers/worker-api';
import { generateJWT } from '../../src/utils/auth-utils';

const DAY_SECONDS = 24 * 60 * 60;

function decodeJwtPayload(token: string): any {
  const parts = token.split('.');
  expect(parts).toHaveLength(3);
  const encodedPayload = parts[1];
  const padded = encodedPayload + '='.repeat((4 - encodedPayload.length % 4) % 4);
  return JSON.parse(atob(padded));
}

function expectTokenLifetimeDays(token: string, expectedDays: number) {
  const payload = decodeJwtPayload(token);
  const ttlSeconds = Number(payload.exp) - Math.floor(Date.now() / 1000);
  expect(ttlSeconds).toBeGreaterThanOrEqual(expectedDays * DAY_SECONDS - 120);
  expect(ttlSeconds).toBeLessThanOrEqual(expectedDays * DAY_SECONDS + 120);
  return payload;
}

describe('api regression: authentication and account rules', () => {
  beforeEach(async () => {
    await resetWorkerTestDatabase();
  });

  it('covers register, login, me, profile, password change, refresh, and duplicate email', async () => {
    const user = await registerUser('account');

    expectStatus(await api('/api/auth/register', {
      method: 'POST',
      body: {
        email: user.email,
        password: user.password,
        displayName: 'duplicate',
        turnstileToken: TEST_TURNSTILE_TOKEN,
      },
    }), 409);

    expectStatus(await api('/api/auth/login', {
      method: 'POST',
      body: { email: user.email, password: 'WrongPassword123!' },
    }), 401);

    const loggedIn = await loginUser(user);
    expect(loggedIn.userId).toBe(user.userId);

    const me = await expectOk(await api('/api/auth/me', { token: loggedIn.token }));
    expect(me.user.email).toBe(user.email);

    await expectOk(await api('/api/auth/profile', {
      method: 'PUT',
      token: loggedIn.token,
      body: { displayName: 'New Name', avatarUrl: 'https://example.test/avatar.png' },
    }));

    const updatedMe = await expectOk(await api('/api/auth/me', { token: loggedIn.token }));
    expect(updatedMe.user.displayName).toBe('New Name');
    expect(updatedMe.user.avatarUrl).toBe('https://example.test/avatar.png');

    await expectOk(await api('/api/auth/password', {
      method: 'PUT',
      token: loggedIn.token,
      body: {
        currentPassword: user.password,
        newPassword: 'NewPassword123!',
      },
    }));

    expectStatus(await api('/api/auth/login', {
      method: 'POST',
      body: { email: user.email, password: user.password },
    }), 401);
    await expectOk(await api('/api/auth/login', {
      method: 'POST',
      body: { email: user.email, password: 'NewPassword123!' },
    }));

    const refreshed = await expectOk(await api('/api/auth/refresh', {
      method: 'POST',
      token: loggedIn.token,
    }));
    expect(refreshed.token).toBeTruthy();

    expectStatus(await api('/api/auth/send-verification-email', {
      method: 'POST',
      token: loggedIn.token,
    }), 429);
  });

  it('issues 30-day remembered tokens by default and 7-day tokens when opted out', async () => {
    const registered = await registerUser('remember-default');
    const registerPayload = expectTokenLifetimeDays(registered.token, 30);
    expect(registerPayload.remember).toBe(true);

    const defaultLogin = await expectOk(await api('/api/auth/login', {
      method: 'POST',
      body: {
        email: registered.email,
        password: registered.password,
      },
    }));
    const defaultLoginPayload = expectTokenLifetimeDays(defaultLogin.token, 30);
    expect(defaultLoginPayload.remember).toBe(true);

    const shortLogin = await expectOk(await api('/api/auth/login', {
      method: 'POST',
      body: {
        email: registered.email,
        password: registered.password,
        remember: false,
      },
    }));
    const shortLoginPayload = expectTokenLifetimeDays(shortLogin.token, 7);
    expect(shortLoginPayload.remember).toBe(false);
  });

  it('preserves remember mode during refresh and treats legacy tokens as short sessions', async () => {
    const user = await registerUser('refresh-remember');

    const refreshedRemembered = await expectOk(await api('/api/auth/refresh', {
      method: 'POST',
      token: user.token,
    }));
    const rememberedPayload = expectTokenLifetimeDays(refreshedRemembered.token, 30);
    expect(rememberedPayload.remember).toBe(true);

    const shortLogin = await expectOk(await api('/api/auth/login', {
      method: 'POST',
      body: {
        email: user.email,
        password: user.password,
        remember: false,
      },
    }));
    const refreshedShort = await expectOk(await api('/api/auth/refresh', {
      method: 'POST',
      token: shortLogin.token,
    }));
    const shortPayload = expectTokenLifetimeDays(refreshedShort.token, 7);
    expect(shortPayload.remember).toBe(false);

    const legacyToken = await generateJWT(
      { userId: user.userId, email: user.email, type: 'email' },
      (env as any).JWT_SECRET
    );
    const refreshedLegacy = await expectOk(await api('/api/auth/refresh', {
      method: 'POST',
      token: legacyToken,
    }));
    const legacyPayload = expectTokenLifetimeDays(refreshedLegacy.token, 7);
    expect(legacyPayload.remember).toBe(false);
  });

  it('covers disabled account rejection', async () => {
    const user = await registerUser('disabled');
    await testDb()
      .prepare('UPDATE users SET is_disabled = 1 WHERE id = ?')
      .bind(user.userId)
      .run();

    expectStatus(await api('/api/auth/login', {
      method: 'POST',
      body: { email: user.email, password: user.password },
    }), 403);

    expectStatus(await api('/api/auth/refresh', {
      method: 'POST',
      token: user.token,
    }), 403);

    expectStatus(await api('/api/pots', {
      method: 'POST',
      token: user.token,
      body: {
        id: `pot-${crypto.randomUUID()}`,
        userId: user.userId,
        name: 'blocked',
      },
    }), 403);
  });

  it('covers anonymous upgrade and pot limit boundaries', async () => {
    const anonymous = await identifyAnonymousUser();
    const anonymousPayload = expectTokenLifetimeDays(anonymous.token, 7);
    expect(anonymousPayload.remember).toBe(false);
    const potIds: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      potIds.push(await createPot(anonymous, {
        id: `anonymous-pot-${index}`,
        name: `Anonymous ${index}`,
      }));
    }

    expectStatus(await api('/api/pots', {
      method: 'POST',
      token: anonymous.token,
      body: {
        id: 'anonymous-pot-over-limit',
        userId: anonymous.userId,
        name: 'over limit',
      },
    }), 403);

    const upgraded = await expectOk(await api('/api/auth/upgrade', {
      method: 'POST',
      body: {
        anonymousUserId: anonymous.userId,
        email: `upgrade-${crypto.randomUUID()}@example.test`,
        password: 'Password123!',
        displayName: 'upgraded',
        turnstileToken: TEST_TURNSTILE_TOKEN,
      },
    }));
    const upgradedPayload = expectTokenLifetimeDays(upgraded.token, 30);
    expect(upgradedPayload.remember).toBe(true);

    const list = await expectOk(await api('/api/pots', { token: upgraded.token }));
    expect(list.data.map((pot: any) => pot.id)).toEqual(expect.arrayContaining(potIds));

    await testDb()
      .prepare('UPDATE users SET email_verified = 1, max_pots = 1 WHERE id = ?')
      .bind(upgraded.userId)
      .run();

    expectStatus(await api('/api/pots', {
      method: 'POST',
      token: upgraded.token,
      body: {
        id: 'verified-custom-limit',
        userId: upgraded.userId,
        name: 'custom limit',
      },
    }), 403);
  });

  it('requires Turnstile on public account creation and reset endpoints', async () => {
    const anonymous = await identifyAnonymousUser();

    expectStatus(await api('/api/auth/register', {
      method: 'POST',
      body: {
        email: `missing-turnstile-${crypto.randomUUID()}@example.test`,
        password: 'Password123!',
        displayName: 'missing',
      },
    }), 403);

    expectStatus(await api('/api/auth/register', {
      method: 'POST',
      body: {
        email: `invalid-turnstile-${crypto.randomUUID()}@example.test`,
        password: 'Password123!',
        displayName: 'invalid',
        turnstileToken: 'invalid-token',
      },
    }), 403);

    expectStatus(await api('/api/auth/forgot-password', {
      method: 'POST',
      body: {
        email: 'someone@example.test',
      },
    }), 403);

    expectStatus(await api('/api/auth/forgot-password', {
      method: 'POST',
      body: {
        email: 'someone@example.test',
        turnstileToken: 'invalid-token',
      },
    }), 403);

    expectStatus(await api('/api/auth/upgrade', {
      method: 'POST',
      body: {
        anonymousUserId: anonymous.userId,
        email: `upgrade-missing-turnstile-${crypto.randomUUID()}@example.test`,
        password: 'Password123!',
        displayName: 'blocked',
      },
    }), 403);
  });

  it('rejects arbitrary Turnstile tokens when using the local dummy pass secret', async () => {
    const originalBypass = (env as any).TURNSTILE_TEST_BYPASS;
    const originalSecret = (env as any).TURNSTILE_SECRET_KEY;

    try {
      (env as any).TURNSTILE_TEST_BYPASS = 'false';
      (env as any).TURNSTILE_SECRET_KEY = '1x0000000000000000000000000000000AA';

      expectStatus(await api('/api/auth/forgot-password', {
        method: 'POST',
        body: {
          email: `dummy-invalid-${crypto.randomUUID()}@example.test`,
          turnstileToken: 'invalid-token',
        },
      }), 403);

      await expectOk(await api('/api/auth/forgot-password', {
        method: 'POST',
        body: {
          email: `dummy-valid-${crypto.randomUUID()}@example.test`,
          turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX',
        },
      }));
    } finally {
      (env as any).TURNSTILE_TEST_BYPASS = originalBypass;
      if (originalSecret === undefined) {
        delete (env as any).TURNSTILE_SECRET_KEY;
      } else {
        (env as any).TURNSTILE_SECRET_KEY = originalSecret;
      }
    }
  });

  it('rate limits forgot-password emails without revealing account existence', async () => {
    const user = await registerUser('reset-limit');

    await expectOk(await api('/api/auth/forgot-password', {
      method: 'POST',
      body: {
        email: user.email,
        turnstileToken: TEST_TURNSTILE_TOKEN,
      },
    }));

    const firstReset = await testDb()
      .prepare(`
        SELECT reset_token, reset_email_sent_at, reset_email_send_window_start, reset_email_send_count
        FROM users
        WHERE id = ?
      `)
      .bind(user.userId)
      .first<any>();

    expect(firstReset?.reset_token).toBeTruthy();
    expect(Number(firstReset?.reset_email_send_count)).toBe(1);

    await expectOk(await api('/api/auth/forgot-password', {
      method: 'POST',
      body: {
        email: user.email,
        turnstileToken: TEST_TURNSTILE_TOKEN,
      },
    }));

    const cooldownReset = await testDb()
      .prepare('SELECT reset_token, reset_email_send_count FROM users WHERE id = ?')
      .bind(user.userId)
      .first<any>();

    expect(cooldownReset?.reset_token).toBe(firstReset.reset_token);
    expect(Number(cooldownReset?.reset_email_send_count)).toBe(1);

    const windowStart = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    await testDb()
      .prepare(`
        UPDATE users
        SET reset_token = ?,
            reset_email_sent_at = ?,
            reset_email_send_window_start = ?,
            reset_email_send_count = 5
        WHERE id = ?
      `)
      .bind('existing-reset-token', windowStart, windowStart, user.userId)
      .run();

    await expectOk(await api('/api/auth/forgot-password', {
      method: 'POST',
      body: {
        email: user.email,
        turnstileToken: TEST_TURNSTILE_TOKEN,
      },
    }));

    const quotaReset = await testDb()
      .prepare('SELECT reset_token, reset_email_send_count FROM users WHERE id = ?')
      .bind(user.userId)
      .first<any>();

    expect(quotaReset?.reset_token).toBe('existing-reset-token');
    expect(Number(quotaReset?.reset_email_send_count)).toBe(5);

    await expectOk(await api('/api/auth/forgot-password', {
      method: 'POST',
      body: {
        email: `not-registered-${crypto.randomUUID()}@example.test`,
        turnstileToken: TEST_TURNSTILE_TOKEN,
      },
    }));
  });
});
