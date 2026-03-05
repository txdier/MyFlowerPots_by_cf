# My Flower Pots - 前端迁移项目

## 📋 项目概述

本项目将原有的微信小程序"我的花盆"迁移为现代化的Web应用，使用Cloudflare Workers作为一体化后端，R2存储静态资源，D1作为数据库。

## 🏗️ 项目结构

```
my-flowerpots/
├── src/                          # Worker 后端代码 (TypeScript)
│   ├── index.ts                 # 主入口 (API + 静态资源)
│   ├── api/                     # API 路由模块
│   │   ├── auth.ts             # 认证 API
│   │   ├── pots.ts             # 花盆管理 API
│   │   ├── care-records.ts     # 养护记录 API
│   │   ├── care-schedules.ts   # 养护计划 API
│   │   ├── timelines.ts        # 生长轨迹 API
│   │   ├── plants.ts           # 植物数据 API
│   │   ├── upload.ts           # 图片上传 API
│   │   ├── admin.ts            # 管理员 API
│   │   ├── weather.ts          # 天气 API
│   │   ├── care-advice.ts      # 养护建议 API
│   │   └── analytics.ts        # 页面访问统计
│   ├── static/                  # 静态资源服务
│   │   └── server.ts           # R2 服务及 SPA 回退
│   └── utils/                   # 工具函数
├── frontend/                    # 前端 Web 应用
│   ├── index.html              # 首页 (花盆列表)
│   ├── pot-detail.html         # 花盆详情页
│   ├── add-pot.html            # 添加花盆页
│   ├── edit-pot.html           # 编辑花盆页
│   ├── care-record.html        # 养护记录页
│   ├── all-records.html        # 历史记录页
│   ├── all-timelines.html      # 全部生长轨迹页
│   ├── profile.html            # 个人中心页
│   ├── reset-password.html     # 密码重置页
│   ├── admin-plants.html       # 植物管理页 (管理员)
│   ├── admin-stats.html        # 统计看板页 (管理员)
│   ├── css/
│   │   ├── tailwind-input.css  # Tailwind CSS 源码
│   │   ├── tailwind-built.css  # Tailwind CSS 构建产物
│   │   ├── app.css             # 自定义样式
│   │   └── icons.css           # 自定义 SVG 图标
│   ├── js/
│   │   ├── api-client.js      # API 封装
│   │   ├── config.js.example  # 配置模板
│   │   ├── router.js          # 页面跳转工具
│   │   ├── app.js             # 全局应用逻辑
│   │   ├── vue.global.js      # Vue 3 运行时 (本地引入)
│   │   ├── Sortable.min.js    # 拖拽排序库
│   │   └── tailwindcss.js     # Tailwind CSS 运行时
│   └── assets/                 # 图片资源
├── sql/                         # 数据库初始化脚本
├── upload-static-wrangler.js    # 核心部署工具
├── wrangler.toml               # Workers 配置文件
├── tailwind.config.cjs         # Tailwind CSS 配置
└── package.json                # 项目依赖
```

## 🚀 技术栈

### 后端
- **Cloudflare Workers** - 边缘计算平台
- **D1数据库** - SQLite兼容的分布式数据库
- **R2存储** - 对象存储（用于静态资源）
- **TypeScript** - 类型安全的JavaScript

### 前端
- **Vue.js 3 (本地引入)** - 响应式 MVVM 框架（`vue.global.js`）
- **Tailwind CSS (CLI 构建)** - 实用优先 CSS 框架（通过 `npm run build-css` 生成精简版）
- **自定义 SVG 图标系统** - 通过 CSS `mask-image` 实现（`icons.css`，替代 Font Awesome）
- **原生 JavaScript (ES6+)** - 现代化 JS 特性及 Fetch API

### 开发与部署工具
- **Wrangler CLI** - Cloudflare 官方开发工具
- **Node.js 18+** - 运行时环境
- **Git** - 版本控制系统
- **Tailwind CLI** - 用于生成精简版 CSS 文件

## 🔧 部署步骤

### 1. 环境准备

```bash
# 安装Node.js (>=18.0.0)
# 安装Wrangler CLI
npm install -g wrangler

# 登录Cloudflare
wrangler login

# 安装项目依赖
npm install
```

### 2. 配置环境变量

创建 `.dev.vars` 文件（开发环境）或设置生产环境变量：

```bash
# R2配置（上传静态资源需要）
export R2_ACCESS_KEY_ID="your-access-key-id"
export R2_SECRET_ACCESS_KEY="your-secret-access-key"
export R2_ENDPOINT="https://<account-id>.r2.cloudflarestorage.com"

# 邮件服务配置（可选）
export RESEND_API_KEY="your-resend-api-key"
```

### 3. 创建Cloudflare资源

```bash
# 创建D1数据库（如果尚未创建）
wrangler d1 create my-flower-pots-db

# 创建R2存储桶（如果尚未创建）
wrangler r2 bucket create my-flower-pots-static
```

### 4. 初始化数据库

```bash
# 执行数据库迁移
npm run migrate

# 验证数据库
npm run verify
```

### 5. 开发测试

```bash
# 启动开发服务器
npm run dev

# 访问地址: http://localhost:8787
```

### 6. 部署到生产环境

```bash
# 方法一：分步部署
npm run upload-static    # 上传前端静态资源到R2
npm run deploy          # 部署Worker到Cloudflare

# 方法二：一键部署
npm run deploy-all
```

## 📱 功能特性

### 用户认证
- ✅ 邮箱注册/登录
- ✅ 匿名用户标识
- ✅ 密码重置
- ✅ 邮箱验证
- ✅ 用户资料管理

