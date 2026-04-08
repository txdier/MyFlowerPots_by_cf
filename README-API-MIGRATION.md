# My Flower Pots API 迁移说明

## 当前状态

后端已经迁移为 Cloudflare Workers + D1 + R2 的结构，Worker 同时负责：

- API 路由分发
- 本地与生产页面请求处理
- 分享页动态 Meta 注入
- Email Routing 收件处理
- 客服附件写入 R2

这份文档描述的是**当前仍在维护的 API 结构**，不再沿用旧的 KV、旧测试脚本或过时路由列表。

## 运行时与绑定

当前仓库实际使用的核心绑定：

- `DB`：Cloudflare D1
- `STATIC_BUCKET`：Cloudflare R2
- `ASSETS`：仅本地开发时由 `[assets]` 绑定到 `frontend/`

说明：

- 生产环境里，Worker 从 `STATIC_BUCKET` 返回静态页面
- 用户图片上传也写入 `STATIC_BUCKET`
- 客服邮件附件也写入 `STATIC_BUCKET`
- 当前文档不再把 KV Namespaces 作为运行时前提

## 入口结构

```text
src/
├── index.ts
├── api/
│   ├── admin.ts
│   ├── analytics.ts
│   ├── auth.ts
│   ├── batch-invites.ts
│   ├── care-advice.ts
│   ├── care-records.ts
│   ├── care-schedules.ts
│   ├── collaborators.ts
│   ├── messages.ts
│   ├── plants.ts
│   ├── pots.ts
│   ├── share.ts
│   ├── support.ts
│   ├── timelines.ts
│   ├── transfer.ts
│   ├── upload.ts
│   ├── viewers.ts
│   └── weather.ts
├── static/
│   └── server.ts
└── utils/
    ├── auth-utils.ts
    ├── email-parser.ts
    ├── email-service.ts
    ├── response-utils.ts
    └── storage-utils.ts
```

## 当前功能模块

### 认证与账户

`src/api/auth.ts` 负责：

- 匿名识别：`POST /api/auth/identify`
- 注册：`POST /api/auth/register`
- 登录：`POST /api/auth/login`
- 忘记密码：`POST /api/auth/forgot-password`
- 重置密码：`POST /api/auth/reset-password`
- 匿名账号升级：`POST /api/auth/upgrade`
- 邮箱验证：`GET /api/auth/verify-email`
- 当前用户：`GET /api/auth/me`
- 更新资料：`PUT /api/auth/profile`
- 修改密码：`PUT /api/auth/password`
- 刷新令牌：`POST /api/auth/refresh`

### 花盆与养护

- `src/api/pots.ts`
  - 花盆列表、详情、创建、更新、删除
  - 花盆排序：`PUT /api/pots/reorder`
  - 花盆统计：`GET /api/pots/:id/stats`
- `src/api/care-records.ts`
  - 养护记录读写
- `src/api/timelines.ts`
  - 时间线读写
- `src/api/care-schedules.ts`
  - 养护计划
  - 今日提醒：`GET /api/care-schedules/reminders`

### 植物资料与辅助能力

- `src/api/plants.ts`
  - 搜索：`GET /api/plants/search`
  - 详情：`GET /api/plants/:id`
  - 智能匹配：`POST /api/plants/smart-match`
- `src/api/upload.ts`
  - 图片上传：`POST /api/upload/image`
- `src/api/weather.ts`
  - 天气接口：`GET /api/weather`
- `src/api/care-advice.ts`
  - 养护建议：`POST /api/care-advice`

### 分享、协作与访问权限

- `src/api/share.ts`
  - 公开分享启用/关闭
  - 分享详情：`GET /api/public/pots/:token`
  - 分享评论弹幕开关
- `src/api/collaborators.ts`
  - 协作者列表、添加、移除
  - 协作者邀请打开与接受
- `src/api/viewers.ts`
  - 访客列表、添加、移除、退出
  - 访客邀请打开与接受
- `src/api/batch-invites.ts`
  - 批量邀请创建、打开、接受
- `src/api/transfer.ts`
  - 所有权转移发起、取消、接受、拒绝
  - 公开转移详情：`GET /api/public/transfer/:token`

### 消息与留言

`src/api/messages.ts` 负责两类能力：

- 系统消息中心
  - `GET /api/messages`
  - `GET /api/messages/unread-count`
  - `POST /api/messages/:id/read`
  - `POST /api/messages/read-all`
  - `POST /api/messages/clear-read`
  - `DELETE /api/messages/:id`
- 花盆留言流
  - `GET /api/messages/pot-comments/:potId`
  - `POST /api/messages/pot-comment`
  - `POST /api/messages/pot-comment-reply`
  - `DELETE /api/messages/pot-comment/:id`

### 管理后台与客服

- `src/api/admin.ts`
  - 管理员校验
  - 植物库管理
  - 用户管理
  - 统计相关接口
- `src/api/support.ts`
  - `GET /api/admin/support/emails`
  - `GET /api/admin/support/emails/:id`
  - `GET /api/admin/support/emails/:id/attachments/:filename`
  - `POST /api/admin/support/emails/:id/reply`
  - `PATCH /api/admin/support/emails/:id/read`
  - `DELETE /api/admin/support/emails/:id`

## 存储职责

### D1

负责业务主数据：

- 用户
- 花盆
- 养护记录与时间线
- 养护计划
- 协作者与访客关系
- 消息与评论
- 客服邮件与回复记录

### R2 `STATIC_BUCKET`

当前实际承担三类文件：

1. 生产环境前端静态资源
2. 用户上传图片
3. 客服邮件附件

## 认证与安全

当前代码中的关键点：

- JWT 使用 HMAC-SHA256 签名
- 前端依赖 `/api/auth/refresh` 续签
- 密码新格式采用 PBKDF2-SHA256
- 仍兼容旧的 SHA-256 历史密码哈希做校验
- `JWT_SECRET` 会拦截明显不安全的默认值

## 页面与静态资源处理

`src/static/server.ts` 当前负责：

- 默认页映射
- 生产环境从 R2 返回 HTML / CSS / JS / 图片
- 分享场景下对 `pot-detail.html` 注入动态 Meta 标签
- 本地开发缺少 `ASSETS` 绑定时的兜底静态服务

## 部署与开发

当前文档只保留仍然可用的流程：

```bash
npm run dev
npm run upload
npm run deploy
npm run deploy-full
```

不再把下面这些写成推荐步骤：

- `npm run migrate`
- `npm run verify`
- `npm run test-api`
- `npm run test-db`
- `npm run test-new`

这些命令在当前仓库里不是 API 迁移文档的有效依赖。

## 说明

这份文档现在与以下文件保持一致：

- `src/index.ts`
- `src/api/*.ts`
- `src/static/server.ts`
- `frontend/js/api-client.js`
- `wrangler.toml`

如果后续新增 API 模块，优先同步更新这里，而不是继续沿用旧迁移记录。
