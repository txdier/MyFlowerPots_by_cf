const DEFAULT_IMAGES = [
  'icons-default-pot.png',
];

const R2_MEDIA_HOSTNAME = 'img.kaside365.com';

export type R2DeleteScope = {
  userId?: string | number | null;
  ownerId?: string | number | null;
  potId?: string | number | null;
  potIds?: Array<string | number | null | undefined>;
};

export function isDefaultImage(url: string): boolean {
  if (!url) return false;
  return DEFAULT_IMAGES.some(defaultImg => url.includes(defaultImg));
}

export function extractObjectKeyFromUrl(url: string): string | null {
  if (!url) return null;

  try {
    const urlObj = new URL(url);
    if (urlObj.hostname !== R2_MEDIA_HOSTNAME) {
      return null;
    }

    const objectKey = urlObj.pathname.replace(/^\/+/, '');
    if (!objectKey || objectKey.includes('\\')) {
      return null;
    }

    const parts = objectKey.split('/');
    if (parts.some(part => !part || part === '.' || part === '..')) {
      return null;
    }

    return objectKey;
  } catch {
    return null;
  }
}

function normalizeScopeId(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function buildScopeSet(values: Array<string | number | null | undefined>): Set<string> {
  const set = new Set<string>();
  for (const value of values) {
    const normalized = normalizeScopeId(value);
    if (normalized) set.add(normalized);
  }
  return set;
}

export function isObjectKeyAllowedForDelete(objectKey: string, scope: R2DeleteScope = {}): boolean {
  const parts = objectKey.split('/');
  if (parts.some(part => !part || part === '.' || part === '..')) {
    return false;
  }

  const scopedUserIds = buildScopeSet([scope.userId, scope.ownerId]);
  const scopedPotIds = buildScopeSet([
    scope.potId,
    ...(Array.isArray(scope.potIds) ? scope.potIds : [])
  ]);
  const [directory, objectUserId, objectPotId] = parts;

  if (directory === 'pots' || directory === 'general') {
    return !!objectUserId && scopedUserIds.has(objectUserId);
  }

  if (directory === 'timeline' || directory === 'care') {
    return (!!objectPotId && scopedPotIds.has(objectPotId))
      || (!!objectUserId && scopedUserIds.has(objectUserId));
  }

  return false;
}

export async function deleteFileFromR2(
  env: any,
  objectKey: string
): Promise<boolean> {
  try {
    if (!env.STATIC_BUCKET) {
      console.warn('R2 bucket is not configured; skipping file deletion', objectKey);
      return false;
    }

    await env.STATIC_BUCKET.delete(objectKey);
    return true;
  } catch (error) {
    console.error('Failed to delete R2 object:', error, 'objectKey:', objectKey);
    return false;
  }
}

export async function deleteFilesFromR2(
  env: any,
  objectKeys: string[]
): Promise<{ success: number; failed: number }> {
  if (!env.STATIC_BUCKET || objectKeys.length === 0) {
    return { success: 0, failed: 0 };
  }

  let success = 0;
  let failed = 0;

  for (const objectKey of objectKeys) {
    try {
      await env.STATIC_BUCKET.delete(objectKey);
      success++;
    } catch (error) {
      failed++;
      console.error('Failed to delete R2 object:', error, 'objectKey:', objectKey);
    }
  }

  return { success, failed };
}

export function extractObjectKeysFromUrls(urls: string[], scope: R2DeleteScope = {}): string[] {
  return urls
    .map(url => extractObjectKeyFromUrl(url))
    .filter((key): key is string => (
      key !== null &&
      !isDefaultImage(key) &&
      isObjectKeyAllowedForDelete(key, scope)
    ));
}

export function normalizeImageUrls(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map(item => String(item || '').trim()).filter(Boolean);
  }

  const text = String(value || '').trim();
  if (!text) return [];

  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed)
      ? parsed.map(item => String(item || '').trim()).filter(Boolean)
      : [text];
  } catch {
    return [text];
  }
}

export function getRemovedImageUrls(oldValue: unknown, newValue: unknown): string[] {
  const oldUrls = normalizeImageUrls(oldValue);
  const newUrlSet = new Set(normalizeImageUrls(newValue));
  return oldUrls.filter(url => !newUrlSet.has(url));
}

export async function deleteImagesFromR2(
  env: any,
  value: unknown,
  scope: R2DeleteScope = {}
): Promise<{ success: number; failed: number }> {
  const objectKeys = extractObjectKeysFromUrls(normalizeImageUrls(value), scope);
  return deleteFilesFromR2(env, objectKeys);
}

type ReferencedImageOptions = {
  excludeTimelineId?: string | number | null;
  excludeCareRecordId?: string | number | null;
};