### 花盆管理
- ✅ 花盆列表展示
- ✅ 花盆详情查看
- ✅ 添加新花盆
- ✅ 编辑花盆信息
- ✅ 删除花盆
- ✅ 图片上传支持

### 养护记录
- ✅ 养护记录查看
- ✅ 添加养护记录
- ✅ 养护历史时间线

### 用户体验
- ✅ 响应式设计（移动端/桌面端）
- ✅ 单页应用（SPA）
- ✅ 实时错误提示
- ✅ 加载状态指示
- ✅ 离线基础功能

## 🔌 API接口

### 认证相关
- `POST /api/auth/register` - 用户注册
- `POST /api/auth/login` - 用户登录
- `POST /api/auth/identify` - 匿名用户标识
- `GET /api/auth/me` - 获取当前用户信息

### 花盆管理
- `GET /api/pots` - 获取花盆列表
- `GET /api/pots/:id` - 获取花盆详情
- `POST /api/pots` - 创建花盆
- `PUT /api/pots/:id` - 更新花盆
- `DELETE /api/pots/:id` - 删除花盆

### 养护记录
- `GET /api/pots/:id/care-records` - 获取养护记录
- `GET /api/care-records/:potId` - 获取某花盆的养护记录
- `POST /api/care-records` - 创建养护记录

### 时间线
- `GET /api/pots/:id/timelines` - 获取时间线记录
- `POST /api/timelines` - 创建时间线记录

### 养护计划
- `GET /api/care-schedules` - 获取所有养护计划
- `GET /api/care-schedules/pot/:potId` - 获取某花盆的养护计划
- `GET /api/care-schedules/reminders` - 获取养护提醒
- `POST /api/care-schedules` - 创建养护计划
- `PUT /api/care-schedules/:id` - 更新养护计划
- `DELETE /api/care-schedules/:id` - 删除养护计划

### 管理员
- `GET /api/admin/check` - 管理员权限检查
- `GET /api/admin/plants` - 植物列表
- `POST /api/admin/plants` - 创建植物
- `PUT /api/admin/plants/:id` - 更新植物
- `DELETE /api/admin/plants/:id` - 删除植物
- `GET /api/admin/users` - 用户列表
- `PUT /api/admin/users/:id` - 更新用户
- `DELETE /api/admin/users/:id` - 删除用户

### 其他
- `GET /api/weather` - 获取天气信息
- `POST /api/care-advice` - 获取养护建议
- `POST /api/plants/smart-match` - 智能植物匹配

## 🎨 前端架构

### 页面架构
项目采用多页面架构（MPA），每个功能为独立的 HTML 文件，内置 Vue 3 组件逻辑：

```
页面结构（每个 HTML 文件）
├── 头部导航         # 统一导航栏
├── 主内容区         # Vue 3 数据驱动的业务逻辑
└── 底部导航 (index)  # 仅首页有底部Tab导航
```

### 状态管理
- **Vue 3 响应式状态** - 页面级别的数据管理
- **LocalStorage** - 用户认证状态持久化（JWT 令牌 + 用户ID）
- **URL 参数** - 页面间数据传递（如 `pot-detail.html?id=xxx`）

### 页面跳转
- **多页面架构** - 每个功能独立 HTML 文件，通过链接跳转
- **参数传递** - 通过 URL 查询参数传递数据
- **`router.js`** - 页面跳转辅助工具

## 🔍 开发指南

### 添加新页面
1. 在 `frontend/` 目录下创建新的 HTML 文件
2. 在页面内嵌入 Vue 3 组件逻辑
3. 引入必要的 CSS 和 JS 文件（`tailwind-built.css`、`app.css`、`icons.css`、`api-client.js` 等）

### 添加新API
1. 在 `src/api/` 目录下创建新的API模块
2. 在 `src/index.ts` 中注册API路由
3. 在 `frontend/js/api-client.js` 中添加API调用方法

### 样式定制
1. 修改 `frontend/css/app.css` 中的自定义样式
2. 如需新图标，在 `frontend/css/icons.css` 中添加 SVG 图标定义
3. 修改后执行 `npm run build-css` 重新构建 Tailwind CSS

## 🧪 测试

```bash
# 测试API接口
npm run test-api

# 测试数据库迁移
npm run test-db

# 测试新API功能
npm run test-new

# 调试特定功能
npm run debug
```

## 📊 性能优化

### 前端优化
- ✅ 静态资源CDN加速（R2 + Cloudflare CDN）
- ✅ 代码分割（按需加载）
- ✅ 图片懒加载
- ✅ 浏览器缓存策略

### 后端优化
- ✅ 边缘计算（全球低延迟）
- ✅ 数据库索引优化
- ✅ API响应缓存
- ✅ 错误重试机制

## 🔒 安全考虑

### 认证安全
- ✅ 密码哈希存储（加盐）
- ✅ JWT令牌验证
- ✅ 邮箱验证机制
- ✅ 密码强度验证

### API安全
- ✅ CORS配置
- ✅ 输入验证
- ✅ SQL注入防护
- ✅ 速率限制（可配置）

### 数据安全
- ✅ 用户数据隔离
- ✅ 敏感信息加密
- ✅ 数据备份机制
- ✅ 隐私政策合规

## 📈 监控与日志

### 内置监控
- 错误日志记录
- API调用统计
- 用户行为分析
- 性能指标收集

### Cloudflare分析
- Workers Analytics
- R2存储分析
- D1查询性能
- 边缘网络性能


## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情

## 🙏 致谢

- 感谢Cloudflare提供的免费服务

## 📞 支持

如有问题或建议，请：
1. 查看 [API迁移指南](README-API-MIGRATION.md)
2. 检查现有Issue
3. 创建新的Issue
4. 联系开发团队

---

**🌱 让每一株植物都被精心照料！**
