import { beforeEach, describe, expect, it } from 'vitest';
import {
  api,
  createPot,
  enableShare,
  expectOk,
  expectStatus,
  registerUser,
  resetWorkerTestDatabase,
} from '../helpers/worker-api';

describe('api regression: share, invites, and ownership transfer', () => {
  beforeEach(async () => {
    await resetWorkerTestDatabase();
  });

  it('covers public share by token and id, comment danmaku toggle, and disable behavior', async () => {
    const owner = await registerUser('share-owner');
    const potId = await createPot(owner, { name: 'Shared Pot' });

    const token = await enableShare(owner, potId);
    const publicByToken = await expectOk(await api(`/api/public/pots/${token}`));
    expect(publicByToken.data.pot.id).toBe(potId);
    expect(publicByToken.data.viewer.isOwner).toBe(false);

    const publicById = await expectOk(await api(`/api/public/pots/by-id/${potId}`));
    expect(publicById.data.pot.id).toBe(potId);

    await expectOk(await api(`/api/share/comment-danmaku/${potId}`, {
      method: 'POST',
      token: owner.token,
      body: { enabled: false },
    }));

    const afterToggle = await expectOk(await api(`/api/public/pots/${token}`));
    expect(afterToggle.data.pot.show_comment_danmaku).toBe(0);

    await expectOk(await api(`/api/share/disable/${potId}`, {
      method: 'POST',
      token: owner.token,
    }));

    expectStatus(await api(`/api/public/pots/${token}`), 404);
    expectStatus(await api(`/api/public/pots/by-id/${potId}`), 404);
  });

  it('covers viewer and collaborator invite open, accept, repeat accept, and active permissions', async () => {
    const owner = await registerUser('invite-owner');
    const viewer = await registerUser('invite-viewer');
    const collaborator = await registerUser('invite-collab');
    const potId = await createPot(owner, { name: 'Invite Pot' });

    const viewerInvite = await expectOk(await api(`/api/viewers/invite/${potId}`, {
      method: 'POST',
      token: owner.token,
    }));
    const viewerToken = viewerInvite.data.token;

    expectStatus(await api(`/api/viewers/open/${viewerToken}`, {
      method: 'POST',
      body: {},
    }), 400);

    await expectOk(await api(`/api/viewers/open/${viewerToken}`, {
      method: 'POST',
      body: { sessionId: 'viewer-session' },
    }));

    expectStatus(await api(`/api/viewers/accept/${viewerToken}`, {
      method: 'POST',
      token: viewer.token,
      body: { sessionId: 'wrong-session' },
    }), 400);

    const acceptedViewer = await expectOk(await api(`/api/viewers/accept/${viewerToken}`, {
      method: 'POST',
      token: viewer.token,
      body: { sessionId: 'viewer-session' },
    }));
    expect(acceptedViewer.data.potId).toBe(potId);

    const repeatViewer = await expectOk(await api(`/api/viewers/accept/${viewerToken}`, {
      method: 'POST',
      token: viewer.token,
      body: { sessionId: 'viewer-session' },
    }));
    expect(repeatViewer.data.alreadyAccepted).toBe(true);

    await expectOk(await api(`/api/pots/${potId}`, { token: viewer.token }));
    expectStatus(await api('/api/care-records', {
      method: 'POST',
      token: viewer.token,
      body: {
        potId,
        type: 'water',
        action: 'viewer cannot write',
        careDate: '2026-04-20',
      },
    }), 403);

    const collabInvite = await expectOk(await api(`/api/collaborators/invite/${potId}`, {
      method: 'POST',
      token: owner.token,
    }));
    const collabToken = collabInvite.data.token;

    await expectOk(await api(`/api/collaborators/open/${collabToken}`, {
      method: 'POST',
      body: { sessionId: 'collab-session' },
    }));
    const acceptedCollab = await expectOk(await api(`/api/collaborators/accept/${collabToken}`, {
      method: 'POST',
      token: collaborator.token,
      body: { sessionId: 'collab-session' },
    }));
    expect(acceptedCollab.data.potId).toBe(potId);

    await expectOk(await api('/api/care-records', {
      method: 'POST',
      token: collaborator.token,
      body: {
        potId,
        type: 'water',
        action: 'collaborator can write',
        careDate: '2026-04-21',
      },
    }));
  });

  it('covers transfer detail, target email guard, reject, cancel, and accept', async () => {
    const owner = await registerUser('transfer-owner');
    const recipient = await registerUser('transfer-recipient');
    const stranger = await registerUser('transfer-stranger');
    const potId = await createPot(owner, { name: 'Transfer Pot' });

    const firstTransfer = await expectOk(await api(`/api/transfer/init/${potId}`, {
      method: 'POST',
      token: owner.token,
      body: { targetEmail: recipient.email },
    }));
    expect(firstTransfer.transferToken).toBeTruthy();

    const transferDetail = await expectOk(await api(`/api/public/transfer/${firstTransfer.transferToken}`));
    expect(transferDetail.data.id).toBe(potId);

    expectStatus(await api(`/api/transfer/accept/${firstTransfer.transferToken}`, {
      method: 'POST',
      token: stranger.token,
    }), 403);

    await expectOk(await api(`/api/transfer/reject/${firstTransfer.transferToken}`, {
      method: 'POST',
      token: recipient.token,
    }));
    expectStatus(await api(`/api/public/transfer/${firstTransfer.transferToken}`), 404);

    const cancelled = await expectOk(await api(`/api/transfer/init/${potId}`, {
      method: 'POST',
      token: owner.token,
      body: { targetEmail: recipient.email },
    }));
    await expectOk(await api(`/api/transfer/cancel/${potId}`, {
      method: 'POST',
      token: owner.token,
    }));
    expectStatus(await api(`/api/public/transfer/${cancelled.transferToken}`), 404);

    const accepted = await expectOk(await api(`/api/transfer/init/${potId}`, {
      method: 'POST',
      token: owner.token,
      body: { targetEmail: recipient.email },
    }));
    await expectOk(await api(`/api/transfer/accept/${accepted.transferToken}`, {
      method: 'POST',
      token: recipient.token,
    }));

    expectStatus(await api(`/api/pots/${potId}`, { token: owner.token }), 404);
    const newOwnerDetail = await expectOk(await api(`/api/pots/${potId}`, { token: recipient.token }));
    expect(newOwnerDetail.data.user_id).toBe(recipient.userId);
  });
});