async function getReferencedImageUrlsForPot(
  env: any,
  potId: string,
  value: unknown,
  options: ReferencedImageOptions = {}
): Promise<Set<string>> {
  const candidateUrls = normalizeImageUrls(value);
  const candidateSet = new Set(candidateUrls);
  const referencedUrls = new Set<string>();
  if (!env.DB || !potId || candidateSet.size === 0) return referencedUrls;

  const addReferenced = (source: unknown) => {
    for (const url of normalizeImageUrls(source)) {
      if (candidateSet.has(url)) referencedUrls.add(url);
    }
  };

  const pot: any = await env.DB
    .prepare('SELECT image_url FROM pots WHERE id = ?')
    .bind(potId)
    .first();
  addReferenced(pot?.image_url);

  const timelineRows = await env.DB
    .prepare('SELECT id, images FROM timelines WHERE pot_id = ?')
    .bind(potId)
    .all();
  for (const row of ((timelineRows.results || []) as any[])) {
    if (
      options.excludeTimelineId !== undefined &&
      options.excludeTimelineId !== null &&
      String(row.id) === String(options.excludeTimelineId)
    ) {
      continue;
    }
    addReferenced(row.images);
  }

  const careRows = await env.DB
    .prepare('SELECT id, image_url FROM care_records WHERE pot_id = ?')
    .bind(potId)
    .all();
  for (const row of ((careRows.results || []) as any[])) {
    if (
      options.excludeCareRecordId !== undefined &&
      options.excludeCareRecordId !== null &&
      String(row.id) === String(options.excludeCareRecordId)
    ) {
      continue;
    }
    addReferenced(row.image_url);
  }

  return referencedUrls;
}

export async function deleteUnreferencedImagesFromR2(
  env: any,
  potId: string,
  value: unknown,
  options: ReferencedImageOptions = {}
): Promise<{ success: number; failed: number; skipped: number }> {
  const imageUrls = Array.from(new Set(normalizeImageUrls(value)));
  if (imageUrls.length === 0) {
    return { success: 0, failed: 0, skipped: 0 };
  }

  const referencedUrls = await getReferencedImageUrlsForPot(env, potId, imageUrls, options);
  const deletableUrls = imageUrls.filter(url => !referencedUrls.has(url));
  const result = await deleteImagesFromR2(env, deletableUrls, { potId });
  return {
    ...result,
    skipped: imageUrls.length - deletableUrls.length
  };
}

export async function deleteMediaFromR2(
  env: any,
  value: unknown,
  scope: R2DeleteScope = {}
): Promise<{ success: number; failed: number }> {
  const objectKeys = extractObjectKeysFromUrls(normalizeImageUrls(value), scope);
  return deleteFilesFromR2(env, objectKeys);
}

export async function collectUserImageUrls(env: any, userId: string): Promise<string[]> {
  const imageUrls: string[] = [];
  const addImages = (value: unknown) => {
    imageUrls.push(...normalizeImageUrls(value));
  };

  const user = await env.DB
    .prepare('SELECT avatar_url FROM users WHERE id = ?')
    .bind(userId)
    .first();
  addImages(user?.avatar_url);

  const pots = await env.DB
    .prepare('SELECT id, image_url FROM pots WHERE user_id = ?')
    .bind(userId)
    .all();

  const potRows = pots.results || [];
  potRows.forEach((pot: any) => addImages(pot.image_url));

  if (potRows.length > 0) {
    const potIds = potRows.map((pot: any) => pot.id);
    const placeholders = potIds.map(() => '?').join(',');

    try {
      const careRecords = await env.DB.prepare(`
        SELECT image_url FROM care_records WHERE pot_id IN (${placeholders})
      `).bind(...potIds).all();
      (careRecords.results || []).forEach((record: any) => addImages(record.image_url));
    } catch (error) {
      console.warn('Error querying care record images, proceeding anyway:', error);
    }

    try {
      const timelines = await env.DB.prepare(`
        SELECT images FROM timelines WHERE pot_id IN (${placeholders})
      `).bind(...potIds).all();
      (timelines.results || []).forEach((timeline: any) => addImages(timeline.images));
    } catch (error) {
      console.warn('Error querying timeline images, proceeding anyway:', error);
    }
  }

  return Array.from(new Set(imageUrls.filter(Boolean)));
}

export function generateStoragePath(
  uploadType: string,
  userId: string,
  potId: string | null,
  fileName: string
): string {
  if (uploadType === 'pot') {
    return `pots/${userId}/${fileName}`;
  } else if (uploadType === 'timeline') {
    if (!potId) {
      throw new Error('Timeline image upload requires potId');
    }
    return `timeline/${userId}/${potId}/${fileName}`;
  } else if (uploadType === 'care') {
    if (!potId) {
      throw new Error('Care image upload requires potId');
    }
    return `care/${userId}/${potId}/${fileName}`;
  } else {
    return `general/${userId}/${fileName}`;
  }
}

export function getUserIdFromRequest(request: Request): string {
  const authHeader = request.headers.get('Authorization');
  if (authHeader) {
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.substring(7)
      : authHeader;
    return token;
  }

  const userId = request.headers.get('x-user-id');
  if (userId) return userId;

  return 'anonymous';
}
