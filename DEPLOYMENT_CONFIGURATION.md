# My Flower Pots 部署配置指南

本文档只记录当前仓库仍在使用的配置项和推荐做法。

## 1. 先准备本地文件

首次使用仓库时，先准备这三个本地文件：

- `wrangler.toml.example` -> `wrangler.toml`
- `.dev.vars.example` -> `.dev.vars`
- `frontend/js/config.js.example` -> `frontend/js/config.js`

其中：

- `wrangler.toml` 不提交仓库，用于本地 Cloudflare 绑定
- `.dev.vars` 用于本地开发环境变量
- `frontend/js/config.js` 用于前端 API 地址和功能开关

## 2. `wrangler.toml` 配置

当前推荐模板应包含这些关键段落：

```toml
name = "my-flower-pots-api"
main = "src/index.ts"
compatibility_date = "2025-01-01"
keep_vars = true

[dev]
port = 8787
ip = "127.0.0.1"
local_protocol = "http"

[assets]
directory = "./frontend"
binding = "ASSETS"
run_worker_first = true

[[d1_databases]]
binding = "DB"
database_name = "my-flower-pots-db"
database_id = "YOUR_D1_DATABASE_ID"

[[r2_buckets]]
binding = "STATIC_BUCKET"
bucket_name = "your-static-bucket-name"
```

### 每项的含义

- `[assets]`
  - 仅用于本地开发时直接读取 `frontend/`
  - 让 `wrangler dev` 不需要先手工上传静态文件
- `DB`
  - 业务主数据库
- `STATIC_BUCKET`
  - 生产前端静态资源
  - 用户上传图片
  - 客服邮件附件

### 重要说明

- 当前文档不再把 `KV Namespaces` 作为必配项
- `keep_vars = true` 表示生产环境变量优先由 Dashboard / Secrets 管理
- 文档里的图片上传说明也不再使用单独的 `IMAGE_BUCKET`

## 3. `.dev.vars` 与生产环境变量

### 本地开发推荐项

参考 `.dev.vars.example`：

```env
JWT_SECRET="replace-with-a-long-random-secret"
APP_BASE_URL="http://127.0.0.1:8787"
ADMIN_EMAILS="admin@example.com"
ADMIN_USER_IDS=""
WEATHER_API_KEY=""
RESEND_API_KEY=""
EMAIL_FROM="noreply@example.com"
SUPPORT_EMAIL_FROM="support@example.com"
SUPPORT_EMAIL_FROM_NAME="我的花盆客服"
DEV_ADMIN_ANY_EMAIL_USER="false"
DEV_ADMIN_EMAILS="admin@example.com"
DEV_ADMIN_USER_IDS=""
```

### 生产环境推荐放在 Dashboard / Secrets

#### 必填

- `JWT_SECRET`

#### 强烈建议填写

- `APP_BASE_URL`
- `ADMIN_EMAILS`
- `ADMIN_USER_IDS`

#### 按需填写

- `WEATHER_API_KEY`
- `RESEND_API_KEY`
- `EMAIL_FROM`
- `SUPPORT_EMAIL_FROM`
- `SUPPORT_EMAIL_FROM_NAME`

### 变量用途说明

- `JWT_SECRET`
  - Worker 认证的硬性前提
  - 如果为空或是明显默认值，服务会直接报错
- `APP_BASE_URL`
  - 邮箱验证、密码重置、分享链接、转移链接等回链地址
- `ADMIN_EMAILS` / `ADMIN_USER_IDS`
  - 正式环境管理员判定
- `DEV_ADMIN_*`
  - 只建议本地开发使用
- `RESEND_API_KEY`
  - 真实发送注册/重置邮件、客服回复邮件时需要

## 4. 前端 `frontend/js/config.js`

前端的 API 地址来自 `frontend/js/config.js`，当前重点看 `api` 段：

```javascript
api: {
  devUrl: 'http://127.0.0.1:8787',
  prodUrl: 'https://your-api-domain.workers.dev',
  timeout: 10000,
}
```

### 你需要改什么

- 本地开发一般不用改 `devUrl`
- 生产发布前，把 `prodUrl` 改成最终公开地址

### 什么时候必须重新上传前端

只要 `frontend/js/config.js` 改了，就需要重新执行：

```bash
npm run upload
```

因为这个文件本身属于生产静态资源的一部分。

## 5. D1 配置

### 创建数据库

```bash
wrangler d1 create my-flower-pots-db
```

把输出的 `database_id` 回填到 `wrangler.toml`。

### 初始化或更新结构

```bash
wrangler d1 execute my-flower-pots-db --remote --file=sql/schema.sql
```

当前推荐以 `sql/schema.sql` 为准，不再依赖历史迁移脚本说明。

## 6. R2 配置

### 创建或确认桶

```bash
wrangler r2 bucket create my-flower-pots
```

如果你已经有生产桶，只要保证：

- `wrangler.toml` 中 `bucket_name` 正确
- 上传脚本里的 `bucketName` 与之保持一致

### 当前用途

`STATIC_BUCKET` 现在承担：

1. 生产前端静态资源
2. 用户上传图片
3. 客服邮件附件

因此，文档里旧的“单独创建 `IMAGE_BUCKET` 再取消注释上传逻辑”的做法已经不适用了。

## 7. 推荐的发布命令

```bash
npm run build-css
npm run upload
npm run deploy
```

或一次完成：

```bash
npm run deploy-full
```

## 8. 常见配置错误

### `JWT_SECRET` 未配置

表现：

- 登录/鉴权接口报 500
- Worker 日志提示认证配置不安全

处理：

- 本地补 `.dev.vars`
- 生产环境用 `wrangler secret put JWT_SECRET`

### `prodUrl` 还是占位地址

表现：

- 页面能打开，但前端请求打到错误域名
- 登录、上传、分享都异常

处理：

- 更新 `frontend/js/config.js`
- 重新执行 `npm run upload`

### 静态页面 404

表现：

- Worker 已发布，但首页或 CSS/JS 404

处理：

- 检查 `STATIC_BUCKET` 绑定
- 检查是否执行过 `npm run upload`
- 检查上传桶和 Worker 绑定是不是同一个桶

### 上传图片失败

表现：

- 表单提交成功但图片回退到占位图

处理：

- 检查 `STATIC_BUCKET` 是否可写
- 检查上传域名、R2 权限和 Worker 绑定

## 9. 结论

当前仓库的配置重点只有三件事：

1. `wrangler.toml` 绑定正确
2. Dashboard / Secrets 里的环境变量正确
3. `frontend/js/config.js` 的 `prodUrl` 与最终公开地址一致
