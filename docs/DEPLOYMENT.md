# My Flower Pots 部署指南

这份文档合并了部署流程和配置说明，面向当前仓库的真实发布方式：

- Worker 负责 API、HTML 页面请求、访问统计、分享 Meta 注入和邮件入口
- 前端 HTML、CSS、JS、内置图片和 PWA 资源通过 Workers Assets 发布
- R2 `STATIC_BUCKET` 只用于用户上传图片和客服邮件附件

## 1. 前置条件

- Node.js 20.19.0+
- Cloudflare 账号
- 本地手动部署时需要 Wrangler CLI 登录态

本地需要手动操作生产资源时登录：

```bash
npx wrangler login
```

## 2. 准备本地配置

新电脑拉取代码后执行：

```powershell
npm ci
npm run setup:local
npm run dev
```

`setup:local` 会在缺失时复制：

- `.dev.vars.example` -> `.dev.vars`

目标文件已存在时会跳过，不覆盖已有配置。`wrangler.toml` 和 `frontend/js/config.js` 已纳入版本控制，分别维护非敏感的 Cloudflare 资源标识与公开浏览器配置，新电脑不再复制这两个文件。

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
  - 本地开发使用 `devUrl`
  - 生产 API 使用同域相对路径，公开站点地址为 `https://app.kaside365.com`
  - Turnstile Site Key 是公开浏览器标识；Secret Key 只能放 Cloudflare Secret

本地私密配置模板以 `.dev.vars.example` 为准。`wrangler.toml.example` 和 `frontend/js/config.js.example` 仅用于首次创建另一套 Cloudflare/前端公共配置时参考。新增 HTML 页面时，需要同步检查 `run_worker_first` 是否覆盖该页面路径。

## 3. 创建 Cloudflare 资源

创建 D1 数据库：

```bash
wrangler d1 create my-flower-pots
```

当前生产数据库 ID 已写入受版本控制的 `wrangler.toml`。只有明确更换 Cloudflare 资源时才更新它，并通过代码评审确认。

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

## 5. GitHub Actions 配置

在 GitHub 仓库的 Actions Secrets 中配置：

- `CLOUDFLARE_API_TOKEN`：Cloudflare 自定义 API Token。
- `CLOUDFLARE_ACCOUNT_ID`：目标 Cloudflare Account ID。

Token 必须限制到当前账号，并只授予以下任务实际需要的权限：

- 编辑并部署目标 Worker。
- 读取目标 D1 状态和 Time Travel bookmark。
- 应用目标 D1 migrations。
- 访问 Worker 配置中声明的部署资源。

不要把 Token 写入 `wrangler.toml`、`.dev.vars.example`、README、Action 输出或构建产物。生产 Secrets 只传给 `deploy` Job，Pull Request 验证不会获得它们。

## 6. D1 migration 与恢复

数据库结构以 `migrations/` 为准：

```bash
wrangler d1 migrations apply my-flower-pots --remote
```

`main` 分支自动发布时会按以下顺序执行：

1. `npm run verify:full`
2. `wrangler d1 time-travel info my-flower-pots`
3. `wrangler d1 migrations apply my-flower-pots --remote`
4. `npm run deploy`

Migration 失败时不会部署新 Worker。Migration 已成功但部署失败时，旧 Worker 仍可能面对新 schema，因此 migration 必须优先采用向后兼容的新增表、列和索引；删除、重命名或不可逆数据变更应拆分成渐进发布。

失败 Job 的日志和 Summary 会保留迁移前 bookmark。优先通过补丁 migration 或重新部署恢复；只有确认需要覆盖生产数据时，才人工执行：

```bash
wrangler d1 time-travel restore my-flower-pots --bookmark=<bookmark>
```

Time Travel restore 会覆盖生产数据库，工作流不会自动执行该命令。项目也不会把生产 SQL 上传到 GitHub Artifacts。

## 7. 本地开发验证

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

## 8. 首次启用自动发布

推荐顺序：

1. 确认 `wrangler.toml` 中的 Worker、D1、R2 和 Analytics 资源属于目标账号。
2. 在 Cloudflare 配置生产环境 `JWT_SECRET`、`TURNSTILE_SECRET_KEY` 和其他运行时变量。
3. 在 GitHub 配置 `CLOUDFLARE_API_TOKEN` 和 `CLOUDFLARE_ACCOUNT_ID`。
4. 在非 `main` 分支推送一次，确认只执行 Verify Job。
5. 通过 Pull Request 合入 `main`，确认 Verify 成功后再执行生产 Deploy Job。
6. 检查 Action Summary 中的 D1 bookmark、migration 和 Worker deploy 顺序。
7. 完成上线 smoke 检查。

