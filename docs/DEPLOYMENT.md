# My Flower Pots 部署指南

这份文档合并了部署流程和配置说明，面向当前仓库的真实发布方式：

- Worker 负责 API、HTML 页面请求、访问统计、分享 Meta 注入和邮件入口
- 前端 HTML、CSS、JS、内置图片和 PWA 资源通过 Workers Assets 发布
- R2 `STATIC_BUCKET` 只用于用户上传图片和客服邮件附件

## 1. 前置条件

- Node.js 18+
- Cloudflare 账号
- Wrangler CLI 登录态

安装依赖并登录：

```bash
npm install
npx wrangler login
```

## 2. 准备本地配置

复制三个模板文件：

- `wrangler.toml.example` -> `wrangler.toml`
- `.dev.vars.example` -> `.dev.vars`
- `frontend/js/config.js.example` -> `frontend/js/config.js`

关键配置：

- `wrangler.toml`
  - `DB`：D1 数据库绑定
  - `ASSETS`：Workers Assets 绑定，目录为 `./frontend`
  - `STATIC_BUCKET`：R2 绑定，用于用户上传图片和客服邮件附件
  - `run_worker_first`：API 和 HTML 页面请求先进入 Worker，用于路由、访问统计和分享 Meta 注入
- `.dev.vars`
  - 本地至少配置 `JWT_SECRET`
  - 推荐配置 `APP_BASE_URL`、`ADMIN_EMAILS` 或 `ADMIN_USER_IDS`
- `frontend/js/config.js`
  - 本地开发通常保留 `devUrl`
  - 生产发布前把 `prodUrl` 改成最终公开地址

完整配置模板以 `wrangler.toml.example`、`.dev.vars.example` 和 `frontend/js/config.js.example` 为准。新增 HTML 页面时，需要同步检查 `run_worker_first` 是否覆盖该页面路径。

## 3. 创建 Cloudflare 资源

创建 D1 数据库：

```bash
wrangler d1 create my-flower-pots
```

把返回的 `database_id` 写回 `wrangler.toml`。

创建 R2 存储桶：

```bash
wrangler r2 bucket create my-flower-pots
```

这个桶用于用户上传图片和客服邮件附件。

## 4. 环境变量

本地开发变量放在 `.dev.vars`。

生产环境建议通过 Cloudflare Dashboard 或 Wrangler Secrets 管理：

- 必填：`JWT_SECRET`、`TURNSTILE_SECRET_KEY`
- 强烈建议：`APP_BASE_URL`、`ADMIN_EMAILS`、`ADMIN_USER_IDS`
- 按需：`WEATHER_API_KEY`、`RESEND_API_KEY`、`EMAIL_FROM`、`SUPPORT_EMAIL_FROM`、`SUPPORT_EMAIL_FROM_NAME`

示例：

```bash
wrangler secret put JWT_SECRET
wrangler secret put TURNSTILE_SECRET_KEY
```

说明：

- `JWT_SECRET` 为空或使用明显默认值时，认证相关接口会直接报错
- `TURNSTILE_SECRET_KEY` 用于注册、匿名升级和找回密码的人机验证；生产缺失时这些入口会拒绝提交
- `APP_BASE_URL` 用于邮箱验证、密码重置、分享链接和转移链接等回链地址
- `DEV_ADMIN_*` 只建议本地开发使用
- `RESEND_API_KEY` 用于真实发送注册、重置和客服回复邮件

## 5. 初始化或更新数据库

数据库结构以 `migrations/` 为准：

```bash
wrangler d1 migrations apply my-flower-pots --remote
```

如果只是本地联调，可以先跳过远程迁移，正式发布前再执行。

## 6. 本地开发验证

启动开发环境：

```bash
npm run dev
```

如果修改了 Tailwind 输入文件，重新生成 CSS：

```bash
npm run build-css
```

开发时持续监听 Tailwind：

```bash
npm run watch-css
```

本地至少检查：

- 首页是否能打开
- 登录和匿名识别是否正常
- 新增、编辑花盆是否正常
- 分享详情页是否正常
- 管理页是否能进入

## 7. 首次发布顺序

推荐顺序：

1. `npm install`
2. 配好 `wrangler.toml`
3. 创建 D1 和 R2
4. `wrangler d1 migrations apply my-flower-pots --remote`
5. 配置生产环境 `JWT_SECRET` 和 `TURNSTILE_SECRET_KEY`
6. 确认最终公开地址
7. 更新 `frontend/js/config.js` 的 `prodUrl`
8. 配置生产环境 `APP_BASE_URL`
9. `npm run deploy`

如果先使用 Workers 默认域名，可以先执行一次 `npm run deploy` 拿到公开地址，再回填 `prodUrl` 和 `APP_BASE_URL` 后重新部署。

## 8. 发布

当前推荐发布命令：

```bash
npm run deploy
```

它会：

1. 重新生成 `frontend/css/tailwind-built.css`
2. 执行 `wrangler deploy`
3. 通过 Workers Assets 发布 `frontend/` 中的前端文件

## 9. 上线后验证

建议至少检查：

- 首页、CSS、JS、图标和内置图片是否正常加载
- 注册、登录和刷新令牌是否正常
- 花盆图片上传是否正常
- 分享页是否能打开并注入正确 Meta
- 管理员页面是否正常
- 客服收件箱与附件下载是否正常

可以手动验证接口可达性：

```bash
curl https://your-domain.example/api/auth/me
```

未登录时返回未授权是正常的，重点是接口可达且不是 404。

## 10. 常见问题

### 静态页面或资源 404

检查：

- `wrangler.toml` 是否包含 `[assets] directory = "./frontend"` 和 `binding = "ASSETS"`
- `run_worker_first` 是否覆盖 API 和 HTML 页面路径
- 是否执行过 `npm run deploy`
- 生产域名是否指向最新 Worker

### API 地址错误

通常是 `frontend/js/config.js` 的 `prodUrl` 仍是占位地址，或者修改后没有重新部署。

处理：

```bash
npm run deploy
```

### 登录或鉴权接口报错

检查：

- 本地 `.dev.vars` 是否配置 `JWT_SECRET`
- 生产环境是否配置 `JWT_SECRET`
- `JWT_SECRET` 是否仍是示例值或明显默认值

### 图片上传失败或回退到占位图

检查：

- `wrangler.toml` 中的 `STATIC_BUCKET` R2 绑定
- 生产环境 Worker 是否有对应 R2 权限
- 上传域名和图片访问域名是否配置正确

### 邮件相关功能不工作

检查生产环境变量：

- `RESEND_API_KEY`
- `EMAIL_FROM`
- `SUPPORT_EMAIL_FROM`
- `SUPPORT_EMAIL_FROM_NAME`

## 11. 维护建议

- 前端或 Worker 逻辑改动后执行 `npm run deploy`
- 数据库结构改动统一通过 `migrations/` 维护，并使用 `wrangler d1 migrations apply` 应用
- 重要数据定期使用 `scripts/backup-d1.js` 备份
