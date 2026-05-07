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
import { handleBootstrapRequest } from './api/bootstrap';
import { parseEmail } from './utils/email-parser';
import { servePotDetailWithMeta, servePublicPageWithSeo } from './static/server';
import { queuePageVisit } from './api/analytics';
import { appendD1Bookmark, createD1SessionContext } from './utils/d1-session-utils';

const STATIC_PAGE_PATHS = new Set([
  '/',
  '/index',
  '/about',
  '/add-pot',
  '/admin-inbox',
  '/admin-plants',
  '/admin-stats',
  '/admin-users',
  '/admin-cache',
  '/all-records',
  '/all-timelines',
  '/care-record',
  '/edit-pot',
  '/error',
  '/help',
  '/pot-detail',
  '/privacy',
  '/profile',
  '/reset-password',
]);

const DEFAULT_APP_BASE_URL = 'https://app.kaside365.com';
const SEO_PUBLIC_PAGE_PATHS = new Set(['/', '/index', '/about', '/help', '/privacy']);
const SITEMAP_PATHS = ['/', '/about', '/help', '/privacy'];

function normalizeStaticPagePath(path: string): string {
  const cleanPath = (path || '/').split('?')[0].split('#')[0].trim();
  if (cleanPath === '' || cleanPath === '/') return '/';
  const withoutTrailingSlash = cleanPath.replace(/\/+$/, '') || '/';
  return withoutTrailingSlash.replace(/\.html$/i, '');
}

function isStaticPagePath(path: string): boolean {
  return STATIC_PAGE_PATHS.has(normalizeStaticPagePath(path));
}

function getSiteBaseUrl(request: Request, env: any): string {
  const configured = String(env?.APP_BASE_URL || DEFAULT_APP_BASE_URL).trim();
  try {
    return new URL(configured).origin;
  } catch {
    try {
      return new URL(request.url).origin;
    } catch {
      return DEFAULT_APP_BASE_URL;
    }
  }
}

function buildAbsoluteUrl(request: Request, env: any, path: string): string {
  const base = getSiteBaseUrl(request, env).replace(/\/+$/, '');
  const cleanPath = path === '/' ? '/' : `/${path.replace(/^\/+|\/+$/g, '')}`;
  return `${base}${cleanPath}`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function getPublicCanonicalPath(path: string): string | null {
  const normalized = normalizeStaticPagePath(path);
  if (!SEO_PUBLIC_PAGE_PATHS.has(normalized)) return null;
  return normalized === '/index' ? '/' : normalized;
}

function shouldNoindexStaticPage(path: string): boolean {
  const normalized = normalizeStaticPagePath(path);
  return STATIC_PAGE_PATHS.has(normalized) && !getPublicCanonicalPath(normalized);
}

function withRobotsHeader(response: Response, value: string): Response {
  const headers = new Headers(response.headers);
  headers.set('X-Robots-Tag', value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function textResponse(body: string, contentType: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600'
    }
  });
}

function serveRobotsTxt(request: Request, env: any): Response {
  const sitemapUrl = buildAbsoluteUrl(request, env, '/sitemap.xml');
  return textResponse([
    'User-agent: *',
    'Disallow: /api/',
    'Disallow: /cdn-cgi/',
    '',
    `Sitemap: ${sitemapUrl}`,
    ''
  ].join('\n'), 'text/plain; charset=UTF-8');
}

function serveSitemapXml(request: Request, env: any): Response {
  const urls = SITEMAP_PATHS
    .map((path) => `  <url><loc>${escapeXml(buildAbsoluteUrl(request, env, path))}</loc></url>`)
    .join('\n');
  return textResponse([
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urls,
    '</urlset>',
    ''
  ].join('\n'), 'application/xml; charset=UTF-8');
}

