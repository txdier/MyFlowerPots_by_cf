# My Flower Pots 部署配置指南

本文档说明如何配置My Flower Pots应用的生产环境。

## 1. API服务器配置

### 1.1 部署到Cloudflare Workers

1. 首先确保已经安装了Wrangler CLI：
   ```bash
   npm install -g wrangler
   ```

2. 登录到Cloudflare：
   ```bash
   wrangler login
   ```

3. 部署API到Workers：
   ```bash
   npm run deploy
   ```
   或者直接使用：
   ```bash
   wrangler deploy
   ```

4. 部署成功后，你会获得一个Workers URL，格式如：
   ```
   https://my-flower-pots-api.your-username.workers.dev
   ```

### 1.2 更新API配置（核心安全步骤）

为了防止生产域名泄露到公共仓库，项目采用了模板化配置。

1. **从模板创建配置文件**：
   ```bash
   cp frontend/js/config.js.example frontend/js/config.js
   ```

2. **编辑 `frontend/js/config.js`**，找到 `prodUrl`（大约第 17 行）：
   ```javascript
   prodUrl: 'https://您的实际域名.workers.dev',
   ```

**重要说明**：
- 这是唯一需要修改的API配置位置！
- 其他所有文件（`api-client.js`、`wrangler.toml`等）都会自动使用此配置
- 前端应用会自动根据环境选择正确的API地址
  - 开发环境（localhost/127.0.0.1）：使用 `devUrl`
  - 生产环境（其他域名）：使用 `prodUrl`

### 1.3 环境变量配置（后端配置）

在 `wrangler.toml` 中配置后端环境变量：

```toml
[vars]
WEATHER_API_KEY = "your-weather-api-key"  # 可选：天气API密钥
RESEND_API_KEY = "your-resend-api-key"  # 可选：邮件服务API密钥
EMAIL_FROM = "noreply@myflowerpots.com"  # 发件人邮箱
APP_BASE_URL = "https://your-actual-workers-url.workers.dev"  # 你的Workers URL（后端使用）
```

**注意**：`APP_BASE_URL` 是后端使用的配置，前端API地址在 `frontend/js/config.js` 中配置。

## 2. 静态资源部署

### 2.1 部署到Cloudflare R2

1. 确保在 `wrangler.toml` 中配置了R2存储桶：
   ```toml
   [[r2_buckets]]
   binding = "STATIC_BUCKET"
   bucket_name = "my-flower-pots"
   ```

2. 上传前端文件到R2：
   ```bash
   node scripts/upload-static.js
   ```

   或者手动上传：
   ```bash
   # 安装R2命令行工具
   npm install -g @cloudflare/r2

   # 上传文件
   r2 cp frontend/* r2://my-flower-pots/ --recursive
   ```

### 2.2 使用其他静态托管服务

你也可以将前端文件部署到：
- GitHub Pages
- Netlify
- Vercel
- 任何静态文件托管服务

## 3. 数据库配置

### 3.1 Cloudflare D1 数据库

应用使用Cloudflare D1作为数据库。确保已经创建了D1数据库：

1. 创建D1数据库：
   ```bash
   wrangler d1 create my-flower-pots-db
   ```

2. 更新 `wrangler.toml` 中的数据库ID：
   ```toml
   [[d1_databases]]
   binding = "DB"
   database_name = "my-flower-pots-db"
   database_id = "your-database-id-here"
   ```

3. 应用数据库迁移：
   ```bash
   wrangler d1 execute my-flower-pots-db --file=sql/schema.sql
   ```

## 4. 图片上传配置

### 4.1 开发环境

在开发环境中，图片上传API返回模拟的图片URL，无需额外配置。

### 4.2 生产环境

在生产环境中，建议配置R2存储桶来存储上传的图片：

1. 创建R2存储桶用于图片：
   ```bash
   wrangler r2 bucket create my-flower-pots-images
   ```

2. 在 `wrangler.toml` 中添加图片存储桶绑定：
   ```toml
   [[r2_buckets]]
   binding = "IMAGE_BUCKET"
   bucket_name = "my-flower-pots-images"
   ```

