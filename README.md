# My Flower Pots (我的花盆)

My Flower Pots 是一个从微信小程序迁移而来的全栈植物养护应用，当前运行在 Cloudflare Workers + Workers Assets + D1 + R2 上。

## 当前架构

- Worker 入口在 `src/index.ts`，统一处理 API、HTML 页面请求、页面访问统计、分享 Meta 注入和邮件入口。
- `wrangler.toml` 通过 `[assets]` 将 `frontend/` 绑定为 `ASSETS`，本地开发和生产环境都使用 Workers Assets 提供前端文件。
- API 请求和 HTML 页面请求通过 `run_worker_first` 先进入 Worker；CSS、JS、内置图片、`manifest.json` 和 `favicon.ico` 由 Workers Assets 直接服务。
- R2 `STATIC_BUCKET` 只用于运行时文件：用户上传图片和客服邮件附件。
- 前端是多页面 HTML + Vue 3 + Tailwind CSS，不是单一 SPA。

## 主要能力

- 花盆、养护记录、时间线、养护计划
- 匿名用户、邮箱注册登录、JWT 刷新、密码重置和邮箱验证
- 协作者、访客、批量邀请、所有权转移
- 公共分享、评论留言、消息中心
- 管理后台：植物库、用户管理、访问统计、客服收件箱

## 新电脑快速开始

需要 Node.js 22 LTS 或更高版本；建议与 GitHub Actions 一致使用 Node 22。拉取代码后执行：

```powershell
npm ci
npm run setup:local
npm run dev
```

`setup:local` 只在 `.dev.vars` 缺失时执行以下复制，已有文件会直接跳过，绝不会覆盖个人配置：

- `.dev.vars.example` -> `.dev.vars`

生成后可按需填写：

- `.dev.vars`：`JWT_SECRET`、`TURNSTILE_SECRET_KEY`、`APP_BASE_URL`、管理员邮箱等
- `frontend/js/config.js`：已随仓库维护，只包含生产域名、公开 Turnstile Site Key 和功能开关，不得写入 Secret

`wrangler.toml` 和 `frontend/js/config.js` 已纳入版本控制，保证本地开发与 Actions 部署使用同一套非敏感资源/浏览器配置，新电脑无需复制这两个文件。

## 常用命令

```bash
npm run setup:local
npm run dev
npm run build-css
npm run watch-css
npm run verify
npm run verify:full
npm run deploy
npm run backup-db
```

- `npm run setup:local`：安全补齐缺失的本地配置，不覆盖已有文件
- `npm run dev`：启动本地 Worker 开发环境，并通过 `[assets]` 直接读取 `frontend/`
- `npm run build-css`：重新生成 `frontend/css/tailwind-built.css`
- `npm run watch-css`：开发时监听 Tailwind 输入文件并持续生成 CSS
- `npm run verify`：发布前常规验证，执行 `check` 和 `test:smoke`
- `npm run verify:full`：发布前完整验证，覆盖 check、unit/worker、smoke 和 API 回归
- `npm run deploy`：构建 CSS 后部署 Worker；前端静态资源通过 Workers Assets 随部署发布
- `npm run backup-db`：运行 `scripts/backup-d1.js` 备份数据库

## 自动检查与发布

GitHub Actions 工作流位于 `.github/workflows/deploy.yml`：

- Pull Request 和任意分支 push：执行 `npm ci` 和 `npm run verify:full`，不发布。
- `main` 分支 push：完整验证通过后，依次记录 D1 Time Travel bookmark、执行远端 migrations、构建并部署 Worker。
- 生产部署串行执行，不会让两个 D1 migration/Worker 发布同时运行。

仓库管理员需要在 GitHub Actions Secrets 中配置：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Token 和应用密钥不能提交到仓库。详细权限、恢复和应急发布方式见[部署指南](./docs/DEPLOYMENT.md)。

Release 采用轻量策略：不是每次部署都创建 GitHub Release；生产可见的一组功能、权限/auth、分享、上传、后台、性能改动，或涉及 D1/R2/环境变量的变更，按 [部署指南](./docs/DEPLOYMENT.md) 的 release 流程打 CalVer tag 并记录 release notes。

## 仓库结构

- `frontend/`：多页面前端、共享 JS/CSS、图标和静态资源
- `src/`：Worker API、页面分发、邮件和工具函数
- `migrations/`：Wrangler D1 migrations，数据库结构以这里为准
- `sql/plants_data.sql`：植物百科数据导入脚本
- `scripts/`：备份、植物数据生成和迁移脚本

## 前端结构

`frontend/` 下的页面按职责拆成多个 HTML 文件：

- 用户页：`index.html`、`pot-detail.html`、`add-pot.html`、`edit-pot.html`、`care-record.html`、`all-records.html`、`all-timelines.html`、`profile.html`、`reset-password.html`
- 管理页：`admin-plants.html`、`admin-stats.html`、`admin-inbox.html`
- 共享脚本：`api-client.js`、`router.js`、`media-utils.js`、`form-utils.js`、`date-utils.js`、`pot-permissions.js`、`care-utils.js`、`archive-utils.js`、`gallery-utils.js`、`cover-utils.js`、`timeline-utils.js`、`ui-utils.js`、`dialog-utils.js`、`batch-actions-utils.js`、`clipboard.js`
- 样式入口：`frontend/css/tailwind-input.css`，构建产物：`frontend/css/tailwind-built.css`

## API 结构

`src/index.ts` 负责 API 分发，主要模块在 `src/api/`：

- `auth.ts`：匿名识别、注册登录、邮箱验证、密码重置、令牌刷新、资料和密码修改
- `pots.ts`、`care-records.ts`、`care-schedules.ts`、`timelines.ts`：花盆、养护记录、养护计划和时间线
- `plants.ts`、`upload.ts`、`weather.ts`、`care-advice.ts`：植物资料、图片上传、天气和养护建议
- `share.ts`、`collaborators.ts`、`viewers.ts`、`batch-invites.ts`、`transfer.ts`：分享、协作、访客、批量邀请和所有权转移
- `messages.ts`：系统消息和花盆留言
- `admin.ts`、`analytics.ts`、`support.ts`：管理后台、访问统计和客服收件箱

数据存储职责：

- D1：用户、花盆、养护记录、时间线、养护计划、协作关系、消息、访问统计、客服邮件与回复记录
- R2 `STATIC_BUCKET`：用户上传图片、客服邮件附件
- Workers Assets：前端页面、CSS、JS、内置图片和 PWA 资源

## 更多文档

- [部署指南](./docs/DEPLOYMENT.md)
- [消息中心与通知规则](./docs/message-center.md)
