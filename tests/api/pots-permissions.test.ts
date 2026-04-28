import { beforeEach, describe, expect, it } from 'vitest';
import {
  addCareRecord,
  addCollaborator,
  addSchedule,
  addTimeline,
  addViewer,
  api,
  createPot,
  expectOk,
  expectStatus,
  registerUser,
  resetWorkerTestDatabase,
} from '../helpers/worker-api';

describe('api regression: pots, lifecycle, and permission matrix', () => {
  beforeEach(async () => {
    await resetWorkerTestDatabase();
  });

  it('covers owner, collaborator, viewer, stranger, archive read-only, restore, reorder, and delete', async () => {
    const owner = await registerUser('owner');
    const collaborator = await registerUser('collaborator');
    const viewer = await registerUser('viewer');
    const stranger = await registerUser('stranger');
    const potId = await createPot(owner, { name: 'Permission Pot' });
    const secondPotId = await createPot(owner, { name: 'Second Pot' });

    await expectOk(await api('/api/pots/reorder', {
      method: 'PUT',
      token: owner.token,
      body: { potIds: [secondPotId, potId] },
    }));

    await addCollaborator(owner, potId, collaborator);
    await addViewer(owner, potId, viewer);

    const ownerDetail = await expectOk(await api(`/api/pots/${potId}`, { token: owner.token }));
    expect(ownerDetail.data.name).toBe('Permission Pot');

    await expectOk(await api(`/api/pots/${potId}`, { token: collaborator.token }));
    await expectOk(await api(`/api/pots/${potId}`, { token: viewer.token }));
    expectStatus(await api(`/api/pots/${potId}`, { token: stranger.token }), 404);

    await addCareRecord(collaborator, potId, { action: 'Collaborator care' });
    await addTimeline(collaborator, potId, { description: 'Collaborator timeline' });
    await addSchedule(collaborator, potId, { careType: 'water', intervalDays: 4 });

    await expectOk(await api(`/api/care-records/${potId}`, { token: viewer.token }));
    await expectOk(await api(`/api/pots/${potId}/timelines`, { token: viewer.token }));

    expectStatus(await api('/api/care-records', {
      method: 'POST',
      token: viewer.token,
      body: {
        potId,
        type: 'water',
        action: 'Viewer write',
        careDate: '2026-04-12',
      },
    }), 403);

    expectStatus(await api(`/api/pots/${potId}`, {
      method: 'PUT',
      token: collaborator.token,
      body: { note: 'collaborator cannot update pot fields' },
    }), 404);

    expectStatus(await api(`/api/viewers/${potId}`, { token: viewer.token }), 404);

    await expectOk(await api('/api/pots/archive', {
      method: 'POST',
      token: owner.token,
      body: {
        potIds: [potId],
        reason: 'regression',
        note: 'archive in permission test',
      },
    }));

    const archivedDetail = await expectOk(await api(`/api/pots/${potId}`, { token: collaborator.token }));
    expect(archivedDetail.data.status).toBe('archived');

    expectStatus(await api('/api/care-records', {
      method: 'POST',
      token: owner.token,
      body: {
        potId,
        type: 'water',
        action: 'Archived owner write',
        careDate: '2026-04-13',
      },
    }), 403);

    expectStatus(await api('/api/timelines', {
      method: 'POST',
      token: collaborator.token,
      body: {
        potId,
        date: '2026-04-13',
        description: 'Archived collaborator write',
      },
    }), 403);

    expectStatus(await api('/api/care-schedules', {
      method: 'POST',
      token: owner.token,
      body: {
        potId,
        careType: 'fertilize',
        intervalDays: 14,
      },
    }), 404);

    expectStatus(await api(`/api/pots/${potId}`, {
      method: 'PUT',
      token: owner.token,
      body: { note: 'archived pot update' },
    }), 404);

    await expectOk(await api(`/api/pots/${potId}/restore`, {
      method: 'POST',
      token: owner.token,
    }));

    await expectOk(await api(`/api/pots/${potId}`, {
      method: 'PUT',
      token: owner.token,
      body: { note: 'restored update' },
    }));

    await expectOk(await api(`/api/pots/${potId}`, {
      method: 'DELETE',
      token: owner.token,
    }));

    expectStatus(await api(`/api/pots/${potId}`, { token: owner.token }), 404);
  });
});
