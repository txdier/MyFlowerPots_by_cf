import { htmlResponse, errorResponse } from '../utils/response-utils';

// MIME类型映射
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html;charset=UTF-8',
  '.htm': 'text/html;charset=UTF-8',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.otf': 'font/otf',
};

// 默认页面映射
const DEFAULT_PAGES: Record<string, string> = {
  '/': '/index.html',
  '': '/index.html',
  '/index': '/index.html',
};

// SPA路由前缀（这些路由应该返回index.html）
const SPA_ROUTES = [
  '/add-pot',
  '/edit-pot',
  '/care-record',
  '/pot-detail',
  '/test-api',
  '/test-integration',
  '/test-upload'
];

export async function serveStatic(
  request: Request,
  env: any,
  path: string
): Promise<Response> {
  try {
    console.log('serveStatic: 处理路径:', path, '请求URL:', request.url);

    // 处理默认页面
    if (DEFAULT_PAGES[path]) {
      path = DEFAULT_PAGES[path];
      console.log('serveStatic: 映射默认页面到:', path);
    }

    // 确保路径以/开头
    if (!path.startsWith('/')) {
      path = '/' + path;
    }

    // 检查是否是SPA路由
    // 注意：SPA路由应该是无扩展名的路径，且不是API路径
    const hasExtension = path.includes('.');
    const isApiPath = path.startsWith('/api/');
    const isSpaRoute = !hasExtension && !isApiPath && SPA_ROUTES.some(route => path.startsWith(route));

    console.log('serveStatic: 路径分析:', {
      path,
      hasExtension,
      isApiPath,
      isSpaRoute,
      shouldServeIndex: isSpaRoute || (!hasExtension && !isApiPath)
    });

    // 如果是SPA路由或无扩展名且非API路径，返回index.html
    if (isSpaRoute || (!hasExtension && !isApiPath)) {
      console.log('serveStatic: 作为SPA路由或无扩展名路径处理，返回index.html');
      return serveIndexHtml(env);
    }

    // 从R2获取文件
    console.log('serveStatic: 尝试从R2获取文件，路径:', path);

    // 尝试不同的路径变体
    const pathVariants = [
      path,                          // 原始路径
      path === '/' ? '/index.html' : path,  // 根路径转index.html
      path.startsWith('/') ? path.substring(1) : path,  // 去掉开头的/
      `/${path.startsWith('/') ? path.substring(1) : path}`,  // 确保有/
    ];

    // 去重
    const uniquePaths = [...new Set(pathVariants.filter(p => p))];
    console.log('serveStatic: 尝试的路径变体:', uniquePaths);

    let r2Object: any = null;
    let foundPath = '';

    for (const tryPath of uniquePaths) {
      console.log('serveStatic: 尝试路径:', tryPath);
      r2Object = await env.STATIC_BUCKET.get(tryPath);
      if (r2Object) {
        foundPath = tryPath;
        console.log('serveStatic: 在路径找到文件:', foundPath);
        break;
      }
    }

    if (!r2Object) {
      console.log('serveStatic: R2中找不到文件，尝试路径:', uniquePaths);

      // 如果找不到文件，返回index.html（SPA回退）
      console.log('serveStatic: 文件不存在，作为SPA路由回退到index.html');
      return serveIndexHtml(env);
    }

    console.log('serveStatic: 成功获取R2文件:', foundPath, '大小:', r2Object.size);

    // 根据文件扩展名确定MIME类型
    const ext = foundPath.substring(foundPath.lastIndexOf('.')).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    console.log('serveStatic: MIME类型:', contentType);

    return new Response(r2Object.body, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (error) {
    console.error('Static serve error:', error);
    return errorResponse('Internal Server Error', 500);
  }
}

// 服务index.html文件
async function serveIndexHtml(env: any): Promise<Response> {
  console.log('serveIndexHtml: 尝试获取index.html');

  // 尝试不同的index.html路径
  const indexPaths = ['index.html', '/index.html', 'frontend/index.html', '/frontend/index.html'];

  for (const indexPath of indexPaths) {
    const r2Object = await env.STATIC_BUCKET.get(indexPath);
    if (r2Object) {
      console.log('serveIndexHtml: 找到index.html，路径:', indexPath);
      return new Response(r2Object.body, {
        headers: {
          'Content-Type': 'text/html;charset=UTF-8',
          'Cache-Control': 'public, max-age=3600',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  }

  console.error('serveIndexHtml: 无法找到index.html文件');
  return errorResponse('Index page not found', 404);
}

function serveR2Object(object: any, ext: string): Response {
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  return new Response(object.body, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export async function serveStaticDev(
  request: Request,
  path: string
): Promise<Response> {
  // 以前这里返回一个简化的测试页面
  // 现在我们返回 404，让 wrangler.toml 中的 assets = "frontend" 配置来处理静态资源服务
  // 这样开发环境就能看到真实的、最新的前端代码效果

  return errorResponse('Not Found', 404);
}
