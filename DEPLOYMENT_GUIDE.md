# My Flower Pots 部署总指南

这份指南面向当前仓库的真实发布流程，默认目标是：

- Worker 负责 API 和页面请求
- 前端静态文件上传到 R2 `STATIC_BUCKET`
- 本地开发通过 `[assets]` 直接读取 `frontend/`

## 1. 前置条件

你需要先准备：

- Node.js 18+
- Cloudflare 账号
- Wrangler CLI 登录态

安装与登录：

```bash
npm install
npx wrangler login
```

## 2. 准备本地配置

复制三个模板文件：

- `wrangler.toml.example` -> `wrangler.toml`
- `.dev.vars.example` -> `.dev.vars`
- `frontend/js/config.js.example` -> `frontend/js/config.js`

然后至少完成这些修改：

- `wrangler.toml`
  - 填 `database_id`
  - 填 `bucket_name`
- `.dev.vars`
  - 填 `JWT_SECRET`
- `frontend/js/config.js`
  - 先保留本地 `devUrl`
  - 最终上线前填好 `prodUrl`

## 3. 创建或确认 Cloudflare 资源

### D1 数据库

如果还没有数据库：

```bash
wrangler d1 create my-flower-pots
```

把返回的 `database_id` 写回 `wrangler.toml`。

### R2 存储桶

如果还没有生产桶：

```bash
wrangler r2 bucket create my-flower-pots
```

如果已经有桶，只要保证：

- `wrangler.toml` 里的 `bucket_name` 正确
- `upload-static-wrangler.js` 中的 `bucketName` 与之一致

## 4. 初始化生产数据库

数据库结构统一通过 Wrangler migrations 初始化和更新：

```bash
wrangler d1 migrations apply my-flower-pots --remote
```

如果你只是先做本地联调，也可以先跳过这一步，等正式发布前再执行。

## 5. 本地开发验证

启动开发环境：

```bash
npm run dev
```

如果修改了 Tailwind 输入文件，再执行：

```bash
npm run build-css
```

本地验证重点：

- 首页是否能打开
- 登录/匿名识别是否正常
- 新增/编辑花盆是否正常
- 分享详情页是否正常
- 管理页是否能进入

## 6. 确定生产公开地址

前端 `prodUrl` 和后端 `APP_BASE_URL` 都需要知道最终公开地址。

### 如果你已经有自定义域名

直接把它填到：

- `frontend/js/config.js` -> `prodUrl`
- 生产环境变量 -> `APP_BASE_URL`

### 如果你先用 Workers 默认域名

先执行一次：

```bash
npm run deploy
```

拿到 Worker 的公开地址后，再回填：

- `frontend/js/config.js` -> `prodUrl`
- 生产环境变量 -> `APP_BASE_URL`

然后重新上传静态文件。

## 7. 上传前端静态文件

推荐命令：

```bash
npm run upload
```

它会：

1. 重新生成 `frontend/css/tailwind-built.css`
2. 调用 `upload-static-wrangler.js`
3. 把 `frontend/` 变更文件增量同步到 R2

如果你只想重新上传，不想重复构建 CSS：

```bash
npm run upload-wrangler
```

## 8. 部署 Worker

只部署 Worker：

```bash
npm run deploy
```

上传前端并部署 Worker：

```bash
npm run deploy-full
```

当前默认文档不再推荐：

- `npm run upload-static`
- `npm run deploy-all`

因为这两条属于旧上传流程。

## 9. 首次上线推荐顺序

如果你是第一次部署，最稳妥的顺序是：

1. `npm install`
2. 配好 `wrangler.toml`
3. 创建 D1 / R2
4. `wrangler d1 migrations apply my-flower-pots --remote`
5. `npm run deploy`，确认 Worker 可发布
6. 确认最终公开地址
7. 更新 `frontend/js/config.js` 的 `prodUrl`
8. 配置生产环境 `APP_BASE_URL`
9. `npm run upload`
10. 如有需要，再执行一次 `npm run deploy`

如果你已经知道最终公开地址，也可以直接：

```bash
npm run deploy-full
```

## 10. 上线后验证

建议至少检查：

- 首页是否正常加载
- 注册、登录、刷新令牌是否正常
- 花盆图片上传是否正常
- 分享页是否能打开
- 管理员页面是否正常
- 客服收件箱与附件下载是否正常

可以手动验证：

```bash
curl https://your-domain.example/api/auth/me
```

如果未登录，返回未授权也是正常的；重点是接口是否可达、是否不是 404。

## 11. 常见问题

### 页面资源 404

通常意味着：

- 前端还没上传到 R2
- 上传到了错误的桶
- Worker 绑定的不是那个桶

先检查：

```bash
npm run upload
```

### API 地址错误

通常是 `frontend/js/config.js` 中的 `prodUrl` 还没改，或者改了以后没重新上传。

### 图片上传回退到占位图

当前上传逻辑走 `STATIC_BUCKET`，不是单独的 `IMAGE_BUCKET`。如果文档或旧记忆里还在找 `IMAGE_BUCKET`，可以直接忽略那套旧方案。

### 邮件相关功能不工作

检查生产环境：

- `RESEND_API_KEY`
- `EMAIL_FROM`
- `SUPPORT_EMAIL_FROM`
- `SUPPORT_EMAIL_FROM_NAME`

## 12. 发布后的维护建议

- 前端改动后先执行 `npm run upload`
- Worker 逻辑改动后执行 `npm run deploy`
- 数据库结构改动统一通过 `migrations/` 维护，并使用 `wrangler d1 migrations apply` 应用
- 重要数据定期使用 `scripts/backup-d1.js` 备份
