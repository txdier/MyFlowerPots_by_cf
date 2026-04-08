# My Flower Pots 前端迁移说明

## 当前状态

前端已经完成从微信小程序到 Web 多页面应用的迁移，当前形态是：

- 多个独立 HTML 页面
- 共享一套 `api-client.js` / `app.js` / `router.js`
- 本地引入 Vue 3 运行时
- Tailwind CSS + 自定义样式
- 通过 Worker 在本地开发和生产环境统一提供页面

这份文档描述的是**当前仍在维护的前端结构**，不再保留旧的 SPA/测试脚本说明。

## 运行方式

### 本地开发

- `wrangler dev` 通过 `[assets]` 直接读取 `frontend/`
- 页面与 API 由同一个 Worker 提供
- `frontend/js/config.js` 中的 `devUrl` 默认为 `http://127.0.0.1:8787`

### 生产环境

- 先把 `frontend/` 同步到 R2 `STATIC_BUCKET`
- Worker 再从 R2 返回 HTML、CSS、JS、图片等静态资源
- `pot-detail.html` 的分享页还会在服务端注入动态 Meta 信息

## 当前目录结构

```text
frontend/
├── add-pot.html
├── admin-inbox.html
├── admin-plants.html
├── admin-stats.html
├── all-records.html
├── all-timelines.html
├── care-record.html
├── edit-pot.html
├── index.html
├── pot-detail.html
├── profile.html
├── reset-password.html
├── manifest.json
├── favicon.ico
├── assets/
├── css/
│   ├── app.css
│   ├── icons.css
│   ├── tailwind-built.css
│   └── tailwind-input.css
└── js/
    ├── api-client.js
    ├── app.js
    ├── clipboard.js
    ├── config.js.example
    ├── router.js
    ├── Sortable.min.js
    ├── tailwindcss.js
    ├── vue.global.js
    └── vue.global.prod.js
```

## 页面清单

### 用户页

- `index.html`：花盆列表、排序、批量邀请、消息入口
- `pot-detail.html`：花盆详情、分享、协作者、访客、留言、二维码
- `add-pot.html`：新增花盆
- `edit-pot.html`：编辑花盆
- `care-record.html`：添加养护记录
- `all-records.html`：查看全部养护记录
- `all-timelines.html`：查看全部时间线记录
- `profile.html`：账号信息、密码、支持入口
- `reset-password.html`：密码重置

### 管理页

- `admin-plants.html`：植物资料库管理
- `admin-stats.html`：后台统计
- `admin-inbox.html`：客服收件箱与回复

## 当前前端架构

### 1. 页面形态

项目是 **MPA（多页面应用）**，不是单一 SPA。

- 页面之间通过 `router.js` 或普通链接跳转
- 每个页面各自挂载 Vue 实例
- 共享的认证、请求、错误处理逻辑在公共脚本中维护

### 2. 共享运行时

- `frontend/js/api-client.js`
  - 统一封装 API 请求
  - 管理 JWT、401 重试、刷新令牌
  - 封装分享、协作、访客、消息、上传等接口
- `frontend/js/app.js`
  - 管理全局启动逻辑
  - 处理登录状态恢复与令牌刷新
- `frontend/js/router.js`
  - 提供页面跳转辅助函数
- `frontend/js/clipboard.js`
  - 处理复制分享链接等交互
- `frontend/js/Sortable.min.js`
  - 支持花盆排序

### 3. 配置来源

- `frontend/js/config.js.example` 是模板
- 实际运行使用本地未提交的 `frontend/js/config.js`
- `api-client.js` 从 `window.APP_CONFIG` 读取 `devUrl` / `prodUrl`

## 认证与状态管理

当前前端状态管理的关键点：

- 认证信息保存在 `sessionStorage`
- `api-client.js` 会自动迁移旧的 `localStorage` 令牌
- 请求前会检查 JWT 是否即将过期
- 401 时会尝试调用 `/api/auth/refresh`
- 刷新失败后会清理认证并触发全局登录过期事件

## 样式与资源

- Tailwind 源文件：`frontend/css/tailwind-input.css`
- 构建产物：`frontend/css/tailwind-built.css`
- 自定义样式：`frontend/css/app.css`
- 图标样式：`frontend/css/icons.css`
- PWA/分享辅助资源：`manifest.json`、`favicon.ico`

重新生成样式使用：

```bash
npm run build-css
```

## 本地开发流程

1. 准备 `frontend/js/config.js`
2. 准备 `.dev.vars`
3. 启动：

```bash
npm run dev
```

4. 如改动了 Tailwind 输入文件，再执行：

```bash
npm run build-css
```

## 生产发布流程

推荐顺序：

```bash
npm run upload
npm run deploy
```

或者直接：

```bash
npm run deploy-full
```

其中：

- `npm run upload` 会先构建 CSS，再把 `frontend/` 增量上传到 R2
- `npm run deploy` 只发布 Worker 逻辑

## 继续扩展前端时的建议

### 新增页面

1. 在 `frontend/` 下新增 HTML 文件
2. 引入共享的 CSS 和 JS
3. 复用 `api-client.js` 而不是自行写请求层
4. 如果页面需要登录态，复用现有认证检查逻辑

### 修改分享或协作功能

优先确认这些页面和脚本是否需要同时调整：

- `frontend/pot-detail.html`
- `frontend/index.html`
- `frontend/js/api-client.js`
- `src/api/share.ts`
- `src/api/collaborators.ts`
- `src/api/viewers.ts`
- `src/api/batch-invites.ts`

## 文档说明

这份文档现在只记录仓库中实际存在的页面、脚本和发布方式。

以下旧说法已经不再使用：

- “前端是单页应用（SPA）”
- “通过 `npm run test-api` / `test-db` / `test-new` 验证前端迁移”
- “前端结构里只有 11 个页面”
