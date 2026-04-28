import { beforeEach, describe, expect, it } from 'vitest';
import {
  api,
  createPot,
  expectOk,
  expectStatus,
  identifyAnonymousUser,
  loginUser,
  registerUser,
  resetWorkerTestDatabase,
  testDb,
} from '../helpers/worker-api';

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
      },
    }));

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
});
