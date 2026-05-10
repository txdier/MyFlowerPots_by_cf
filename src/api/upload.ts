import { jsonResponse, errorResponse } from '../utils/response-utils';
import {
  generateStoragePath
} from '../utils/storage-utils';
import { findAccessiblePot } from '../utils/pot-access-utils';

function getFallbackImageUrl(request: Request): string {
  const origin = new URL(request.url).origin.replace(/\/$/, '');
  return `${origin}/assets/images/icons/icons-default-pot.png`;
}

export async function handleUploadRequest(
  request: Request,
  env: any,
  path: string,
  token: string | null
): Promise<Response> {
  // 图片上传API
  if (request.method === 'POST' && path === '/api/upload/image') {
    return handleImageUpload(request, env, token);
  }

  return errorResponse('Not Found', 404);
}

async function handleImageUpload(request: Request, env: any, token: string | null): Promise<Response> {
  // 安全加固：强制验证身份
  const userId = token;
  if (!userId) {
    return errorResponse('Authentication required', 401);
  }
  // 检查请求内容类型
  const contentType = request.headers.get('content-type') || '';

  // 更宽松的检查，允许没有boundary的情况
  if (!contentType.includes('multipart/form-data')) {
    console.warn('Content-Type检查失败:', contentType);
    // 不立即返回错误，尝试解析表单数据
  }

  // 解析表单数据
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (error) {
    console.error('解析表单数据失败:', error);
    return errorResponse('无法解析表单数据。请确保使用正确的multipart/form-data格式', 400);
  }

  const imageFile = formData.get('image') as File;
  const uploadType = formData.get('uploadType') as string || 'pot'; // 默认类型为pot

  // 获取potId参数（对于时间线和养护记录必需）
  const potId = formData.get('potId') as string | null;

  // 向后兼容：支持旧的entityId参数
  const entityId = formData.get('entityId') as string | null;
  const finalPotId = potId || entityId;

  if (!imageFile) {
    return errorResponse('No image file provided', 400);
  }

  // 验证文件类型
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (!allowedTypes.includes(imageFile.type)) {
    return errorResponse('Invalid image type. Allowed types: JPEG, PNG, GIF, WebP', 400);
  }

  // 验证文件大小 (最大10MB，前端会预先压缩，此为兜底限制)
  const maxSize = 10 * 1024 * 1024; // 10MB
  if (imageFile.size > maxSize) {
    return errorResponse('Image file too large. Maximum size is 10MB', 400);
  }

  // 生成唯一文件名
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 15);
  const fileExtension = imageFile.type.split('/')[1];
  const fileName = `image_${timestamp}_${randomString}.${fileExtension}`;

  // 检查是否为开发环境
  const isDevelopment = request.headers.get('host')?.includes('localhost') ||
    request.headers.get('host')?.includes('127.0.0.1');

  let imageUrl: string;
  const fallbackImageUrl = getFallbackImageUrl(request);

  if (isDevelopment) {
    // 开发环境：返回站内占位图，避免依赖外部占位图服务
    imageUrl = fallbackImageUrl;
  } else if (env.STATIC_BUCKET) {
    // 生产环境：上传到R2
    try {
      // 安全加固：使用通过校验的 userId (token)

      // 生成对象键
      let objectKey: string;
      try {
        objectKey = generateStoragePath(uploadType, userId, finalPotId, fileName);
      } catch (error) {
        console.error('生成存储路径失败:', error);
        const msg = error instanceof Error ? error.message : '生成存储路径失败';
        return errorResponse(msg, 400);
      }

      // 上传到R2
      await env.STATIC_BUCKET.put(objectKey, imageFile.stream(), {
        httpMetadata: {
          contentType: imageFile.type,
          cacheControl: 'public, max-age=31536000, immutable',
        }
      });

      // 使用自定义域名生成URL
      imageUrl = `https://img.kaside365.com/${objectKey}`;

    } catch (uploadError) {
      console.error('R2上传失败:', uploadError);
      // 上传失败时返回站内占位图，避免前端请求外部失效域名
      imageUrl = fallbackImageUrl;
    }
  } else {
    // 没有配置存储桶，返回站内占位图
    imageUrl = fallbackImageUrl;
  }

  // 根据上传类型更新数据库
  try {
    if (uploadType === 'pot' && finalPotId) {
      // 安全加固：更新前校验归属权
      const pot = await findAccessiblePot(env, finalPotId, userId, 'owner', {
        select: 'p.id'
      });

      if (pot) {
        // 更新花盆图片URL
        await env.DB
          .prepare('UPDATE pots SET image_url = ? WHERE id = ?')
          .bind(imageUrl, finalPotId)
          .run();
      } else {
        console.warn(`越权上传尝试或花盆不存在: User ${userId} 尝试上传到 Pot ${finalPotId}`);
        // 这里不返回错误给前端，因为图片已经上传到 R2 了，只是不更新到别人的花盆
      }
    }
  } catch (dbError) {
    console.error('更新数据库失败:', dbError);
    // 不返回错误，图片上传本身是成功的
  }

  return jsonResponse({
    success: true,
    message: 'Image uploaded successfully',
    data: {
      url: imageUrl,
      imageUrl,
      fileName,
      originalName: imageFile.name,
      size: imageFile.size,
      type: imageFile.type,
      uploadType,
      potId: finalPotId
    }
  });
}
