// 存储工具函数 - 用于处理R2存储操作

// 默认图片保护列表
const DEFAULT_IMAGES = [
  'icons-default-pot.png',
  // 未来可添加其他默认图片
];

/**
 * 检查URL是否为默认图片
 */
export function isDefaultImage(url: string): boolean {
  if (!url) return false;
  return DEFAULT_IMAGES.some(defaultImg => url.includes(defaultImg));
}

/**
 * 从R2 URL中提取对象键
 * 格式: https://img.kaside365.com/{directory}/{userId}/{entityId}/{filename}
 */
export function extractObjectKeyFromUrl(url: string): string | null {
  if (!url) return null;
  
  try {
    const urlObj = new URL(url);
    // 移除域名部分，获取路径
    const path = urlObj.pathname;
    // 移除开头的斜杠
    return path.startsWith('/') ? path.substring(1) : path;
  } catch {
    // 如果不是有效的URL，尝试直接使用
    return url;
  }
}

/**
 * 从R2删除文件
 */
export async function deleteFileFromR2(
  env: any, 
  objectKey: string
): Promise<boolean> {
  try {
    if (!env.STATIC_BUCKET) {
      console.warn('R2存储桶未配置，跳过删除文件:', objectKey);
      return false;
    }
    
    await env.STATIC_BUCKET.delete(objectKey);
    return true;
  } catch (error) {
    console.error('删除R2文件失败:', error, 'objectKey:', objectKey);
    return false;
  }
}

/**
 * 批量删除R2文件
 */
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
      console.error('删除R2文件失败:', error, 'objectKey:', objectKey);
    }
  }
  
  return { success, failed };
}

/**
 * 从图片URL数组中提取对象键
 */
export function extractObjectKeysFromUrls(urls: string[]): string[] {
  return urls
    .map(url => extractObjectKeyFromUrl(url))
    .filter((key): key is string => key !== null && !isDefaultImage(key));
}

/**
 * 将单图 URL、JSON 字符串、多图数组统一为 URL 数组。
 */
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

export async function deleteImagesFromR2(env: any, value: unknown): Promise<{ success: number; failed: number }> {
  const objectKeys = extractObjectKeysFromUrls(normalizeImageUrls(value));
  return deleteFilesFromR2(env, objectKeys);
}

export async function deleteMediaFromR2(env: any, value: unknown): Promise<{ success: number; failed: number }> {
  const objectKeys = extractObjectKeysFromUrls(normalizeImageUrls(value));
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

/**
 * 生成存储路径
 * @param uploadType 上传类型: 'pot' | 'timeline' | 'care'
 * @param userId 用户ID
 * @param potId 花盆ID（对于时间线和养护记录必需，对于花盆图片可选）
 * @param fileName 文件名
 */
export function generateStoragePath(
  uploadType: string,
  userId: string,
  potId: string | null,
  fileName: string
): string {
  if (uploadType === 'pot') {
    // 花盆图片：直接放在用户目录下，忽略potId
    return `pots/${userId}/${fileName}`;
  } else if (uploadType === 'timeline') {
    // 时间线图片：需要potId
    if (!potId) {
      throw new Error('时间线图片需要potId参数');
    }
    return `timeline/${userId}/${potId}/${fileName}`;
  } else if (uploadType === 'care') {
    // 养护记录图片：需要potId
    if (!potId) {
      throw new Error('养护记录图片需要potId参数');
    }
    return `care/${userId}/${potId}/${fileName}`;
  } else {
    // 其他类型
    return `general/${userId}/${fileName}`;
  }
}

/**
 * 从请求中获取用户ID
 */
export function getUserIdFromRequest(request: Request): string {
  // 尝试从Authorization头中获取
  const authHeader = request.headers.get('Authorization');
  if (authHeader) {
    // 移除Bearer前缀
    const token = authHeader.startsWith('Bearer ') 
      ? authHeader.substring(7) 
      : authHeader;
    return token;
  }
  
  // 尝试从自定义头中获取
  const userId = request.headers.get('x-user-id');
  if (userId) return userId;
  
  return 'anonymous';
}