3. 更新 `src/api/upload.ts` 中的图片上传逻辑，取消注释R2上传代码。

## 5. 域名配置（可选）

### 5.1 自定义域名

如果你有自定义域名，可以将其绑定到Workers：

1. 在Cloudflare Dashboard中，进入Workers & Pages
2. 选择你的Worker
3. 点击"Triggers"标签
4. 添加自定义域名

### 5.2 CORS配置

确保CORS配置正确，允许你的前端域名访问API：

在 `src/index.ts` 中，CORS配置已经包含：
```typescript
// Handle CORS preflight requests
if (request.method === 'OPTIONS') {
  return corsResponse();
}
```

## 6. 配置架构说明

### 6.1 统一配置架构

为了简化部署和维护，系统采用了统一配置架构：

```
┌─────────────────────────────────────────────┐
│          frontend/js/config.js              │
│    （唯一需要修改的前端API配置位置）         │
└─────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────┐
│         frontend/js/api-client.js           │
│    （自动从config.js读取API配置）           │
└─────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────┐
│               所有HTML页面                   │
│    （通过api-client.js访问API）             │
└─────────────────────────────────────────────┘
```

### 6.2 环境检测逻辑

前端应用会自动检测环境并选择正确的API地址：

```javascript
// 环境检测逻辑
const isDevelopment = window.location.hostname === 'localhost' || 
                     window.location.hostname === '127.0.0.1';

// 根据环境选择API地址
const currentApiUrl = isDevelopment ? devUrl : prodUrl;
```

- **开发环境**：当访问 `localhost` 或 `127.0.0.1` 时，自动使用 `devUrl` (`http://127.0.0.1:8787`)
- **生产环境**：其他情况下，自动使用 `prodUrl` (你在配置中设置的生产环境URL)

### 6.3 配置验证

部署后，可以通过以下方式验证配置是否正确：

1. 打开浏览器开发者工具（F12）
2. 查看控制台输出，确认API地址是否正确
3. 通过浏览器控制台或开发者工具的 Network 面板验证 API 请求。

## 7. 验证部署

访问主应用并测试完整功能流（如登录、添加花盆、上传图片等）：

访问主应用测试所有功能：
```
https://your-frontend-domain.com/frontend/
```

## 8. 故障排除

### 8.1 CORS错误

如果遇到CORS错误，检查：
1. API的CORS响应头是否正确设置
2. 前端域名是否被允许
3. 预检请求（OPTIONS）是否正确处理

### 8.2 数据库连接错误

如果数据库连接失败，检查：
1. D1数据库绑定配置是否正确
2. 数据库迁移是否已应用
3. 数据库权限设置

### 8.3 图片上传失败

如果图片上传失败，检查：
1. R2存储桶配置是否正确
2. 文件大小和类型限制
3. 网络连接和权限

## 9. 安全建议

### 9.1 API密钥保护
- 不要将API密钥提交到版本控制系统
- 使用环境变量或密钥管理服务
- 定期轮换API密钥

### 9.2 输入验证
- 所有用户输入都应该验证和清理
- 文件上传应该限制类型和大小
- 使用参数化查询防止SQL注入

### 9.3 访问控制
- 实现适当的用户认证和授权
- 限制API访问频率
- 记录重要的操作日志

## 10. 性能优化

### 10.1 缓存策略
- 为静态资源设置适当的缓存头
- 使用CDN缓存API响应
- 实现客户端缓存

### 10.2 资源优化
- 压缩图片和静态资源
- 使用代码分割和懒加载
- 优化数据库查询

---

**注意**：部署到生产环境前，请确保：
1. 所有敏感信息（API密钥、数据库凭证等）都已正确配置
2. 进行了充分的安全测试
3. 备份了重要数据
4. 设置了监控和告警

如有问题，请参考项目中的其他文档：
- `DEPLOYMENT_GUIDE.md` - 详细部署指南
- `LOCAL_DEVELOPMENT_GUIDE.md` - 本地开发指南
- `README-API-MIGRATION.md` - API迁移说明
