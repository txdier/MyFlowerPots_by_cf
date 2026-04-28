import { beforeEach, describe, expect, it } from 'vitest';
import {
  addTestPlant,
  api,
  createPot,
  expectOk,
  expectStatus,
  loginUser,
  registerUser,
  resetSmokeDatabase,
} from './helpers';

describe('core feature smoke flows', () => {
  beforeEach(async () => {
    await resetSmokeDatabase();
  });

  it('covers authentication lifecycle', async () => {
    const anonymous = await expectOk(await api('/api/auth/identify', { method: 'POST' }));
    expect(anonymous.userId).toBeTruthy();
    expect(anonymous.token).toBeTruthy();

    const registered = await registerUser('auth');
    const loggedIn = await loginUser(registered);
    expect(loggedIn.userId).toBe(registered.userId);

    const me = await expectOk(await api('/api/auth/me', { token: loggedIn.token }));
    expect(me.user.email).toBe(registered.email);

    const refreshed = await expectOk(await api('/api/auth/refresh', {
      method: 'POST',
      token: loggedIn.token,
    }));
    expect(refreshed.token).toBeTruthy();
  });

  it('covers pot, care, timeline, schedule, archive, and share flows', async () => {
    const owner = await registerUser('owner');
    const potId = await createPot(owner);

    const list = await expectOk(await api('/api/pots', { token: owner.token }));
    expect(list.data.some((pot: any) => pot.id === potId)).toBe(true);

    const detail = await expectOk(await api(`/api/pots/${potId}`, { token: owner.token }));
    expect(detail.data.name).toBe('Smoke 月季');

    await expectOk(await api(`/api/pots/${potId}`, {
      method: 'PUT',
      token: owner.token,
      body: { note: 'updated smoke note' },
    }));

    await expectOk(await api('/api/care-records', {
      method: 'POST',
      token: owner.token,
      body: {
        potId,
        types: ['water'],
        actions: ['浇水'],
        careDate: '2026-04-10',
        description: '冒烟浇水',
      },
    }));

    const careRecords = await expectOk(await api(`/api/care-records/${potId}`, { token: owner.token }));
    expect(careRecords.data.length).toBeGreaterThan(0);

    await expectOk(await api('/api/timelines', {
      method: 'POST',
      token: owner.token,
      body: {
        potId,
        date: '2026-04-11',
        description: '冒烟成长记录',
      },
    }));

    const timelines = await expectOk(await api(`/api/pots/${potId}/timelines`, { token: owner.token }));
    expect(timelines.data.length).toBeGreaterThan(0);

    await expectOk(await api('/api/care-schedules', {
      method: 'POST',
      token: owner.token,
      body: {
        potId,
        careType: 'water',
        intervalDays: 7,
      },
    }));

    const schedules = await expectOk(await api(`/api/care-schedules/pot/${potId}`, { token: owner.token }));
    expect(schedules.data.length).toBe(1);
    const reminders = await expectOk(await api('/api/care-schedules/reminders', { token: owner.token }));
    expect(Array.isArray(reminders.data)).toBe(true);

    const enabledShare = await expectOk(await api(`/api/share/enable/${potId}`, {
      method: 'POST',
      token: owner.token,
    }));
    const publicDetail = await expectOk(await api(`/api/public/pots/${enabledShare.data.token}`));
    expect(publicDetail.data.pot.id).toBe(potId);

    await expectOk(await api(`/api/share/disable/${potId}`, {
      method: 'POST',
      token: owner.token,
    }));
    expectStatus(await api(`/api/public/pots/${enabledShare.data.token}`), 404);

    await expectOk(await api(`/api/pots/${potId}/archive`, {
      method: 'POST',
      token: owner.token,
      body: { reason: 'smoke', note: 'archive smoke' },
    }));
    expectStatus(await api('/api/care-records', {
      method: 'POST',
      token: owner.token,
      body: {
        potId,
        type: 'water',
        action: '浇水',
        careDate: '2026-04-12',
      },
    }), 403);

    await expectOk(await api(`/api/pots/${potId}/restore`, {
      method: 'POST',
      token: owner.token,
    }));
  });

  it('covers owner, collaborator, viewer, stranger, comment, and message boundaries', async () => {
    const owner = await registerUser('owner');
    const collaborator = await registerUser('collab');
    const viewer = await registerUser('viewer');
    const stranger = await registerUser('stranger');
    const potId = await createPot(owner);

    await expectOk(await api(`/api/collaborators/${potId}`, {
      method: 'POST',
      token: owner.token,
      body: { email: collaborator.email },
    }));
    await expectOk(await api(`/api/viewers/${potId}`, {
      method: 'POST',
      token: owner.token,
      body: { email: viewer.email },
    }));

    await expectOk(await api(`/api/pots/${potId}`, { token: viewer.token }));
    expectStatus(await api(`/api/pots/${potId}`, { token: stranger.token }), 404);

    await expectOk(await api('/api/care-records', {
      method: 'POST',
      token: collaborator.token,
      body: {
        potId,
        type: 'water',
        action: '协作浇水',
        careDate: '2026-04-13',
      },
    }));

    expectStatus(await api('/api/care-records', {
      method: 'POST',
      token: viewer.token,
      body: {
        potId,
        type: 'water',
        action: '只读浇水',
        careDate: '2026-04-14',
      },
    }), 403);

    const comment = await expectOk(await api('/api/messages/pot-comment', {
      method: 'POST',
      token: viewer.token,
      body: {
        potId,
        content: '冒烟评论',
      },
    }));
    expect(comment.data.commentId).toBeTruthy();

    const unread = await expectOk(await api('/api/messages/unread-count', { token: owner.token }));
    expect(unread.count).toBeGreaterThan(0);
  });

  it('covers plant search and smart-match against D1 data', async () => {
    await addTestPlant();

    const search = await expectOk(await api('/api/plants/search?q=月季'));
    expect(search.data.some((plant: any) => plant.id === 'smoke-rose')).toBe(true);

    const match = await expectOk(await api('/api/plants/smart-match', {
      method: 'POST',
      body: { potName: '月季花盆', potNote: '阳台测试' },
    }));
    expect(match.data.id).toBe('smoke-rose');
  });
});
