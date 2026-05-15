import { beforeEach, describe, expect, it } from 'vitest';
import {
  addCollaborator,
  addTimeline,
  addViewer,
  api,
  createPot,
  expectOk,
  expectStatus,
  registerUser,
  resetWorkerTestDatabase,
} from '../helpers/worker-api';
import { markPotActivityRead } from '../../src/utils/pot-activity-utils';

function findPot(list: any, potId: string) {
  return list.data.find((pot: any) => pot.id === potId);
}

describe('api regression: pot activity markers', () => {
  beforeEach(async () => {
    await resetWorkerTestDatabase();
  });

  it('shows collaborator timeline updates to owner and viewers without touching message unread count', async () => {
    const owner = await registerUser('activity-owner');
    const collaborator = await registerUser('activity-collab');
    const viewer = await registerUser('activity-viewer');
    const potId = await createPot(owner, { createInitialTimeline: false });

    await addCollaborator(owner, potId, collaborator);
    await addViewer(owner, potId, viewer);

    const unreadBefore = await expectOk(await api('/api/messages/unread-count', { token: owner.token }));
    expect(Number(unreadBefore.count || 0)).toBe(0);

    await addTimeline(collaborator, potId, {
      date: '2026-05-01',
      description: 'collaborator new leaf'
    });

    const ownerList = await expectOk(await api('/api/pots', { token: owner.token }));
    const ownerPot = findPot(ownerList, potId);
    expect(ownerPot.has_new_activity).toBe(1);
    expect(ownerPot.new_activity_count).toBe(1);
    expect(ownerPot.latest_activity_type).toBe('timeline_created');
    expect(ownerPot.latest_activity_summary).toBe('新增成长轨迹');

    const viewerList = await expectOk(await api('/api/pots', { token: viewer.token }));
    expect(findPot(viewerList, potId).has_new_activity).toBe(1);

    const collaboratorList = await expectOk(await api('/api/pots', { token: collaborator.token }));
    expect(findPot(collaboratorList, potId).has_new_activity).toBe(0);

    const unreadAfter = await expectOk(await api('/api/messages/unread-count', { token: owner.token }));
    expect(Number(unreadAfter.count || 0)).toBe(0);

    await expectOk(await api(`/api/pots/${potId}/activity/read`, {
      method: 'POST',
      token: owner.token
    }));
    const ownerAfterRead = await expectOk(await api('/api/pots', { token: owner.token }));
    expect(findPot(ownerAfterRead, potId).has_new_activity).toBe(0);
  });

  it('shows owner plant-info edits to members and keeps the actor clean', async () => {
    const owner = await registerUser('activity-owner-edit');
    const collaborator = await registerUser('activity-collab-edit');
    const viewer = await registerUser('activity-viewer-edit');
    const potId = await createPot(owner, { createInitialTimeline: false });

    await addCollaborator(owner, potId, collaborator);
    await addViewer(owner, potId, viewer);

    await expectOk(await api(`/api/pots/${potId}`, {
      method: 'PUT',
      token: owner.token,
      body: { note: 'updated info for members' }
    }));

    const ownerList = await expectOk(await api('/api/pots', { token: owner.token }));
    expect(findPot(ownerList, potId).has_new_activity).toBe(0);

    const collaboratorList = await expectOk(await api('/api/pots', { token: collaborator.token }));
    const collaboratorPot = findPot(collaboratorList, potId);
    expect(collaboratorPot.has_new_activity).toBe(1);
    expect(collaboratorPot.latest_activity_type).toBe('pot_updated');

    const viewerList = await expectOk(await api('/api/pots', { token: viewer.token }));
    expect(findPot(viewerList, potId).has_new_activity).toBe(1);
  });

  it('keeps cover-only changes quiet while still notifying for real plant-info edits', async () => {
    const owner = await registerUser('activity-cover-owner');
    const collaborator = await registerUser('activity-cover-collab');
    const viewer = await registerUser('activity-cover-viewer');
    const potId = await createPot(owner, { createInitialTimeline: false });

    await addCollaborator(owner, potId, collaborator);
    await addViewer(owner, potId, viewer);

    await expectOk(await api(`/api/pots/${potId}`, {
      method: 'PUT',
      token: owner.token,
      body: { imageUrl: 'https://img.kaside365.com/timeline/cover-only.jpg' }
    }));

    const collaboratorAfterCover = await expectOk(await api('/api/pots', { token: collaborator.token }));
    expect(findPot(collaboratorAfterCover, potId).has_new_activity).toBe(0);
    const viewerAfterCover = await expectOk(await api('/api/pots', { token: viewer.token }));
    expect(findPot(viewerAfterCover, potId).has_new_activity).toBe(0);

    await expectOk(await api(`/api/pots/${potId}`, {
      method: 'PUT',
      token: owner.token,
      body: {
        imageUrl: 'https://img.kaside365.com/timeline/cover-with-note.jpg',
        note: 'cover changed with real plant info'
      }
    }));

    const collaboratorAfterInfo = await expectOk(await api('/api/pots', { token: collaborator.token }));
    const collaboratorPot = findPot(collaboratorAfterInfo, potId);
    expect(collaboratorPot.has_new_activity).toBe(1);
    expect(collaboratorPot.latest_activity_type).toBe('pot_updated');

    const viewerAfterInfo = await expectOk(await api('/api/pots', { token: viewer.token }));
    expect(findPot(viewerAfterInfo, potId).has_new_activity).toBe(1);
  });

  it('starts new viewer and collaborator permissions from the current activity baseline', async () => {
    const owner = await registerUser('activity-baseline-owner');
    const collaborator = await registerUser('activity-baseline-collab');
    const viewer = await registerUser('activity-baseline-viewer');
    const potId = await createPot(owner, { createInitialTimeline: false });

    await addTimeline(owner, potId, {
      date: '2026-05-02',
      description: 'old owner timeline before invite'
    });

    await addCollaborator(owner, potId, collaborator);
    await addViewer(owner, potId, viewer);

    const collaboratorInitial = await expectOk(await api('/api/pots', { token: collaborator.token }));
    expect(findPot(collaboratorInitial, potId).has_new_activity).toBe(0);
    const viewerInitial = await expectOk(await api('/api/pots', { token: viewer.token }));
    expect(findPot(viewerInitial, potId).has_new_activity).toBe(0);

    await expectOk(await api(`/api/pots/${potId}`, {
      method: 'PUT',
      token: owner.token,
      body: { note: 'fresh update after invite' }
    }));

    const collaboratorAfter = await expectOk(await api('/api/pots', { token: collaborator.token }));
    expect(findPot(collaboratorAfter, potId).has_new_activity).toBe(1);
    const viewerAfter = await expectOk(await api('/api/pots', { token: viewer.token }));
    expect(findPot(viewerAfter, potId).has_new_activity).toBe(1);
  });

  it('keeps viewers read-only while allowing them to clear activity markers', async () => {
    const owner = await registerUser('activity-read-owner');
    const viewer = await registerUser('activity-read-viewer');
    const potId = await createPot(owner, { createInitialTimeline: false });

    await addViewer(owner, potId, viewer);
    await expectOk(await api(`/api/pots/${potId}`, {
      method: 'PUT',
      token: owner.token,
      body: { note: 'viewer can see this marker' }
    }));

    expectStatus(await api('/api/timelines', {
      method: 'POST',
      token: viewer.token,
      body: {
        potId,
        date: '2026-05-03',
        description: 'viewer cannot write'
      }
    }), 403);

    await expectOk(await api(`/api/pots/${potId}/activity/read`, {
      method: 'POST',
      token: viewer.token
    }));
    const viewerAfterRead = await expectOk(await api('/api/pots', { token: viewer.token }));
    expect(findPot(viewerAfterRead, potId).has_new_activity).toBe(0);
  });

  it('keeps activity read markers idempotent when a pot has no activity', async () => {
    const owner = await registerUser('activity-empty-owner');
    const potId = await createPot(owner, { createInitialTimeline: false });

    const firstRead = await expectOk(await api(`/api/pots/${potId}/activity/read`, {
      method: 'POST',
      token: owner.token
    }));
    expect(firstRead.data.latestEventId).toBe(0);

    const secondRead = await expectOk(await api(`/api/pots/${potId}/activity/read`, {
      method: 'POST',
      token: owner.token
    }));
    expect(secondRead.data.latestEventId).toBe(0);

    const ownerList = await expectOk(await api('/api/pots', { token: owner.token }));
    expect(findPot(ownerList, potId).has_new_activity).toBe(0);
  });

  it('retries transient D1 network failures when marking activity read', async () => {
    let attempts = 0;
    const fakeEnv = {
      DB: {
        prepare: () => ({
          bind: () => ({
            first: async () => {
              attempts += 1;
              if (attempts === 1) {
                throw new Error('D1_ERROR: Network connection lost.');
              }
              return { last_read_event_id: 7 };
            }
          })
        })
      }
    };

    await expect(markPotActivityRead(fakeEnv, 'pot-test', 'user-test')).resolves.toBe(7);
    expect(attempts).toBe(2);
  });
});
