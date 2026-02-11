import { getTokenFromHeader, verifyJWT } from './utils/auth-utils';
import { corsResponse, errorResponse } from './utils/response-utils';
import { handleAuthRequest } from './api/auth';
import { handlePotsRequest } from './api/pots';
import { handleCareRecordsRequest } from './api/care-records';
import { handleCareSchedulesRequest } from './api/care-schedules';
import { handleTimelinesRequest } from './api/timelines';
import { handleUploadRequest } from './api/upload';
import { handlePlantsRequest } from './api/plants';
import { handleAdminRequest } from './api/admin';
import { handleWeatherRequest } from './api/weather';
import { handleCareAdviceRequest } from './api/care-advice';
import { serveStatic, serveStaticDev } from './static/server';
import { recordPageVisit } from './api/analytics';

export default {
  async fetch(request: Request, env: any, ctx: any): Promise<Response> {
    const url = new URL(request.url);
    let path = url.pathname; // 使用let而不是const

    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return corsResponse();
    }

    // 1️⃣ API路由处理
    if (path.startsWith('/api/')) {
      const rawToken = getTokenFromHeader(request);
      let userId: string | null = null;

      // 验证 JWT 并提取 userId
      if (rawToken) {
        const secret = env.JWT_SECRET || 'default-secret';
        const payload = await verifyJWT(rawToken, secret);
        if (payload) {
          userId = payload.userId;
        } else {
          // 如果提供了 token 但验证失败，可能是过期或伪造
          // 注意：有些路由可能允许匿名访问，所以这里不直接报错，由具体处理程序决定
          console.warn('Token verification failed for path:', path);
        }
      }

      // 兼容：如果 token 本身就是一个 userId (旧版)，且验证失败，
      // 这里的 userId 会是 null。为了平滑过滤，我们可以选择是否允许旧版 ID 直接作为 userId。
      // 但出于安全考虑，既然要切换到 JWT，建议强制执行。
      // 为方便测试，暂时保留旧版兼容逻辑（如果认证失败且 token 长度符合 UUID，则视为旧版）
      if (!userId && rawToken && rawToken.length > 32) {
        // 长度大于32通常是 JWT，如果验证失败了就不信任
      } else if (!userId && rawToken) {
        // 如果长度较短，可能是旧版 userId
        // userId = rawToken; // ⚠️ 注释掉此行以切断旧版永久 ID 攻击
      }

      // 认证相关API
      if (path.startsWith('/api/auth/')) {
        return handleAuthRequest(request, env, path, url, userId);
      }

      // 管理员专用API
      if (path.startsWith('/api/admin/')) {
        return handleAdminRequest(request, env, path, url, userId);
      }

      // 花盆相关API
      if (path.startsWith('/api/pots')) {
        return handlePotsRequest(request, env, ctx, path, url, userId);
      }

      // 养护记录API
      if (path.startsWith('/api/care-records')) {
        return handleCareRecordsRequest(request, env, path, userId);
      }

      // 养护计划API (新增)
      if (path.startsWith('/api/care-schedules')) {
        return handleCareSchedulesRequest(request, env, path, userId);
      }

      // 时间线API
      if (path.startsWith('/api/timelines')) {
        return handleTimelinesRequest(request, env, path, userId);
      }

      // 图片上传API
      if (path.startsWith('/api/upload/')) {
        return handleUploadRequest(request, env, path, userId);
      }

      // 植物相关API
      if (path.startsWith('/api/plants/')) {
        return handlePlantsRequest(request, env, path, url);
      }

      // 天气相关API
      if (path === '/api/weather') {
        return handleWeatherRequest(request, env, url);
      }

      // 养护建议API
      if (path === '/api/care-advice') {
        return handleCareAdviceRequest(request, env);
      }

      // 其他API路由可以在这里添加
      return new Response('API Not Found', { status: 404 });
    }

    // 2️⃣ 静态资源服务
    // 开发环境：使用开发模式静态服务
    // 生产环境：从R2获取静态资源
    const isDevelopment = url.hostname === '127.0.0.1' || url.hostname === 'localhost';

    // 📊 统计页面访问 (异步执行，不阻塞响应)
    if (request.method === 'GET' && !path.startsWith('/api/')) {
      // 简单判断是否是页面请求（根据需求可以调整过滤逻辑）
      const isPageRequest = path === '/' || path.endsWith('.html');
      if (isPageRequest) {
        ctx.waitUntil(recordPageVisit(env, path));
      }
    }

    console.log('请求处理:', {
      path,
      hostname: url.hostname,
      isDevelopment,
      hasStaticBucket: !!env.STATIC_BUCKET,
      url: request.url
    });

    // 特殊处理：确保根路径和空路径都正确处理
    if (path === '' || path === '/') {
      console.log('处理根路径请求，重定向到index.html');
      path = '/index.html';
    }

    // 尝试作为静态资源服务
    if (env.STATIC_BUCKET && !isDevelopment) {
      return serveStatic(request, env, path);
    } else if (isDevelopment) {
      return serveStaticDev(request, path);
    }

    console.log('无法处理请求，返回404，路径:', path);
    return errorResponse('Not Found', 404);
  }
};
