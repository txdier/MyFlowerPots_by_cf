# My Flower Pots (我的花盆) 🌱

My Flower Pots 是一个从微信小程序迁移而来的全栈植物养护应用，当前运行在 Cloudflare Workers + D1 + R2 上。

## 当前架构

- Worker 入口在 `src/index.ts`，统一处理 API、页面请求和邮件入口。
- 本地开发通过 `wrangler.toml` 的 `[assets]` 直接服务 `frontend/`。
- 生产环境把 `frontend/` 同步到 R2 `STATIC_BUCKET`，Worker 再从 R2 返回页面与静态资源。
- `STATIC_BUCKET` 也用于用户图片上传、分享资源和客服附件存储。
- 前端采用多页面 HTML + Vue 3 + Tailwind CSS，不是单一 SPA。

## 主要能力

- 花盆、养护记录、时间线、养护计划
- 匿名用户 + 邮箱注册登录 + JWT 刷新
- 协作者、访客、批量邀请、所有权转移
- 公共分享、评论留言、消息中心
- 管理后台：植物库、统计页、客服收件箱

## 推荐的本地准备

1. 安装依赖：`npm install`
2. 复制本地配置文件：
   - `wrangler.toml.example` -> `wrangler.toml`
   - `.dev.vars.example` -> `.dev.vars`
   - `frontend/js/config.js.example` -> `frontend/js/config.js`
3. 填写关键配置：
   - `wrangler.toml`：D1 数据库 ID、R2 存储桶名称
   - `.dev.vars`：`JWT_SECRET`、`APP_BASE_URL`、管理员邮箱等
   - `frontend/js/config.js`：生产环境 `prodUrl`

## 开发与部署

```bash
npm run dev
npm run build-css
npm run upload
npm run deploy
npm run deploy-full
```

- `npm run dev`：启动本地 Worker 开发环境，并通过 `[assets]` 直接读取 `frontend/`
- `npm run build-css`：重新生成 `frontend/css/tailwind-built.css`
- `npm run upload`：构建 CSS 后，使用 `upload-static-wrangler.js` 增量同步前端文件到 R2
- `npm run deploy`：仅部署 Worker
- `npm run deploy-full`：上传前端文件后再部署 Worker

## 仓库目录

- `frontend/`：多页面前端、共享 JS/CSS、图标和静态资源
- `src/`：Worker API、页面分发、邮件和工具函数
- `migrations/`：Wrangler D1 migrations，数据库结构以这里为准
- `sql/plants_data.sql`：植物百科数据导入脚本
- `scripts/backup-d1.js`：数据库备份脚本
- `upload-static-wrangler.js`：推荐使用的静态资源增量上传脚本

## 文档

- [部署总指南](./DEPLOYMENT_GUIDE.md)
- [部署配置指南](./DEPLOYMENT_CONFIGURATION.md)
- [上传脚本说明](./README-UPLOAD-WRANGLER.md)
- [前端迁移说明](./README-FRONTEND-MIGRATION.md)
- [API 迁移说明](./README-API-MIGRATION.md)

---

**🌱 让每一株植物都被精心照料。**
