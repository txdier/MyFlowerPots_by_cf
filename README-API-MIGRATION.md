# My Flower Pots 全栈迁移项目

## 项目概述

这是一个将微信小程序"我的花盆"从微信云开发完整迁移到 Cloudflare Workers + D1 + R2 + 静态前端的全栈项目。项目使用匿名+邮箱注册的认证系统，支持多设备登录和密码重置功能，并提供现代化的响应式 Web 界面。

## 已完成的工作

### 1. 后端 API 迁移（第一阶段）
#### 数据库架构更新
- 已将所有历史迁移及结构补丁合并至 `sql/schema.sql`
- 数据库架构现在支持：匿名用户、邮箱注册用户（带验证）、花盆排序及植物百科参考。

#### 认证API实现
- **`POST /api/auth/identify`** - 匿名用户标识（保持原有功能）
- **`POST /api/auth/register`** - 邮箱注册（可选邮箱验证）
- **`POST /api/auth/login`** - 邮箱登录
- **`POST /api/auth/forgot-password`** - 忘记密码（发送重置邮件）
- **`POST /api/auth/reset-password`** - 重置密码
- **`POST /api/auth/upgrade`** - 匿名升级为邮箱用户
- **`GET /api/auth/verify-email`** - 邮箱验证（通过邮件链接）
- **`GET /api/auth/me`** - 获取当前用户信息
- **`PUT /api/auth/profile`** - 更新用户资料
- **`PUT /api/auth/password`** - 修改密码（登录状态下）

#### 邮件服务集成
- 支持 Resend 邮件服务（可选）
- 开发环境下自动记录邮件内容
- 邮件模板：验证邮件、欢迎邮件、密码重置邮件

#### 核心功能API
- **`GET /api/pots`** - 获取用户花盆列表
- **`GET /api/pots/:id`** - 获取花盆详情
- **`GET /api/pots/:id/care-records`** - 获取养护记录
- **`GET /api/pots/:id/timelines`** - 获取时间线记录
- **`GET /api/pots/:id/stats`** - 获取花盆养护统计
- **`POST /api/pots`** - 创建花盆
- **`PUT /api/pots/:id`** - 更新花盆
- **`PUT /api/pots/reorder`** - 花盆排序
- **`DELETE /api/pots/:id`** - 删除花盆
- **`POST /api/care-records`** - 创建养护记录
- **`GET /api/care-records/:potId`** - 获取某花盆的养护记录
- **`POST /api/timelines`** - 创建时间线记录
- **`GET /api/plants/search`** - 搜索植物数据库
- **`GET /api/plants/:id`** - 获取植物详情
- **`POST /api/plants/smart-match`** - 智能植物名称匹配
- **`POST /api/upload/image`** - 上传图片到 R2 存储

#### 养护计划API
- **`GET /api/care-schedules`** - 获取所有养护计划
- **`GET /api/care-schedules/pot/:potId`** - 获取某花盆的养护计划
- **`GET /api/care-schedules/reminders`** - 获取养护提醒
- **`POST /api/care-schedules`** - 创建养护计划
- **`PUT /api/care-schedules/:id`** - 更新养护计划
- **`DELETE /api/care-schedules/:id`** - 删除养护计划

#### 管理员API
- **`GET /api/admin/check`** - 管理员权限检查
- **`GET /api/admin/plants`** - 植物列表（分页+搜索）
- **`POST /api/admin/plants`** - 创建植物
- **`PUT /api/admin/plants/:id`** - 更新植物
- **`DELETE /api/admin/plants/:id`** - 删除植物
- **`POST /api/admin/plants/batch`** - 批量导入植物
- **`DELETE /api/admin/plants/batch`** - 批量删除植物
- **`GET /api/admin/users`** - 用户列表（分页+搜索）
- **`PUT /api/admin/users/:id`** - 更新用户信息
- **`DELETE /api/admin/users/:id`** - 删除用户

#### 其他API
- **`GET /api/weather`** - 获取天气信息
- **`POST /api/care-advice`** - 获取养护建议

### 2. 前端迁移（第二阶段）
#### 现代化 Web 应用架构
- **Vue.js 3 (本地引入)** - 响应式前端框架（`vue.global.js`）
- **Tailwind CSS (CLI 构建)** - 实用优先 CSS 框架（通过 `npm run build-css` 构建）
- **自定义 SVG 图标系统** - 通过 CSS `mask-image` 实现（`icons.css`）
- **响应式设计** - 适配移动端和桌面端
- **多页面架构 (MPA)** - 每个功能独立 HTML 页面，内置 Vue 3 组件逻辑

#### 完整页面实现
- **首页 (`index.html`)** - 花盆列表展示，支持侧滑操作和批量管理
- **花盆详情页 (`pot-detail.html`)** - 花盆详细信息展示
- **添加花盆页 (`add-pot.html`)** - 创建新花盆
- **编辑花盆页 (`edit-pot.html`)** - 修改花盆信息
- **养护记录页 (`care-record.html`)** - 记录养护操作
- **所有记录页 (`all-records.html`)** - 查看所有养护记录
- **全部生长轨迹页 (`all-timelines.html`)** - 查看所有时间线记录
- **个人资料页 (`profile.html`)** - 用户账户管理
- **密码重置页 (`reset-password.html`)** - 密码重置
- **植物管理页 (`admin-plants.html`)** - 管理员植物数据管理
- **统计看板页 (`admin-stats.html`)** - 管理员数据统计

#### API 客户端集成
- **`frontend/js/api-client.js`** - 完整的 API 客户端封装
- 自动处理认证令牌
- 统一的错误处理机制
- 支持图片上传功能
- 开发/生产环境自动切换

