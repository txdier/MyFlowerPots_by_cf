# GitHub Actions 自动部署与详情页滚动导航 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立 main 分支自动迁移 D1 并部署 Cloudflare Worker 的 GitHub Actions 流程，同时提供三步本地启动和详情页滚动导航自动高亮。

**Architecture:** 使用单一 GitHub Actions 工作流分离 verify/deploy Job，生产部署串行执行并在 migration 前记录 D1 Time Travel bookmark。将非敏感的 Wrangler 资源配置纳入版本控制；本地配置由幂等脚本补齐。详情页把活动区域判定提取为浏览器纯函数，页面控制器通过 observer 与帧节流滚动同步 Vue 状态。

**Tech Stack:** GitHub Actions, Node.js 20, npm, Wrangler 4, Cloudflare Workers/D1/R2, Vue 3, Vitest, 原生 IntersectionObserver。

## Global Constraints

- 只有 `main` 的 `push` 或明确选择 `main` 的 `workflow_dispatch` 可以部署生产。
- 所有 push 和 Pull Request 都运行 `npm run verify:full`。
- D1 顺序固定为 Time Travel bookmark、远端 migrations、Worker deploy。
- 不上传生产 SQL，不自动执行 Time Travel restore。
- `setup:local` 只创建缺失文件，绝不覆盖已有本地配置。
- Cloudflare API Token 和应用密钥不得进入仓库、日志或构建产物。
- 修改 `frontend/js/pages/pot-detail-page.js` 后必须同步生成 minified 文件。

---

### Task 1: 锁定可移植的 Wrangler 配置和部署工作流契约

**Files:**
- Create: `tests/unit/deployment-workflow.test.js`
- Create: `.github/workflows/deploy.yml`
- Modify: `.gitignore`
- Create from current verified local config: `wrangler.toml`
- Modify: `wrangler.toml.example`
- Modify: `docs/superpowers/specs/2026-08-09-github-actions-deployment-pot-detail-scrollspy-design.md`

**Interfaces:**
- Consumes: `package-lock.json`, `npm run verify:full`, `npm run deploy`, `migrations/`。
- Produces: main-only production workflow and tracked `wrangler.toml` used by local and CI Wrangler commands.

- [ ] **Step 1: Write the failing workflow/config contract tests**

Add tests that read repository files and assert:

```js
expect(gitignore).not.toMatch(/^wrangler\.toml$/m);
expect(wrangler).toContain('database_id = "8c06be0c-af0c-43fc-99fb-b15c69fe6d2f"');
expect(workflow).toContain('npm run verify:full');
expect(workflow).toContain('wrangler d1 time-travel info my-flower-pots');
expect(workflow).toContain('wrangler d1 migrations apply my-flower-pots --remote');
expect(workflow).toContain("github.ref == 'refs/heads/main'");
expect(workflow).toContain('cancel-in-progress: false');
```

- [ ] **Step 2: Run the contract test and verify RED**

Run: `npm.cmd run test:unit -- tests/unit/deployment-workflow.test.js`

Expected: FAIL because `.github/workflows/deploy.yml` is missing and `wrangler.toml` is ignored.

- [ ] **Step 3: Track the production resource configuration**

Remove only the `wrangler.toml` ignore rule. Add the verified `wrangler.toml`, including `[assets]`, D1, Analytics Engine and R2 bindings, with no `[vars]` secrets. Do not include the unused AI binding because Workers AI requires remote authentication during local development. Update `wrangler.toml.example` so its routes and bindings remain structurally aligned while retaining a placeholder database ID.

- [ ] **Step 4: Implement the workflow**

Create a workflow with `pull_request`, all-branch `push`, and `workflow_dispatch`; use `actions/checkout@v6`, `actions/setup-node@v6`, Node `20.19.0`, `npm ci`, and `npm run verify:full`. The deploy Job must use:

```yaml
if: >-
  github.ref == 'refs/heads/main' &&
  (github.event_name == 'push' || github.event_name == 'workflow_dispatch')
needs: verify
concurrency:
  group: my-flower-pots-production
  cancel-in-progress: false
```

Set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` from secrets only in deploy. Record `npx wrangler d1 time-travel info my-flower-pots`, apply remote migrations, then run `npm run deploy`.

- [ ] **Step 5: Run the test and verify GREEN**

Run: `npm.cmd run test:unit -- tests/unit/deployment-workflow.test.js`

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add .github/workflows/deploy.yml .gitignore wrangler.toml wrangler.toml.example tests/unit/deployment-workflow.test.js docs/superpowers/specs/2026-08-09-github-actions-deployment-pot-detail-scrollspy-design.md
git commit -m "ci: 新增 Cloudflare 自动部署流程"
```

### Task 2: 添加幂等本地初始化命令