function isSocialCrawlerRequest(request: Request): boolean {
  const userAgent = request.headers.get('user-agent') || '';
  return /bot|spider|crawler|facebookexternalhit|twitterbot|whatsapp|telegrambot|slackbot|discordbot|linkedinbot|pinterest|wechat|micromessenger/i.test(userAgent);
}

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
        const d1SessionContext = createD1SessionContext(request, env, path);
        const requestEnv = d1SessionContext.env;
        const respond = async (response: Promise<Response> | Response) => (
          appendD1Bookmark(await response, d1SessionContext)
        );

        const rawToken = getTokenFromHeader(request);
        let userId: string | null = null;

        // 验证 JWT 并提取 userId
        if (rawToken) {
          try {
            const secret = getJwtSecret(requestEnv);
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
            return respond(errorResponse('Server authentication is not configured securely. JWT_SECRET is missing or uses a known insecure placeholder value in the active deployment.', 500));
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
          return respond(handleAuthRequest(request, requestEnv, path, url, userId));
        }

        // 首页启动聚合接口
        if (path === '/api/bootstrap') {
          return respond(handleBootstrapRequest(request, requestEnv, userId));
        }

        // 支持收件箱API（管理员专用，需在 handleAdminRequest 之前拦截）
        if (path.startsWith('/api/admin/support/')) {
          return respond(handleSupportRequest(request, requestEnv, path, url, userId));
        }

        // 管理员专用API
        if (path.startsWith('/api/admin/')) {
          return respond(handleAdminRequest(request, requestEnv, path, url, userId));
        }

        // 花盆相关API
        if (path.startsWith('/api/pots')) {
          return respond(handlePotsRequest(request, requestEnv, ctx, path, url, userId));
        }

        // 养护记录API
        if (path.startsWith('/api/care-records')) {
          return respond(handleCareRecordsRequest(request, requestEnv, path, userId));
        }

        // 养护计划API (新增)
        if (path.startsWith('/api/care-schedules')) {
          return respond(handleCareSchedulesRequest(request, requestEnv, path, userId));
        }

        // 时间线API
        if (path.startsWith('/api/timelines')) {
          return respond(handleTimelinesRequest(request, requestEnv, path, userId));
        }

        // 图片上传API
        if (path.startsWith('/api/upload/')) {
          return respond(handleUploadRequest(request, requestEnv, path, userId));
        }

        // 植物相关API
        if (path.startsWith('/api/plants/')) {
          return respond(handlePlantsRequest(request, requestEnv, path, url));
        }

        // 天气相关API
        if (path === '/api/weather') {
          return respond(handleWeatherRequest(request, requestEnv, url));
        }

        // 养护建议API
        if (path === '/api/care-advice') {
          return respond(handleCareAdviceRequest(request, requestEnv));
        }

        // 分享、协作与转移API (新增)
        if (path.startsWith('/api/share/') || path.startsWith('/api/public/pots/')) {
          return respond(handleShareRequest(request, requestEnv, path, userId));
        }

        if (path.startsWith('/api/transfer/') || path.startsWith('/api/public/transfer/')) {
          return respond(handleTransferRequest(request, requestEnv, path, userId));
        }

        if (path.startsWith('/api/collaborators/')) {
          return respond(handleCollaboratorsRequest(request, requestEnv, path, userId));
        }

        if (path.startsWith('/api/viewers/')) {
          return respond(handleViewersRequest(request, requestEnv, path, userId));
        }

        if (path.startsWith('/api/batch-invites')) {
          return respond(handleBatchInvitesRequest(request, requestEnv, path, userId));
        }

        if (path.startsWith('/api/messages')) {
          return respond(handleMessagesRequest(request, requestEnv, path, userId));
        }

        // 其他API路由可以在这里添加
        return respond(errorResponse('API Not Found', 404));
      }

      // 2️⃣ 静态资源服务 — 统一使用 Workers Assets（开发/生产均通过 env.ASSETS）
      // 注意：用户上传的媒体文件（花盆图片等）仍存储在 R2，通过 img.kaside365.com 访问，不受影响。

      if (request.method === 'GET' || request.method === 'HEAD') {
        if (path === '/robots.txt') {
          return serveRobotsTxt(request, env);
        }
        if (path === '/sitemap.xml') {
          return serveSitemapXml(request, env);
        }
      }

      // 📊 统计页面访问 (异步执行，不阻塞响应)
      if (request.method === 'GET') {
        const isPageRequest = isStaticPagePath(path);
        if (isPageRequest) {
          queuePageVisit(ctx, env, path, request);
        }
      }

      // ✨ 分享卡片 OG Meta 注入：只对分享/邀请链接处理；普通站内 id 导航直接走静态资源。
      // 先从 ASSETS 获取静态 HTML，再用 HTMLRewriter 注入花盆元数据（用于微信等社交媒体预览）
      const isPotDetail = normalizeStaticPagePath(path) === '/pot-detail';
      const shareToken = url.searchParams.get('token');
      const shareId = url.searchParams.get('id');
      const collabToken = url.searchParams.get('collabToken');
      const viewerToken = url.searchParams.get('viewerToken');
      const shouldInjectPotMeta = isPotDetail && (
        shareToken
        || collabToken
        || viewerToken
        || (shareId && isSocialCrawlerRequest(request))
      );

      if (env.ASSETS && shouldInjectPotMeta && env.DB) {
        const d1SessionContext = createD1SessionContext(request, env, path);
        const assetUrl = new URL(request.url);
        assetUrl.pathname = '/pot-detail';
        assetUrl.search = '';
        assetUrl.hash = '';
        const baseResponse = await env.ASSETS.fetch(new Request(assetUrl.toString(), request));
        const metaResponse = await servePotDetailWithMeta(baseResponse, d1SessionContext.env, {
          shareToken,
          id: shareId,
          collabToken,
          viewerToken
        });
        return appendD1Bookmark(
          withRobotsHeader(metaResponse, 'noindex, follow'),
          d1SessionContext
        );
      }

      // 所有其他非 API 请求直接交给 Workers Assets 处理
      if (env.ASSETS) {
        const assetResponse = await env.ASSETS.fetch(request);
        const canonicalPath = getPublicCanonicalPath(path);

        if (canonicalPath) {
          return servePublicPageWithSeo(
            assetResponse,
            buildAbsoluteUrl(request, env, canonicalPath)
          );
        }

        if (shouldNoindexStaticPage(path)) {
          return withRobotsHeader(assetResponse, 'noindex, follow');
        }

        return assetResponse;
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