如果更换公开域名，应通过代码评审更新 `frontend/js/config.js` 的公开地址，并同步修改 Cloudflare 中的 `APP_BASE_URL`。

## 9. 发布

正常发布方式是把已评审代码合入 `main`，由 `.github/workflows/deploy.yml` 自动执行完整验证、D1 migration 和 Worker 部署。其他分支和 Pull Request 只验证，不发布。

`workflow_dispatch` 可用于在 GitHub 手动重跑，但只有选择 `main` ref 时才允许执行生产 Deploy Job。生产 Job 使用 concurrency 串行化，新提交不会在 migration 或 deploy 中途取消正在运行的发布。

本地手动命令只作为 GitHub Actions 故障时的应急入口：

```bash
npm run deploy
```

它会：

1. 重新生成 `frontend/css/tailwind-built.css`
2. 执行 `wrangler deploy`
3. 通过 Workers Assets 发布 `frontend/` 中的前端文件

手动应急发布前仍需先记录 D1 bookmark、应用 migrations，并确保本地 checkout 正是准备发布的 commit。

### 9.1 轻量 release 规则

这个项目的 release 只代表“已经成功部署到生产的代码快照”，用于标记线上版本、辅助回滚定位、记录数据库和配置变更；它不是 npm 包版本，也不要求每次部署都创建 GitHub Release。

- 普通小修复：提交并部署即可，不单独做 release。
- 生产可见的一组功能、权限/auth、分享、上传、后台或性能改动：做 release。
- 涉及 D1 migration、数据修复、删除/归档、R2 文件处理或环境变量变更：必须做 release，并在 release notes 写清楚。
- tag 使用 CalVer：`v2026.05.15`；同一天多次发布使用 `v2026.05.15.2`。
- 暂不跟随修改 `package.json` 的 `version`，除非以后需要在页面或 API 暴露应用版本。

### 9.2 发布前确认范围

如果已经有历史 tag：

```bash
git status --short
git log <last-tag>..HEAD --oneline
git diff --name-only <last-tag>..HEAD
```

如果还没有任何 tag，第一次 release 直接以当前准备发布的提交作为基线，从下一次 release 开始再对比上一个 tag。

### 9.3 发布前验证

- 常规 release：执行 `npm run verify`。
- 涉及 API、auth、权限、D1、R2、公共分享或较大改动：执行 `npm run verify:full`。
- 涉及数据库结构或生产数据：确认 Action 已记录 migration 前 Time Travel bookmark，并在 release notes 标明 migration 文件和恢复方式。

### 9.4 部署、线上 smoke 与 tag

推荐顺序：

1. Pull Request 完成评审并通过 Verify Job。
2. 合入 `main`，等待自动记录 D1 bookmark、应用 migration 并部署 Worker。
3. 确认 GitHub Actions Deploy Job 成功。
4. 线上检查首页、登录/刷新令牌、花盆详情、图片上传、公开分享、管理后台。
5. 确认 `/api/auth/me` 可达；未登录返回未授权是正常的，不能是 404。
6. 部署成功后打 tag 并推送：

```bash
git tag -a v2026.05.15 -m "发布 v2026.05.15"
git push origin v2026.05.15
```

7. 在 GitHub 创建 Release，notes 使用中文，记录发布摘要、用户可见变化、数据库/配置变化、验证命令、线上 smoke 结果和回滚说明。

### 9.5 Release notes 模板

```md
## 发布摘要
- 待填写

## 主要变化
- 待填写

## 数据库 / 配置
- D1 migration：无 / 有，文件：
- 环境变量：无 / 有：
- R2/上传影响：无 / 有：

## 验证
- npm run verify / npm run verify:full
- npm run deploy
- 线上 smoke：

## 回滚说明
- Worker 可回到上一 tag 对应代码重新部署。
- D1 变更不依赖 Git tag 回滚，必要时使用 migration 前 bookmark 或写 forward fix。
```

## 10. 上线后验证

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

## 11. 常见问题

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

## 12. 维护建议

- 前端或 Worker 逻辑改动通过 Pull Request 合入 `main` 后由 GitHub Actions 自动发布
- 数据库结构改动统一通过 `migrations/` 维护，并由 GitHub Actions 在部署前应用
- 重要数据定期使用 `scripts/backup-d1.js` 备份