**Files:**
- Create: `scripts/setup-local.js`
- Create: `tests/unit/setup-local.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `setupLocalFiles({ rootDir, log }): { created: string[], skipped: string[] }` and CLI command `npm run setup:local`.

- [ ] **Step 1: Write setup-local behavior tests**

Use a temporary directory and assert that the exported function:

```js
expect(result.created).toEqual(['.dev.vars', 'frontend/js/config.js']);
expect(readFileSync(existingTarget, 'utf8')).toBe('keep-me');
expect(() => setupLocalFiles({ rootDir })).toThrow(/模板文件不存在/);
```

Each test cleans up its own temporary directory.

- [ ] **Step 2: Run the setup test and verify RED**

Run: `npm.cmd run test:unit -- tests/unit/setup-local.test.js`

Expected: FAIL because `scripts/setup-local.js` does not exist.

- [ ] **Step 3: Implement the minimal idempotent setup utility**

Export `setupLocalFiles`. For each mapping, check the target first, validate the source, create the parent directory, and use `copyFileSync` with `COPYFILE_EXCL`. Run the function only when the module is invoked as the CLI entrypoint. Add:

```json
"setup:local": "node scripts/setup-local.js"
```

- [ ] **Step 4: Run setup tests and verify GREEN**

Run: `npm.cmd run test:unit -- tests/unit/setup-local.test.js`

Expected: PASS for create, skip, and missing-template cases.

- [ ] **Step 5: Commit**

```powershell
git add scripts/setup-local.js tests/unit/setup-local.test.js package.json
git commit -m "feat: 添加本地环境快速初始化"
```

### Task 3: 测试并实现活动区域判定工具

**Files:**
- Create: `frontend/js/section-nav-utils.js`
- Modify: `tests/unit/frontend-utils.test.js`

**Interfaces:**
- Produces: `window.MyFlowerPotsSectionNav.getActiveSectionKey({ sections, activationY, viewportBottom, documentHeight, bottomThreshold })`.

- [ ] **Step 1: Write failing pure-function tests**

Load the browser utility with the existing VM helper and cover:

```js
expect(getKey({ sections, activationY: 120 })).toBe('overview');
expect(getKey({ sections: recordsAtAnchor, activationY: 120 })).toBe('records');
expect(getKey({ sections: timelinesAtAnchor, activationY: 120 })).toBe('timelines');
expect(getKey({ sections, viewportBottom: 1000, documentHeight: 1001 })).toBe('timelines');
expect(getKey({ sections: [], activationY: 120 })).toBeNull();
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm.cmd run test:unit -- tests/unit/frontend-utils.test.js`

Expected: FAIL because `frontend/js/section-nav-utils.js` does not exist.

- [ ] **Step 3: Implement minimal browser utility**

Normalize valid `{ key, top }` entries, return the last valid key near the document bottom, otherwise return the last section whose top is at or above `activationY`, defaulting to the first section. Return `null` for no valid sections.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm.cmd run test:unit -- tests/unit/frontend-utils.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add frontend/js/section-nav-utils.js tests/unit/frontend-utils.test.js
git commit -m "test: 增加详情导航区域判定"
```

### Task 4: 将滚动同步接入花盆详情页

**Files:**
- Modify: `frontend/pot-detail.html`
- Modify: `frontend/js/pages/pot-detail-page.js`
- Regenerate: `frontend/js/pages/pot-detail-page.min.js`

**Interfaces:**
- Consumes: `MyFlowerPotsSectionNav.getActiveSectionKey(...)` from Task 3.
- Produces: scroll-aware `activeSection` lifecycle and accessible `aria-current` state.

- [ ] **Step 1: Add a failing integration contract test**

Extend `tests/unit/frontend-utils.test.js` to assert the HTML loads `js/section-nav-utils.js` before the page controller, binds `aria-current`, and the source controller contains observer setup plus cleanup.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm.cmd run test:unit -- tests/unit/frontend-utils.test.js`

Expected: FAIL because the page has not loaded or integrated the utility.

- [ ] **Step 3: Implement the Vue lifecycle integration**

Add stable section metadata, calculate element tops, schedule sync through one pending animation frame, initialize `IntersectionObserver`, listen passively for scroll and resize to cover bottom and dynamic layout boundaries, and remove all resources in `onUnmounted`. Preserve the existing `scrollToSection` offset and smooth behavior.

Set the button accessibility binding to:

```html
:aria-current="activeSection === tab.key ? 'true' : undefined"
```

Increase the active state contrast without changing the three-column sticky layout.

- [ ] **Step 4: Generate frontend artifacts**

Run: `npm.cmd run build-frontend-assets`

Expected: regenerated `pot-detail-page.min.js` and synchronized icon assets with no Terser error.

- [ ] **Step 5: Run the focused tests and verify GREEN**

Run: `npm.cmd run test:unit -- tests/unit/frontend-utils.test.js`

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add frontend/pot-detail.html frontend/js/pages/pot-detail-page.js frontend/js/pages/pot-detail-page.min.js frontend/css/icons-pot-detail.css tests/unit/frontend-utils.test.js
git commit -m "feat: 支持详情页滚动导航高亮"
```

### Task 5: 更新开发与部署文档并完成全量验证

**Files:**
- Modify: `README.md`
- Modify: `docs/DEPLOYMENT.md`
- Modify: `docs/superpowers/plans/2026-08-09-github-actions-deployment-pot-detail-scrollspy.md`

**Interfaces:**
- Consumes: workflow and npm scripts from Tasks 1-4.
- Produces: new-computer quick start and production operations instructions.

- [ ] **Step 1: Update README quick start**

Document exactly:

```powershell
npm ci
npm run setup:local
npm run dev
```

Explain generated files, no-overwrite behavior, tracked Wrangler config, and that non-main branches only verify.

- [ ] **Step 2: Update deployment operations**

Document GitHub Secrets, least-privilege Cloudflare Token requirements, main-only deploy, D1 bookmark/migration/deploy order, failure behavior, manual Time Travel restore caution, and `npm run deploy` as emergency manual fallback.

- [ ] **Step 3: Run full verification**

Run: `npm.cmd run verify:full`

Expected: all checks and unit/worker/smoke/API tests PASS; generated assets are current and `git diff --check` is clean.

- [ ] **Step 4: Inspect final diff and status**

Run: `git diff --check`, `git diff --stat`, and `git status --short`.

Expected: only planned files are changed and no local secret file is tracked.

- [ ] **Step 5: Commit**

```powershell
git add README.md docs/DEPLOYMENT.md docs/superpowers/plans/2026-08-09-github-actions-deployment-pot-detail-scrollspy.md
git commit -m "docs: 更新自动发布与本地开发说明"
```
