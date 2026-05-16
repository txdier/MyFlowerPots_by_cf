import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  api,
  createPot,
  expectOk,
  expectStatus,
  registerUser,
  resetWorkerTestDatabase,
} from '../helpers/worker-api';

describe('api regression: care records, timelines, and schedules', () => {
  beforeEach(async () => {
    await resetWorkerTestDatabase();
  });

  it('covers single and batch care record CRUD, image JSON compatibility, timelines, and last care summary', async () => {
    const owner = await registerUser('records');
    const potId = await createPot(owner, { name: 'Care Pot' });
    const secondPotId = await createPot(owner, { name: 'Care Pot 2' });

    const created = await expectOk(await api('/api/care-records', {
      method: 'POST',
      token: owner.token,
      body: {
        potId,
        types: ['water', 'fertilize'],
        actions: ['Watered', 'Fertilized'],
        careDate: '2026-04-15',
        description: 'multi care',
        imageUrls: ['https://img.kaside365.com/care/a.jpg'],
      },
    }));
    expect(created.count).toBe(2);

    const records = await expectOk(await api(`/api/care-records/${potId}`, { token: owner.token }));
    expect(records.data).toHaveLength(2);
    const recordId = records.data[0].id;

    const detail = await expectOk(await api(`/api/care-records/detail/${recordId}`, { token: owner.token }));
    expect(detail.data.potId).toBe(potId);
    expect(detail.data.imageUrl).toContain('care/a.jpg');

    await expectOk(await api(`/api/care-records/${recordId}`, {
      method: 'PUT',
      token: owner.token,
      body: {
        action: 'Updated care',
        careDate: '2026-04-16',
        imageUrls: ['https://img.kaside365.com/care/b.jpg'],
      },
    }));

    await expectOk(await api(`/api/care-records/${recordId}`, {
      method: 'DELETE',
      token: owner.token,
    }));

    const afterDelete = await expectOk(await api(`/api/care-records/${potId}`, { token: owner.token }));
    expect(afterDelete.data).toHaveLength(1);

    const potDetail = await expectOk(await api(`/api/pots/${potId}`, { token: owner.token }));
    expect(potDetail.data.last_care).toBe('2026-04-15');
    expect(potDetail.data.last_care_action).toBe('Fertilized');

    const timelines = await expectOk(await api(`/api/pots/${potId}/timelines`, { token: owner.token }));
    expect(timelines.data.length).toBeGreaterThanOrEqual(2);

    await expectOk(await api('/api/timelines', {
      method: 'POST',
      token: owner.token,
      body: {
        potId,
        date: '2026-04-20',
        description: 'manual timeline',
        images: ['https://img.kaside365.com/timeline/a.jpg'],
      },
    }));
    const manualTimelines = await expectOk(await api(`/api/pots/${potId}/timelines`, { token: owner.token }));
    const manualTimeline = manualTimelines.data.find((item: any) => item.description === 'manual timeline');
    expect(manualTimeline).toBeTruthy();

    await expectOk(await api(`/api/timelines/${manualTimeline.id}`, {
      method: 'PUT',
      token: owner.token,
      body: { description: 'updated timeline' },
    }));
    await expectOk(await api(`/api/timelines/${manualTimeline.id}`, {
      method: 'DELETE',
      token: owner.token,
    }));

    const batch = await expectOk(await api('/api/care-records/batch', {
      method: 'POST',
      token: owner.token,
      body: {
        potIds: [potId, secondPotId, 'not-owned'],
        types: ['water', 'prune'],
        actions: ['Batch water', 'Batch prune'],
        careDate: '2026-04-21',
        description: 'batch care',
      },
    }));
    expect(batch.count).toBe(2);
    expect(batch.recordCount).toBe(4);
    expect(batch.skipped).toBe(1);
  });

  it('deletes timeline video objects from R2 when a timeline is deleted', async () => {
    const owner = await registerUser('timeline-video');
    const potId = await createPot(owner, { name: 'Video Pot', createInitialTimeline: false });
    const videoKey = `timeline/${owner.userId}/${potId}/clip.mp4`;
    const videoUrl = `https://img.kaside365.com/${videoKey}`;

    await (env as any).STATIC_BUCKET.put(videoKey, 'video-bytes');

    await expectOk(await api('/api/timelines', {
      method: 'POST',
      token: owner.token,
      body: {
        potId,
        date: '2026-04-22',
        description: 'video timeline',
        video: videoUrl,
      },
    }));

    const timelines = await expectOk(await api(`/api/pots/${potId}/timelines`, { token: owner.token }));
    const timeline = timelines.data.find((item: any) => item.description === 'video timeline');
    expect(timeline).toBeTruthy();

    await expectOk(await api(`/api/timelines/${timeline.id}`, {
      method: 'DELETE',
      token: owner.token,
    }));

    await expect((env as any).STATIC_BUCKET.get(videoKey)).resolves.toBeNull();
  });

  it('keeps timeline images in R2 when they are still used as the pot cover', async () => {
    const owner = await registerUser('timeline-cover');
    const potId = await createPot(owner, { name: 'Cover Pot', createInitialTimeline: false });
    const coverKey = `timeline/${owner.userId}/${potId}/cover.jpg`;
    const coverUrl = `https://img.kaside365.com/${coverKey}`;

    await (env as any).STATIC_BUCKET.put(coverKey, 'cover-bytes');

    await expectOk(await api('/api/timelines', {
      method: 'POST',
      token: owner.token,
      body: {
        potId,
        date: '2026-04-23',
        description: 'cover timeline',
        images: [coverUrl],
      },
    }));

    await expectOk(await api(`/api/pots/${potId}`, {
      method: 'PUT',
      token: owner.token,
      body: { imageUrl: coverUrl },
    }));

    const timelines = await expectOk(await api(`/api/pots/${potId}/timelines`, { token: owner.token }));
    const timeline = timelines.data.find((item: any) => item.description === 'cover timeline');
    expect(timeline).toBeTruthy();

    await expectOk(await api(`/api/timelines/${timeline.id}`, {
      method: 'DELETE',
      token: owner.token,
    }));

    const storedCover = await (env as any).STATIC_BUCKET.get(coverKey);
    expect(storedCover).not.toBeNull();

    const potDetail = await expectOk(await api(`/api/pots/${potId}`, { token: owner.token }));
    expect(potDetail.data.image_url).toBe(coverUrl);
  });

  it('deletes unreferenced timeline image objects from R2', async () => {
    const owner = await registerUser('timeline-image-delete');
    const potId = await createPot(owner, { name: 'Image Delete Pot', createInitialTimeline: false });
    const imageKey = `timeline/${owner.userId}/${potId}/unused.jpg`;
    const imageUrl = `https://img.kaside365.com/${imageKey}`;

    await (env as any).STATIC_BUCKET.put(imageKey, 'unused-image-bytes');

    await expectOk(await api('/api/timelines', {
      method: 'POST',
      token: owner.token,
      body: {
        potId,
        date: '2026-04-24',
        description: 'unused image timeline',
        images: [imageUrl],
      },
    }));

    const timelines = await expectOk(await api(`/api/pots/${potId}/timelines`, { token: owner.token }));
    const timeline = timelines.data.find((item: any) => item.description === 'unused image timeline');
    expect(timeline).toBeTruthy();

    await expectOk(await api(`/api/timelines/${timeline.id}`, {
      method: 'DELETE',
      token: owner.token,
    }));

    await expect((env as any).STATIC_BUCKET.get(imageKey)).resolves.toBeNull();
  });

  it('does not delete media objects outside the current pot scope', async () => {
    const victim = await registerUser('r2-victim');
    const attacker = await registerUser('r2-attacker');
    const victimKey = `pots/${victim.userId}/victim-cover.webp`;
    const victimUrl = `https://img.kaside365.com/${victimKey}`;

    await (env as any).STATIC_BUCKET.put(victimKey, 'victim-image-bytes', {
      httpMetadata: { contentType: 'image/webp' },
    });

    const victimPotId = await createPot(victim, {
      name: 'Victim R2 Pot',
      imageUrl: victimUrl,
    });
    const attackerPotId = await createPot(attacker, {
      name: 'Attacker Pot',
      createInitialTimeline: false,
    });

    await expectOk(await api('/api/timelines', {
      method: 'POST',
      token: attacker.token,
      body: {
        potId: attackerPotId,
        date: '2026-04-25',
        description: 'reference victim object',
        images: [victimUrl],
      },
    }));

    const timelines = await expectOk(await api(`/api/pots/${attackerPotId}/timelines`, { token: attacker.token }));
    const timeline = timelines.data.find((item: any) => item.description === 'reference victim object');
    expect(timeline).toBeTruthy();

    await expectOk(await api(`/api/timelines/${timeline.id}`, {
      method: 'DELETE',
      token: attacker.token,
    }));

    const storedVictimCover = await (env as any).STATIC_BUCKET.get(victimKey);
    expect(storedVictimCover).not.toBeNull();

    const victimPot = await expectOk(await api(`/api/pots/${victimPotId}`, { token: victim.token }));
    expect(victimPot.data.image_url).toBe(victimUrl);
  });

  it('covers schedule duplicate rules, reminders, updates, and deletion', async () => {
    const owner = await registerUser('schedules');
    const potId = await createPot(owner, {
      name: 'Schedule Pot',
      plantDate: '2026-03-01',
      lastCare: '2026-03-01',
    });

    const water = await expectOk(await api('/api/care-schedules', {
      method: 'POST',
      token: owner.token,
      body: {
        potId,
        careType: 'water',
        intervalDays: 7,
      },
    }));
    expect(water.id).toBeTruthy();

    expectStatus(await api('/api/care-schedules', {
      method: 'POST',
      token: owner.token,
      body: {
        potId,
        careType: 'water',
        intervalDays: 10,
      },
    }), 409);

    const custom = await expectOk(await api('/api/care-schedules', {
      method: 'POST',
      token: owner.token,
      body: {
        potId,
        careType: 'custom',
        customAction: 'Mist leaves',
        intervalDays: 3,
      },
    }));

    expectStatus(await api('/api/care-schedules', {
      method: 'POST',
      token: owner.token,
      body: {
        potId,
        careType: 'custom',
        customAction: '  mist leaves  ',
        intervalDays: 5,
      },
    }), 409);

    const monthly = await expectOk(await api('/api/care-schedules', {
      method: 'POST',
      token: owner.token,
      body: {
        potId,
        careType: 'fertilize',
        intervalDays: 30,
      },
    }));

    const remindersAfterMonthly = await expectOk(await api('/api/care-schedules/reminders', { token: owner.token }));
    expect(remindersAfterMonthly.data.some((item: any) => item.scheduleId === monthly.id)).toBe(false);

    const trimSchedule = await expectOk(await api('/api/care-schedules', {
      method: 'POST',
      token: owner.token,
      body: {
        potId,
        careType: 'trim',
        intervalDays: 5,
      },
    }));

    await expectOk(await api('/api/care-records', {
      method: 'POST',
      token: owner.token,
      body: {
        potId,
        types: ['prune'],
        actions: ['Pruned'],
        careDate: '2026-03-05',
      },
    }));

    await expectOk(await api('/api/care-records', {
      method: 'POST',
      token: owner.token,
      body: {
        potId,
        types: ['fertilize'],
        actions: ['Fertilized'],
        careDate: '2026-03-10',
      },
    }));

    await expectOk(await api('/api/care-records', {
      method: 'POST',
      token: owner.token,
      body: {
        potId,
        types: ['other'],
        actions: ['Mist leaves'],
        careDate: '2026-03-12',
      },
    }));

    const remindersAfterMatchedCare = await expectOk(await api('/api/care-schedules/reminders', { token: owner.token }));
    expect(remindersAfterMatchedCare.data.some((item: any) => item.scheduleId === monthly.id)).toBe(true);
    expect(remindersAfterMatchedCare.data.some((item: any) => item.scheduleId === custom.id)).toBe(true);
    expect(remindersAfterMatchedCare.data.some((item: any) => item.scheduleId === trimSchedule.id)).toBe(true);

    const byPot = await expectOk(await api(`/api/care-schedules/pot/${potId}`, { token: owner.token }));
    expect(byPot.data).toHaveLength(4);
    const trimFromList = byPot.data.find((item: any) => item.id === trimSchedule.id);
    expect(trimFromList?.schedule_last_care).toBe('2026-03-05');
    const monthlyFromList = byPot.data.find((item: any) => item.id === monthly.id);
    expect(monthlyFromList?.schedule_last_care).toBe('2026-03-10');
    const customFromList = byPot.data.find((item: any) => item.id === custom.id);
    expect(customFromList?.schedule_last_care).toBe('2026-03-12');

    const reminders = await expectOk(await api('/api/care-schedules/reminders', { token: owner.token }));
    expect(Array.isArray(reminders.data)).toBe(true);

    await expectOk(await api(`/api/care-schedules/${custom.id}`, {
      method: 'PUT',
      token: owner.token,
      body: {
        intervalDays: 4,
        enabled: false,
      },
    }));

    await expectOk(await api(`/api/care-schedules/${custom.id}`, {
      method: 'DELETE',
      token: owner.token,
    }));

    const afterDelete = await expectOk(await api(`/api/care-schedules/pot/${potId}`, { token: owner.token }));
    expect(afterDelete.data).toHaveLength(3);
  });
});
