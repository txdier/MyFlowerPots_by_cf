# GitHub Actions 自动部署与花盆详情页滚动导航设计

## 背景与目标

当前项目依赖开发者在本机执行 `npm run deploy` 发布 Cloudflare Worker，仓库中没有 GitHub Actions。新电脑还需要手动从模板准备本地配置。花盆详情页已有“概览、养护历史、生长轨迹”吸顶导航和点击滚动，但自然滚动页面时不会自动更新高亮。

本次改动实现以下目标：

- 所有分支和 Pull Request 都通过 GitHub Actions 执行一致的完整验证。
- 只有推送到 `main` 的提交在验证通过后自动更新生产 D1 schema 并部署 Cloudflare Worker。
- 生产 D1 migration 前记录 Time Travel bookmark，便于故障恢复，但不把生产数据导出到 GitHub Artifacts。
- 新电脑拉取仓库后只需安装依赖、初始化本地配置并启动开发服务。
- 花盆详情页自然滚动时，“概览、养护历史、生长轨迹”依次高亮；点击导航仍然平滑滚动。

## 总体约束

- 生产分支固定为 `main`。
- GitHub 仓库只保存配置结构，不保存 Cloudflare API Token、Account ID 或应用密钥。
- GitHub Actions 使用仓库当前锁文件和 Node.js 20，安装命令固定为 `npm ci`。
- D1 migration 使用仓库 `migrations/` 和 `wrangler.toml` 中的 `my-flower-pots` 数据库绑定。
- 自动发布不创建或上传生产数据库 SQL 备份；恢复依赖 Cloudflare D1 Time Travel。
- 本地初始化不得覆盖已经存在的 `.dev.vars` 或 `frontend/js/config.js`。
- 不改变详情页三个区域的内容结构和业务权限逻辑。

## GitHub Actions 架构

新增一个工作流 `.github/workflows/deploy.yml`，由 `verify` 和 `deploy` 两个 Job 组成。

### 触发规则

- `pull_request`：执行 `verify`，不执行 `deploy`。
- 任意分支 `push`：执行 `verify`。
- `main` 分支 `push`：执行 `verify`；通过后执行 `deploy`。
- 工作流支持手动 `workflow_dispatch`，但手动触发只有在所选 ref 为 `main` 时才允许生产部署。

### Verify Job

Verify Job 在 `ubuntu-latest` 上执行：

1. Checkout 当前提交。
2. 安装 Node.js 20，并启用 npm 缓存。
3. 执行 `npm ci`。
4. 执行 `npm run verify:full`。

任何一步失败都会阻止生产 Job。

### Deploy Job

Deploy Job 满足以下条件才运行：

- `verify` 成功。
- 当前 ref 为 `refs/heads/main`。
- 事件为 `push` 或显式选择 `main` 的手动触发。

部署步骤为：

1. Checkout 已验证的同一个 commit。
2. 安装 Node.js 20，并执行 `npm ci`。
3. 使用 `wrangler d1 time-travel info my-flower-pots` 记录迁移前 bookmark；bookmark 只进入 Action 日志和 Job Summary，不作为数据文件上传。
4. 执行 `wrangler d1 migrations apply my-flower-pots --remote`。
5. 执行前端构建命令，生成 Tailwind CSS 和压缩前端资源。
6. 执行 `wrangler deploy`。

工作流设置生产部署 `concurrency`，同一时间只允许一个生产发布运行。新的发布等待当前发布完成，不在 migration 或 deploy 中途取消正在运行的发布。

### GitHub Secrets 与权限

仓库需要配置：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Token 使用 Cloudflare 自定义 Token，并限制到当前账号。它必须具有部署 Worker、读取和更新目标 D1 数据库、使用 Worker 所声明资源所需的权限。Token 不写入仓库、README 示例值、日志或构建产物。

GitHub Actions 自身只申请读取仓库内容所需的最小权限。生产 Secrets 仅由 `deploy` Job 使用，不传入 Pull Request 的验证步骤。

## D1 migration 与恢复

Migration 在 Worker 部署前执行，使新 Worker 启动时可以依赖最新 schema。Migration 失败时停止工作流，不部署新 Worker。

如果 migration 成功但 Worker 部署失败，生产数据库可能已经处于新 schema，而线上仍运行旧 Worker。因此 migration 应保持向后兼容：优先新增表、列或索引；删除、重命名、数据回填和不可逆约束变更需要拆成独立的渐进式发布。

故障恢复流程：

1. 从失败 Job 的日志或 Summary 取得迁移前 bookmark。
2. 先评估是否可以通过补丁 migration 或重新部署恢复。
3. 确实需要覆盖生产数据时，再人工执行 `wrangler d1 time-travel restore my-flower-pots --bookmark=<bookmark>`。

Time Travel restore 是破坏性操作，不由失败工作流自动触发。

## 本地开发体验

新增 `scripts/setup-local.js` 和 npm 命令 `setup:local`。