#### 用户体验优化
- 匿名用户无缝体验（延迟账户创建）
- 邮箱注册/登录界面
- 用户数据合并功能（匿名升级为注册用户）
- 图片上传和预览
- 侧滑删除和编辑操作

## 技术架构

### 后端技术栈
- **Cloudflare Workers** - 无服务器运行时
- **D1 Database** - SQLite 兼容的数据库
- **KV Namespaces** - 键值存储（用于缓存）
- **R2 Storage** - 对象存储（用于图片存储）

### 前端技术栈
- **Vue.js 3 (本地引入)** - 响应式 JavaScript 框架（`vue.global.js`）
- **Tailwind CSS (CLI 构建)** - 实用优先 CSS 框架（通过 `npm run build-css` 生成精简版）
- **自定义 SVG 图标系统** - 通过 CSS `mask-image` 实现（`icons.css`，替代 Font Awesome）
- **原生 JavaScript (ES6+)** - Fetch API、LocalStorage 等
- **多页面架构 (MPA)** - 每个功能独立 HTML 文件

### 安全特性
- 密码使用 SHA-256 哈希（结合用户ID作为盐）
- 基于 JWT 的认证机制，支持令牌自动刷新
- 支持多设备同时登录
- 密码重置令牌24小时有效期
- CORS 配置支持跨域请求
- HTTPS 强制加密传输

## 快速开始

### 1. 环境准备
```bash
# 安装 Wrangler CLI
npm install -g wrangler

# 登录 Cloudflare
wrangler login
```

### 2. 本地开发
```bash
# 安装依赖
npm install

# 启动本地开发服务器
wrangler dev
```

### 3. 数据库初始化
```bash
# 创建本地 D1 数据库
wrangler d1 create my-flower-pots-db

# 应用原始数据库架构（保持与生产环境一致）
wrangler d1 execute my-flower-pots-db --file=sql/schema.sql

```



### 6. 前端静态文件部署
```bash
# 使用 Wrangler 部署静态文件到 R2
npm run upload-wrangler

# 或使用自定义脚本部署
npm run upload-static
```

### 7. 配置环境变量
编辑 `wrangler.toml` 文件，参考`wrangler.toml.example`：
```toml
[vars]
WEATHER_API_KEY = "your-weather-api-key"
RESEND_API_KEY = "your-resend-api-key"
EMAIL_FROM = "noreply@example.com"
APP_BASE_URL = "https://api.example.com"  # 生产环境 API 地址
ADMIN_EMAILS = "admin@example.com"  # 管理员邮箱
JWT_SECRET = "your-jwt-secret-key"  # JWT 签名密钥
```

## 下一步工作（优化与扩展）

### 功能优化

### 性能优化

### 社区功能
1. **植物图鉴** - 用户贡献的植物数据库
2. **经验分享** - 用户养护经验交流

### 文件结构
```
frontend/                    # 现代化 Web 前端
├── index.html              # 首页 (花盆列表)
├── pot-detail.html         # 花盆详情页
├── add-pot.html            # 添加花盆页
├── edit-pot.html           # 编辑花盆页
├── care-record.html        # 养护记录页
├── all-records.html        # 历史记录页
├── all-timelines.html      # 全部生长轨迹页
├── profile.html            # 个人资料页
├── reset-password.html     # 密码重置页
├── admin-plants.html       # 植物管理页 (管理员)
├── admin-stats.html        # 统计看板页 (管理员)
├── assets/                 # 图片资源
├── css/
│   ├── tailwind-input.css  # Tailwind CSS 源码
│   ├── tailwind-built.css  # Tailwind CSS 构建产物
│   ├── app.css             # 自定义样式
│   └── icons.css           # 自定义 SVG 图标
└── js/
    ├── api-client.js       # API 客户端封装
    ├── config.js.example   # 预设配置模板
    ├── router.js           # 页面跳转工具
    ├── app.js              # 全局应用逻辑
    ├── vue.global.js       # Vue 3 运行时 (本地引入)
    ├── Sortable.min.js     # 拖拽排序库
    └── tailwindcss.js      # Tailwind CSS 运行时

src/                        # Cloudflare Workers 后端代码 (TypeScript)
├── index.ts               # API 主入口及路由分发
├── api/                   # 各业务模块
│   ├── auth.ts            # 认证 API
│   ├── pots.ts            # 花盆管理 API
│   ├── care-records.ts    # 养护记录 API
│   ├── care-schedules.ts  # 养护计划 API
│   ├── timelines.ts       # 生长轨迹 API
│   ├── plants.ts          # 植物数据 API
│   ├── upload.ts          # 图片上传 API
│   ├── admin.ts           # 管理员 API
│   ├── weather.ts         # 天气 API
│   ├── care-advice.ts     # 养护建议 API
│   └── analytics.ts       # 页面访问统计
├── static/                # 静态资源服务
│   └── server.ts          # R2 静态资源服务及 SPA 回退
└── utils/                 # 公用工具
```

## 部署到生产环境

### 1. 后端部署
```bash
# 创建生产数据库
wrangler d1 create my-flower-pots-db --remote

# 初始化数据库架构
wrangler d1 execute my-flower-pots-db --remote --file=sql/schema.sql

# 部署 Workers API
npm run deploy
```

### 2. 前端部署
```bash
# 部署前端静态资源到 R2 (通过 Wrangler)
npm run upload

# 或使用完整部署脚本
npm run deploy-full
```

### 3. 配置域名和路由
```bash
# 查看 Workers 路由
wrangler routes

# 配置自定义域名（如果需要）
wrangler publish --route example.com/*
```

### 4. 环境验证
```bash
# 验证 API 服务
curl https://api.example.com/api/auth/me

# 验证前端访问
# 访问配置的前端域名
```
