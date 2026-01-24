import { getTokenFromHeader } from './utils/auth-utils';
import { corsResponse, errorResponse } from './utils/response-utils';
import { handleAuthRequest } from './api/auth';
import { handlePotsRequest } from './api/pots';
import { handleCareRecordsRequest } from './api/care-records';
import { handleTimelinesRequest } from './api/timelines';
import { handleUploadRequest } from './api/upload';
import { handlePlantsRequest } from './api/plants';
import { handleAdminRequest } from './api/admin';
import { handleWeatherRequest } from './api/weather';
import { handleCareAdviceRequest } from './api/care-advice';
import { serveStatic, serveStaticDev } from './static/server';

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
      const token = getTokenFromHeader(request);

      // 认证相关API
      if (path.startsWith('/api/auth/')) {
        return handleAuthRequest(request, env, path, url);
      }

      // 管理员专用API
      if (path.startsWith('/api/admin/')) {
        return handleAdminRequest(request, env, path, url);
      }

      // 花盆相关API
      if (path.startsWith('/api/pots')) {
        return handlePotsRequest(request, env, ctx, path, url, token);
      }

      // 养护记录API
      if (path.startsWith('/api/care-records')) {
        return handleCareRecordsRequest(request, env, path);
      }

      // 时间线API
      if (path.startsWith('/api/timelines')) {
        return handleTimelinesRequest(request, env, path);
      }

      // 图片上传API
      if (path.startsWith('/api/upload/')) {
        return handleUploadRequest(request, env, path);
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

    if (env.STATIC_BUCKET && !isDevelopment) {
      // 生产环境：从R2获取静态资源
      // console.log('生产环境：使用R2静态资源服务，路径:', path);
      return serveStatic(request, env, path);
    } else if (isDevelopment) {
      // 开发环境：返回简化版页面
      console.log('开发环境：返回简化版页面，路径:', path);
      return serveStaticDev(request, path);
    } else {
      // 其他情况：返回404
      console.log('无法处理请求，返回404，路径:', path);
      return errorResponse('Not Found', 404);
    }
  }
};
