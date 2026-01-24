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

// 开发环境下的静态资源服务 - 简化版
export async function serveStaticDev(
  request: Request,
  path: string
): Promise<Response> {
  // 在开发环境中，我们返回简化版前端HTML内容
  
  if (path === '/' || path === '' || path === '/index.html' || path === '/test-button-fix.html') {
    // 简化版HTML，确保按钮点击能工作
    const simpleHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>我的花盆 - 开发测试版</title>
    <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
    <style>
        body { font-family: Arial, sans-serif; padding: 20px; }
        .container { max-width: 800px; margin: 0 auto; }
        .btn { padding: 10px 20px; margin: 10px; border: none; border-radius: 4px; cursor: pointer; }
        .btn-primary { background-color: #4CAF50; color: white; }
        .btn-outline { background-color: transparent; border: 1px solid #4CAF50; color: #4CAF50; }
        .page { padding: 20px; border: 1px solid #ddd; margin: 10px 0; border-radius: 5px; }
        .hidden { display: none; }
    </style>
</head>
<body>
    <div class="container">
        <h1>我的花盆 - 开发测试版</h1>
        <p>测试按钮点击功能是否正常工作</p>
        
        <div>
            <button id="login-btn" class="btn btn-primary">测试登录按钮</button>
            <button id="add-pot-btn" class="btn btn-primary">测试添加花盆按钮</button>
            <button id="register-btn" class="btn btn-outline">测试注册按钮</button>
        </div>
        
        <div id="login-page" class="page hidden">
            <h2>登录页面</h2>
            <p>登录页面内容 - 按钮点击成功！</p>
            <button id="back-from-login" class="btn">返回首页</button>
        </div>
        
        <div id="add-pot-page" class="page hidden">
            <h2>添加花盆页面</h2>
            <p>添加花盆页面内容 - 按钮点击成功！</p>
            <button id="back-from-add" class="btn">返回首页</button>
        </div>
        
        <div id="register-page" class="page hidden">
            <h2>注册页面</h2>
            <p>注册页面内容 - 按钮点击成功！</p>
            <button id="back-from-register" class="btn">返回首页</button>
        </div>
        
        <div id="result" style="margin-top: 20px; padding: 10px; background-color: #f5f5f5; border-radius: 4px;">
            点击上面的按钮测试功能
        </div>
    </div>
    
    <script>
        // 简单的按钮点击测试
        document.addEventListener('DOMContentLoaded', function() {
            const resultDiv = document.getElementById('result');
            const loginPage = document.getElementById('login-page');
            const addPotPage = document.getElementById('add-pot-page');
            const registerPage = document.getElementById('register-page');
            
            function showPage(page) {
                // 隐藏所有页面
                loginPage.classList.add('hidden');
                addPotPage.classList.add('hidden');
                registerPage.classList.add('hidden');
                
                // 显示指定页面
                if (page) {
                    page.classList.remove('hidden');
                }
                
                // 更新结果
                resultDiv.textContent = '按钮点击成功！页面已切换。';
            }
            
            // 登录按钮
            document.getElementById('login-btn').addEventListener('click', function() {
                showPage(loginPage);
            });
            
            // 添加花盆按钮
            document.getElementById('add-pot-btn').addEventListener('click', function() {
                showPage(addPotPage);
            });
            
            // 注册按钮
            document.getElementById('register-btn').addEventListener('click', function() {
                showPage(registerPage);
            });
            
            // 返回按钮
            document.getElementById('back-from-login').addEventListener('click', function() {
                showPage(null);
                resultDiv.textContent = '已返回首页';
            });
            
            document.getElementById('back-from-add').addEventListener('click', function() {
                showPage(null);
                resultDiv.textContent = '已返回首页';
            });
            
            document.getElementById('back-from-register').addEventListener('click', function() {
                showPage(null);
                resultDiv.textContent = '已返回首页';
            });
            
            // 测试Alpine.js是否加载
            if (typeof Alpine !== 'undefined') {
                console.log('Alpine.js已加载');
                resultDiv.textContent += ' (Alpine.js已加载)';
            }
        });
    </script>
</body>
</html>`;
    
    return htmlResponse(simpleHtml);
  }

  // 对于其他路径，返回404，让wrangler的assets功能处理
  return errorResponse('Not Found', 404);
}
