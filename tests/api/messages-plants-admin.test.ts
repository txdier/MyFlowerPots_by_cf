import { beforeEach, describe, expect, it } from 'vitest';
import {
  addCollaborator,
  addTestPlant,
  addViewer,
  api,
  apiForm,
  createPot,
  enableShare,
  expectOk,
  expectStatus,
  identifyAnonymousUser,
  registerUser,
  resetWorkerTestDatabase,
  testDb,
} from '../helpers/worker-api';

describe('api regression: comments, messages, plants, upload, analytics headers, and admin', () => {
  beforeEach(async () => {
    await resetWorkerTestDatabase();
  });

  it('covers member comments, replies, unread counts, read markers, and deletion', async () => {
    const owner = await registerUser('comment-owner');
    const collaborator = await registerUser('comment-collab');
    const viewer = await registerUser('comment-viewer');
    const potId = await createPot(owner, { name: 'Comment Pot' });
    await addCollaborator(owner, potId, collaborator);
    await addViewer(owner, potId, viewer);

    const comment = await expectOk(await api('/api/messages/pot-comment', {
      method: 'POST',
      token: viewer.token,
      body: {
        potId,
        content: 'viewer comment',
      },
    }));
    expect(comment.data.commentId).toBeTruthy();

    const ownerUnread = await expectOk(await api('/api/messages/unread-count', { token: owner.token }));
    expect(ownerUnread.count).toBeGreaterThan(0);
    const collaboratorUnread = await expectOk(await api('/api/messages/unread-count', { token: collaborator.token }));
    expect(collaboratorUnread.count).toBeGreaterThan(0);

    const viewerOwnMessages = await expectOk(await api('/api/messages', { token: viewer.token }));
    const selfCopy = viewerOwnMessages.data.find((message: any) => {
      const extra = JSON.parse(message.extra_data || '{}');
      return extra.selfCopy === true && extra.commentId === comment.data.commentId;
    });
    expect(selfCopy?.status).toBe('read');

    const reply = await expectOk(await api('/api/messages/pot-comment-reply', {
      method: 'POST',
      token: owner.token,
      body: {
        commentId: comment.data.commentId,
        content: 'owner reply',
      },
    }));
    expect(reply.data.commentId).toBeTruthy();
    expect(reply.data.recipientCount).toBe(2);

    const comments = await expectOk(await api(`/api/messages/pot-comments/${potId}`, { token: viewer.token }));
    expect(comments.data[0].replies).toHaveLength(1);

    const viewerMessages = await expectOk(await api('/api/messages', { token: viewer.token }));
    const unreadMessage = viewerMessages.data.find((message: any) => message.status === 'unread');
    expect(unreadMessage).toBeTruthy();

    await expectOk(await api(`/api/messages/${unreadMessage.id}/read`, {
      method: 'POST',
      token: viewer.token,
    }));
    await expectOk(await api('/api/messages/read-all', {
      method: 'POST',
      token: viewer.token,
    }));
    await expectOk(await api('/api/messages/read-all', {
      method: 'POST',
      token: owner.token,
    }));

    const viewerUnread = await expectOk(await api('/api/messages/unread-count', { token: viewer.token }));
    expect(viewerUnread.count).toBe(0);

    await expectOk(await api(`/api/messages/pot-comment/${comment.data.commentId}`, {
      method: 'DELETE',
      token: owner.token,
    }));
    const afterDelete = await expectOk(await api(`/api/messages/pot-comments/${potId}`, { token: viewer.token }));
    expect(afterDelete.data).toHaveLength(0);
  });

  it('keeps public-share visitors out of comments and archived pots read-only', async () => {
    const owner = await registerUser('comment-archive-owner');
    const viewer = await registerUser('comment-archive-viewer');
    const potId = await createPot(owner, { name: 'Archived Comment Pot' });
    await addViewer(owner, potId, viewer);
    const shareToken = await enableShare(owner, potId);

    expectStatus(await api('/api/messages/pot-comment', {
      method: 'POST',
      body: {
        potId,
        content: 'anonymous public comment',
        shareToken,
      },
    }), 401);

    const comment = await expectOk(await api('/api/messages/pot-comment', {
      method: 'POST',
      token: viewer.token,
      body: {
        potId,
        content: 'viewer before archive',
      },
    }));

    await expectOk(await api(`/api/pots/${potId}/archive`, {
      method: 'POST',
      token: owner.token,
      body: { reason: '测试归档' },
    }));

    expectStatus(await api('/api/messages/pot-comment', {
      method: 'POST',
      token: viewer.token,
      body: {
        potId,
        content: 'viewer after archive',
      },
    }), 403);

    expectStatus(await api('/api/messages/pot-comment-reply', {
      method: 'POST',
      token: viewer.token,
      body: {
        commentId: comment.data.commentId,
        content: 'reply after archive',
      },
    }), 403);
  });

  it('covers plant search/detail/smart-match, upload fallback or R2 path, and D1 bookmark response header', async () => {
    const owner = await registerUser('plant-upload');
    const potId = await createPot(owner, { name: 'Upload Pot' });
    await addTestPlant('api-rose');

    const search = await expectOk(await api('/api/plants/search?q=%E6%9C%88%E5%AD%A3'));
    expect(search.data.some((plant: any) => plant.id === 'api-rose')).toBe(true);

    const detail = await expectOk(await api('/api/plants/api-rose'));
    expect(detail.data.id).toBe('api-rose');

    const match = await expectOk(await api('/api/plants/smart-match', {
      method: 'POST',
      body: {
        potName: '月季花盆',
        potNote: '阳台测试',
      },
    }));
    expect(match.data.id).toBe('api-rose');

    const formData = new FormData();
    formData.set('image', new File(['test-image'], 'test.png', { type: 'image/png' }));
    formData.set('uploadType', 'pot');
    formData.set('potId', potId);

    const upload = await expectOk(await apiForm('/api/upload/image', {
      token: owner.token,
      formData,
    }));
    expect(upload.data.imageUrl).toEqual(expect.stringContaining('/'));
    expect(upload.data.potId).toBe(potId);

    const bookmarked = await api('/api/pots', {
      token: owner.token,
      headers: {
        'x-d1-bookmark': 'ignored-invalid-bookmark',
      },
    });
    await expectOk(bookmarked);
    expect(bookmarked.response.headers.get('x-d1-bookmark')).toBeTruthy();
  });

  it('covers admin check, plant CRUD, user limits/disable, and support inbox local DB behavior', async () => {
    const admin = await registerUser('admin', {
      email: 'admin@example.test',
      emailVerified: true,
    });
    const normalUser = await registerUser('normal');
    const manualVerifyUser = await registerUser('manual-verify');
    const anonymousUser = await identifyAnonymousUser();

    expectStatus(await api('/api/admin/check', { token: normalUser.token }), 403);
    await expectOk(await api('/api/admin/check', { token: admin.token }));
    expectStatus(await api(`/api/admin/users/${manualVerifyUser.userId}`, {
      method: 'PUT',
      token: normalUser.token,
      body: {
        emailVerified: true,
        verificationReason: 'not-admin',
      },
    }), 403);

    await testDb().batch([
      testDb().prepare(`
        INSERT INTO page_visits (path, visit_count, last_updated)
        VALUES (?, ?, ?)
      `).bind('/admin-stats', 7, '2026-05-07T00:00:00.000Z'),
      testDb().prepare(`
        INSERT INTO page_visits_daily (path, visit_date, visit_count)
        VALUES (?, ?, ?)
      `).bind('/admin-stats', '2026-05-06', 3),
      testDb().prepare(`
        INSERT INTO page_visits_daily (path, visit_date, visit_count)
        VALUES (?, ?, ?)
      `).bind('/admin-stats', '2026-05-07', 4),
    ]);

    const analytics = await expectOk(await api('/api/admin/analytics', { token: admin.token }));
    const statsRow = analytics.data.find((item: any) => item.path === '/admin-stats');
    expect(Number(statsRow?.visit_count)).toBe(7);

    const filteredAnalytics = await expectOk(await api(
      '/api/admin/analytics?startDate=2026-05-06&endDate=2026-05-07',
      { token: admin.token }
    ));
    const filteredStatsRow = filteredAnalytics.data.find((item: any) => item.path === '/admin-stats');
    expect(Number(filteredStatsRow?.visit_count)).toBe(7);

    expectStatus(await api(`/api/admin/users/${anonymousUser.userId}`, {
      method: 'PUT',
      token: admin.token,
      body: {
        emailVerified: true,
        verificationReason: 'anonymous users cannot be email verified',
      },
    }), 400);

    await testDb()
      .prepare(`
        UPDATE users
        SET verification_token = ?, verification_token_expires = ?
        WHERE id = ?
      `)
      .bind('manual-token', '2099-01-01T00:00:00.000Z', manualVerifyUser.userId)
      .run();

    await expectOk(await api(`/api/admin/users/${manualVerifyUser.userId}`, {
      method: 'PUT',
      token: admin.token,
      body: {
        emailVerified: true,
        verificationReason: 'support confirmed ownership',
      },
    }));

    const verifiedUser = await testDb()
      .prepare(`
        SELECT email_verified, verification_token, verification_token_expires
        FROM users
        WHERE id = ?
      `)
      .bind(manualVerifyUser.userId)
      .first();
    expect(Number(verifiedUser?.email_verified)).toBe(1);
    expect(verifiedUser?.verification_token).toBeNull();
    expect(verifiedUser?.verification_token_expires).toBeNull();

    for (let i = 0; i < 11; i++) {
      await createPot(manualVerifyUser, { name: `Manual Verified Pot ${i + 1}` });
    }

    await expectOk(await api('/api/admin/plants', {
      method: 'POST',
      token: admin.token,
      body: {
        id: 'admin-plant',
        name: 'Admin Plant',
        category: 'test',
        care_difficulty: 'easy',
        basic_info: { description: 'created by admin test' },
        ornamental_features: {},
        care_guide: {},
        synonyms: ['Admin Synonym'],
      },
    }));

    const plants = await expectOk(await api('/api/admin/plants?search=admin-plant', { token: admin.token }));
    expect(plants.data).toHaveLength(1);

    await expectOk(await api('/api/admin/plants/admin-plant', {
      method: 'PUT',
      token: admin.token,
      body: {
        name: 'Admin Plant Updated',
        category: 'test',
        care_difficulty: 'medium',
        basic_info: {},
        ornamental_features: {},
        care_guide: {},
        synonyms: ['Updated Synonym'],
      },
    }));

    await expectOk(await api('/api/admin/cache/clear', {
      method: 'POST',
      token: admin.token,
      body: { scope: 'plants' },
    }));

    await expectOk(await api(`/api/admin/users/${normalUser.userId}`, {
      method: 'PUT',
      token: admin.token,
      body: {
        maxPots: 1,
        isDisabled: true,
      },
    }));
    expectStatus(await api('/api/auth/login', {
      method: 'POST',
      body: { email: normalUser.email, password: normalUser.password },
    }), 403);

    await testDb().prepare(`
      INSERT INTO support_emails (id, from_addr, to_addr, subject, text_body, html_body, attachments, received_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      'support-1',
      'sender@example.test',
      'support@example.test',
      'Need help',
      'Support body',
      null,
      JSON.stringify([]),
      '2026-04-28T00:00:00.000Z'
    ).run();

    const supportUnread = await expectOk(await api('/api/admin/support/unread-count', { token: admin.token }));
    expect(supportUnread.count).toBe(1);

    const supportList = await api('/api/admin/support/emails', { token: admin.token });
    expect(supportList.status, supportList.text).toBe(200);
    expect(supportList.json.emails).toHaveLength(1);

    const supportDetail = await api('/api/admin/support/emails/support-1', { token: admin.token });
    expect(supportDetail.status, supportDetail.text).toBe(200);
    expect(supportDetail.json.id).toBe('support-1');
    expect(supportDetail.json.read).toBe(1);

    await expectOk(await api('/api/admin/support/emails/support-1/read', {
      method: 'PATCH',
      token: admin.token,
    }));

    await expectOk(await api('/api/admin/support/emails/support-1', {
      method: 'DELETE',
      token: admin.token,
    }));

    await expectOk(await api('/api/admin/plants/admin-plant', {
      method: 'DELETE',
      token: admin.token,
    }));

    await testDb()
      .prepare('UPDATE users SET is_disabled = 1 WHERE id = ?')
      .bind(admin.userId)
      .run();
    expectStatus(await api('/api/admin/check', { token: admin.token }), 403);
  });
});
