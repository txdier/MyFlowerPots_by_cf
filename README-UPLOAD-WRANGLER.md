# Wrangler 批量上传脚本使用指南

## 作用

`upload-static-wrangler.js` 用于把 `frontend/` 下的生产静态资源增量同步到 R2 `STATIC_BUCKET`。

当前仓库的推荐流程是：

- 本地开发：`wrangler dev` + `[assets]`
- 生产静态文件同步：`upload-static-wrangler.js`
- 生产 Worker 发布：`wrangler deploy`

## 前置条件

1. 已安装项目依赖：`npm install`
2. 已登录 Wrangler：`npx wrangler login`
3. 本地存在 `wrangler.toml`，并正确配置了 `[[r2_buckets]]`
4. 已确认目标存储桶就是生产使用的 `STATIC_BUCKET`

## 推荐命令

| 命令 | 用途 |
| --- | --- |
| `npm run upload` | 先构建 Tailwind CSS，再执行 Wrangler 增量上传 |
| `npm run upload-wrangler` | 直接执行 `upload-static-wrangler.js` |
| `npm run deploy-full` | 上传前端文件后，再部署 Worker |
| `npm run deploy` | 仅部署 Worker，不同步静态文件 |

下面两个脚本目前仍保留在 `package.json` 中，但属于旧流程，不作为默认文档路径：

| 命令 | 说明 |
| --- | --- |
| `npm run upload-static` | 旧版 AWS SDK 上传脚本 |
| `npm run deploy-all` | 旧版上传脚本 + Worker 部署 |

## 当前脚本行为

脚本会：

1. 扫描 `frontend/` 下的文件
2. 排除 `node_modules`、`.git`、`.md`、`.map`、`tailwind-input.css` 等不需要发布的内容
3. 为每个文件计算 SHA-256 哈希
4. 使用 `.upload-cache.json` 记录上次上传状态
5. 仅上传变更文件
6. 通过 `npx wrangler r2 object put ... --remote` 执行真实上传

## 常用命令

```bash
# 构建 CSS + 增量上传
npm run upload

# 只上传，不重复构建 CSS
npm run upload-wrangler

# 上传前端文件后部署 Worker
npm run deploy-full
```

## 配置项

脚本顶部的 `config` 对象是当前唯一受支持的配置入口：

```javascript
const config = {
  bucketName: 'my-flower-pots',
  frontendDir: join(__dirname, 'frontend'),
  excludeExtensions: ['.js.map', '.css.map', '.ts', '.tsx', '.md'],
  excludeDirs: ['node_modules', '.git', '__pycache__', '.DS_Store'],
  excludeFiles: ['tailwind-input.css'],
  maxConcurrent: 5,
  retryCount: 3,
  cacheFile: join(__dirname, '.upload-cache.json'),
};
```

### 需要注意

- 当前脚本**没有**实现 `MAX_CONCURRENT`、`BUCKET_NAME` 之类的环境变量覆盖。
- 如果要修改并发数或目标桶，请直接编辑脚本中的 `config`。
- 文档里凡是提到“环境变量覆盖上传参数”的旧说法，都不再适用。

## 增量上传缓存

- 缓存文件：`.upload-cache.json`
- 用途：记录每个已上传文件的哈希
- 结果：未修改文件会被跳过，上传速度明显更快

如果你需要强制全量上传，只要删除 `.upload-cache.json` 后重新运行 `npm run upload` 即可。

## 典型输出

```text
⏭️  跳过 (未修改): index.html
⏭️  跳过 (未修改): css/app.css
✅ 上传成功: js/app.js
📊 进度: 15/23 (65%) | ✅ 12 | ❌ 0 | ⏭️ 3
```

## 什么时候需要重新上传

以下情况建议重新执行 `npm run upload`：

- 修改了任意 HTML 页面
- 修改了 `frontend/js/config.js`
- 修改了 `frontend/js/*.js`
- 修改了 `frontend/css/app.css`
- 重新构建了 `frontend/css/tailwind-built.css`
- 新增或替换了图片、图标、`manifest.json`、`favicon.ico`

## 排障建议

### 上传失败

优先检查：

1. `npx wrangler login` 是否已经完成
2. `wrangler.toml` 中的桶名是否正确
3. 当前 Cloudflare 账号是否有对应 R2 存储桶权限
4. 控制台里具体是哪个文件上传失败

### 页面 404

如果 Worker 已经部署，但页面仍 404，通常是下面两类原因：

- 前端文件还没同步到 R2
- 上传到了错误的桶，或 Worker 绑定的不是同一个桶

### 上传后页面没变化

通常先检查：

- `frontend/js/config.js` 是否真的参与了上传
- `.upload-cache.json` 是否需要清理
- 是否改动了源文件，但忘了先执行 `npm run build-css`

## CI/CD 建议

如果要在 CI 中使用，推荐仍然走：

```bash
npm run upload
npm run deploy
```

并确保运行环境中已经准备好 Wrangler 登录态或所需令牌。
