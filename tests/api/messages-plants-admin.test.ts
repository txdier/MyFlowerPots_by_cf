import { beforeEach, describe, expect, it } from 'vitest';
import {
  addTestPlant,
  addViewer,
  api,
  apiForm,
  createPot,
  expectOk,
  expectStatus,
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
    const viewer = await registerUser('comment-viewer');
    const potId = await createPot(owner, { name: 'Comment Pot' });
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

    const reply = await expectOk(await api('/api/messages/pot-comment-reply', {
      method: 'POST',
      token: owner.token,
      body: {
        commentId: comment.data.commentId,
        content: 'owner reply',
      },
    }));
    expect(reply.data.commentId).toBeTruthy();

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

    expectStatus(await api('/api/admin/check', { token: normalUser.token }), 403);
    await expectOk(await api('/api/admin/check', { token: admin.token }));

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
  });
});