脚本逐项检查：

- `.dev.vars` 不存在时，从 `.dev.vars.example` 复制。
- `frontend/js/config.js` 不存在时，从 `frontend/js/config.js.example` 复制。
- 目标文件存在时输出“已跳过”，不读取、改写或覆盖其内容。
- 缺少模板文件或复制失败时以非零状态退出，并给出具体文件名。

`wrangler.toml` 已由仓库统一维护并包含生产资源绑定，因此不再要求每台电脑从 `wrangler.toml.example` 复制。新电脑标准启动流程为：

```powershell
npm ci
npm run setup:local
npm run dev
```

开发者随后只需在生成的本地文件中填写个人开发密钥。`README.md` 提供最短启动路径，`docs/DEPLOYMENT.md` 提供 GitHub Secrets、自动 migration、部署触发规则、恢复和手动应急发布细节。

## 详情页滚动导航

### 模块边界

新增 `frontend/js/section-nav-utils.js`，以浏览器全局对象暴露纯函数。该文件只负责根据区域位置选择活动项，不依赖 Vue、API 或花盆数据。

`frontend/js/pages/pot-detail-page.js` 负责：

- 获取三个区域 DOM 元素。
- 初始化和清理 `IntersectionObserver`。
- 调用导航工具计算 `activeSection`。
- 在浏览器不支持 observer 时安装经过 `requestAnimationFrame` 节流的滚动监听。
- 保留现有 `scrollToSection` 点击滚动行为。

`frontend/pot-detail.html` 加载导航工具，并保留三个稳定区域 ID：

- `section-overview`
- `section-records`
- `section-timelines`

### 活动区域判定

激活参考线位于吸顶页头和页内导航下方。正常滚动时，参考线最近越过的区域标题成为活动项：

1. 页面顶部和第一个区域内高亮“概览”。
2. 参考线进入养护区域后高亮“养护历史”。
3. 参考线进入生长轨迹区域后高亮“生长轨迹”。
4. 页面到达底部附近时强制选择最后一个实际存在的区域，解决最后区域太短、标题无法到达参考线的问题。

缺少某个区域元素时将其忽略；如果没有找到任何区域，则保持当前状态而不抛出异常。

### Observer 与降级逻辑

支持 `IntersectionObserver` 时，observer 使用与吸顶导航高度一致的顶部 `rootMargin`。回调不直接依赖 entry 顺序，而是重新读取当前区域位置并交给纯函数判定，从而适应异步加载养护记录、生长记录后发生的高度变化。

页面加载完成后执行一次同步。点击标签时立即设置对应活动项，再进行平滑滚动；滚动过程中 observer 按实际经过区域更新高亮。

不支持 `IntersectionObserver` 时使用 `scroll` 和 `resize` 监听，并通过 `requestAnimationFrame` 将同一帧中的多次事件合并为一次计算。Vue 组件卸载时断开 observer、取消待处理动画帧并移除监听。

### 视觉样式

维持现有三等分圆角导航。活动项继续使用绿色语义，但提高背景与文字对比度，并补充 `aria-current="true"`，让视觉和辅助技术都能识别当前位置。非活动项保留灰色和点击反馈。

## 测试与验证

### 自动测试

- 为 `section-nav-utils.js` 增加单元测试：
  - 顶部默认选择概览。
  - 参考线越过各区域时按顺序返回对应 key。
  - 页面接近底部时选择最后一个区域。
  - 缺少区域或输入为空时安全返回。
- 为 `setup-local.js` 的可测试逻辑增加测试：
  - 创建缺失配置。
  - 已存在文件不被覆盖。
  - 缺少模板时报告失败。
- 静态检查工作流包含 `verify:full`、D1 bookmark、远端 migration、main-only deploy 和 concurrency 约束。
- 修改 `pot-detail-page.js` 后执行 `npm run build-frontend-assets`，确保 `pot-detail-page.min.js` 同步。

### 完整验证

实现完成后执行：

```powershell
npm run verify:full
```

本地再检查：

- 桌面和移动宽度下自然滚动，三个标签依次高亮。
- 点击三个标签均能平滑到达正确区域。
- 内容为空、内容较长和页面底部场景高亮正确。
- 新电脑式初始化不会覆盖已有本地配置。

GitHub Actions 合入前先通过 Pull Request 验证；合入 `main` 后以 Action 日志确认 bookmark、migration 和 Worker deploy 顺序。

## 文档与运维边界

`README.md` 面向日常开发者，突出三步启动和自动发布规则。`docs/DEPLOYMENT.md` 面向维护者，记录 Secrets、Token 权限、migration 兼容性要求、Time Travel 恢复和手动应急命令。

本次不自动创建 Cloudflare 资源、不自动写入 GitHub Secrets、不自动执行 Time Travel restore，也不引入预览环境或多套 Cloudflare environment。这些能力可在后续有明确需求时单独设计。
