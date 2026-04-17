import { getJwtSecret, getTokenFromHeader, verifyJWT } from './utils/auth-utils';
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
import { handleShareRequest } from './api/share';
import { handleCollaboratorsRequest } from './api/collaborators';
import { handleViewersRequest } from './api/viewers';
import { handleBatchInvitesRequest } from './api/batch-invites';
import { handleTransferRequest } from './api/transfer';
import { handleMessagesRequest } from './api/messages';
import { handleSupportRequest } from './api/support';
import { parseEmail } from './utils/email-parser';
import { servePotDetailWithMeta } from './static/server';
import { recordPageVisit } from './api/analytics';

export default {
  async fetch(request: Request, env: any, ctx: any): Promise<Response> {
    try {
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
          try {
            const secret = getJwtSecret(env);
            const payload = await verifyJWT(rawToken, secret);
            if (payload) {
              userId = payload.userId;
            } else {
              // 如果提供了 token 但验证失败，可能是过期或伪造
              // 注意：有些路由可能允许匿名访问，所以这里不直接报错，由具体处理程序决定
              console.warn('Token verification failed for path:', path);
            }
          } catch (error) {
            console.error('JWT configuration error:', error);
            return errorResponse('Server authentication is not configured securely. JWT_SECRET is missing or uses a known insecure placeholder value in the active deployment.', 500);
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

        // 支持收件箱API（管理员专用，需在 handleAdminRequest 之前拦截）
        if (path.startsWith('/api/admin/support/')) {
          return handleSupportRequest(request, env, path, url, userId);
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

        // 分享、协作与转移API (新增)
        if (path.startsWith('/api/share/') || path.startsWith('/api/public/pots/')) {
          return handleShareRequest(request, env, path, userId);
        }

        if (path.startsWith('/api/transfer/') || path.startsWith('/api/public/transfer/')) {
          return handleTransferRequest(request, env, path, userId);
        }

        if (path.startsWith('/api/collaborators/')) {
          return handleCollaboratorsRequest(request, env, path, userId);
        }

        if (path.startsWith('/api/viewers/')) {
          return handleViewersRequest(request, env, path, userId);
        }

        if (path.startsWith('/api/batch-invites')) {
          return handleBatchInvitesRequest(request, env, path, userId);
        }

        if (path.startsWith('/api/messages')) {
          return handleMessagesRequest(request, env, path, userId);
        }

        // 其他API路由可以在这里添加
        return errorResponse('API Not Found', 404);
      }

      // 2️⃣ 静态资源服务 — 统一使用 Workers Assets（开发/生产均通过 env.ASSETS）
      // 注意：用户上传的媒体文件（花盆图片等）仍存储在 R2，通过 img.kaside365.com 访问，不受影响。

      // 📊 统计页面访问 (异步执行，不阻塞响应)
      if (request.method === 'GET') {
        const isPageRequest = path === '/' || path.endsWith('.html');
        if (isPageRequest) {
          ctx.waitUntil(recordPageVisit(env, path));
        }
      }

      // ✨ 分享卡片 OG Meta 注入：对 pot-detail.html 带 token/id 的请求单独处理
      // 先从 ASSETS 获取静态 HTML，再用 HTMLRewriter 注入花盆元数据（用于微信等社交媒体预览）
      const isPotDetail = path === '/pot-detail.html' || path.includes('/pot-detail');
      const shareToken = url.searchParams.get('token');
      const shareId = url.searchParams.get('id');

      if (env.ASSETS && isPotDetail && (shareToken || shareId) && env.DB) {
        const baseResponse = await env.ASSETS.fetch(request);
        return servePotDetailWithMeta(baseResponse, env, shareToken, shareId);
      }

      // 所有其他非 API 请求直接交给 Workers Assets 处理
      if (env.ASSETS) {
        return env.ASSETS.fetch(request);
      }

      return errorResponse('Not Found', 404);
    } catch (error) {
      console.error('Unhandled worker fetch error:', error);
      return errorResponse('Internal Server Error', 500);
    }
  },

  // ── 接收 Cloudflare Email Routing 转发的邮件 ───────────────────────────
  async email(message: ForwardableEmailMessage, env: any): Promise<void> {
    try {
      const raw = await new Response(message.raw).arrayBuffer();
      const parsed = await parseEmail(raw);

      const id = crypto.randomUUID();
      
      const attachmentMeta = [];
      const bucketExists = !!env.STATIC_BUCKET;
      
      console.log(`正在处理新邮件: ${parsed.subject}, 原始附件数: ${parsed.attachments?.length || 0}, R2绑定: ${bucketExists}`);

      if (parsed.attachments && parsed.attachments.length > 0 && bucketExists) {
        for (const att of parsed.attachments) {
          const r2Key = `support-attachments/${id}/${att.filename}`;
          console.log(`正在上传附件至 R2: ${r2Key} (${att.size} bytes)`);
          
          // Upload to R2
          await env.STATIC_BUCKET.put(r2Key, att.content, {
            httpMetadata: { contentType: att.mimeType }
          });
          
          attachmentMeta.push({
            filename: att.filename,
            mimeType: att.mimeType,
            size: att.size,
            r2Key: r2Key
          });
        }
      }
      
      const attachmentsJson = attachmentMeta.length > 0 ? JSON.stringify(attachmentMeta) : null;

      await env.DB.prepare(
        `INSERT INTO support_emails (id, from_addr, to_addr, subject, text_body, html_body, received_at, read, replied, attachments)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?)`
      )
        .bind(
          id,
          message.from,
          message.to,
          parsed.subject,
          parsed.textBody,
          parsed.htmlBody ?? null,
          new Date().toISOString(),
          attachmentsJson
        )
        .run();

      console.log(`支持邮件已接收并存储: ${id} — ${parsed.subject} (成功保存附件: ${attachmentMeta.length})`);
    } catch (err) {
      console.error('处理收到的邮件时出错:', err);
    }
  },
};
