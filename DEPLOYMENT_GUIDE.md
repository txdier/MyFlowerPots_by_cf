# My Flower Pots - 部署指南

## 📦 R2静态资源结构

### 需要上传到R2的文件列表

```
my-flower-pots/                # R2 存储桶名称
├── index.html                  # 首页 (花盆列表)
├── pot-detail.html             # 花盆详情页
├── add-pot.html                # 新增花盆页
├── edit-pot.html               # 编辑花盆页
├── care-record.html            # 养护记录页
├── profile.html                # 个人中心页
├── all-records.html            # 历史记录页
├── all-timelines.html          # 全部生长轨迹页
├── reset-password.html         # 密码重置页
├── admin-plants.html           # 植物后台管理 (管理员)
├── admin-stats.html            # 统计数据看板 (管理员)
├── css/
│   ├── tailwind-built.css      # Tailwind CSS 构建产物
│   ├── app.css                 # 自定义样式
│   └── icons.css               # 自定义 SVG 图标 (替代 Font Awesome)
├── js/
│   ├── api-client.js           # API 客户端封装
│   ├── config.js               # 线上实际配置文件 (本地已忽略)
│   ├── config.js.example       # 配置模板
│   ├── router.js               # 页面跳转辅助工具
│   ├── app.js                  # 全局应用逻辑
│   ├── vue.global.js           # Vue 3 运行时 (本地引入)
│   ├── vue.global.prod.js      # Vue 3 生产版
│   ├── Sortable.min.js         # 拖拽排序库
│   └── tailwindcss.js          # Tailwind CSS 运行时
└── assets/
    └── images/
        └── default-pot.png     # 默认花盆图片
```

### 文件说明

1. **核心页面 (HTML)**
   - 共 11 个独立 HTML 页面，每个页面内置该场景的 Vue 3 组件逻辑。
   - 采用多页面架构（MPA），页面间通过跳转导航。

2. **样式与资源**
   - `css/tailwind-built.css` - Tailwind CSS 构建产物（由 `npm run build-css` 生成）。
   - `css/app.css` - 自定义样式。
   - `css/icons.css` - 自定义 SVG 图标系统（替代 Font Awesome）。

3. **脚本逻辑 (JS)**
   - `api-client.js` - 处理与 Cloudflare Workers 的所有网络通信，包含 JWT 自动刷新机制。
   - `config.js` - 定义生产环境域名及功能开关（从模板 `config.js.example` 创建）。
   - `router.js` - 页面跳转辅助工具。
   - `vue.global.js` / `vue.global.prod.js` - Vue 3 运行时（本地引入）。
   - `Sortable.min.js` - 花盆拖拽排序库。

3. **MIME类型配置**
   - `.html` → `text/html;charset=UTF-8`
   - `.css` → `text/css`
   - `.js` → `application/javascript`
   - `.png` → `image/png`
   - `.jpg/.jpeg` → `image/jpeg`
   - `.svg` → `image/svg+xml`

## 🚀 部署步骤

### 阶段一：环境准备

#### 1. 安装必要工具
```bash
# 安装Node.js (>=18.0.0)
# 下载地址：https://nodejs.org/

# 安装Wrangler CLI
npm install -g wrangler

# 验证安装
wrangler --version
```

#### 2. 配置Cloudflare账户
```bash
# 登录Cloudflare
wrangler login

# 选择你的账户
# 浏览器会打开Cloudflare登录页面
```

#### 3. 设置环境变量
创建 `.dev.vars` 文件（开发环境）：
```bash
# R2配置
R2_ACCESS_KEY_ID="your-r2-access-key-id"
R2_SECRET_ACCESS_KEY="your-r2-secret-access-key"
R2_ENDPOINT="https://<account-id>.r2.cloudflarestorage.com"

# 邮件服务（可选）
RESEND_API_KEY="your-resend-api-key"
```

设置生产环境变量：
```bash
# 在Cloudflare Dashboard设置
# Workers & Pages → 你的Worker → Settings → Variables
```

### 阶段二：创建Cloudflare资源

#### 1. 创建D1数据库（如果尚未创建）
```bash
# 创建数据库
wrangler d1 create my-flower-pots-db

# 输出示例：
# ✅ Successfully created DB 'my-flower-pots-db'
# [[d1_databases]]
# binding = "DB"
# database_name = "my-flower-pots-db"
# database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

# 更新wrangler.toml中的database_id
```

#### 2. 配置现有R2存储桶
```bash
# 注意：您已经有一个名为'my-flower-pots'的R2存储桶
# 不需要再创建，只需确保Worker有访问权限

# 获取R2访问密钥（如果还没有）
# 1. 访问 Cloudflare Dashboard
# 2. 进入 R2 → Manage R2 API Tokens
# 3. 创建新的令牌，选择"Edit"权限
# 4. 保存Access Key ID和Secret Access Key

# 验证存储桶存在
wrangler r2 bucket list

# 应该能看到'my-flower-pots'存储桶
```

#### 3. 初始化数据库
```bash
# 执行数据库迁移
npm run migrate

# 验证数据库结构
npm run verify
```

### 阶段三：上传静态资源到R2

#### 方法一：使用上传脚本（推荐）
```bash
# 设置R2环境变量
export R2_ACCESS_KEY_ID="your-access-key-id"
export R2_SECRET_ACCESS_KEY="your-secret-access-key"
export R2_ENDPOINT="https://<account-id>.r2.cloudflarestorage.com"

# 运行上传脚本
npm run upload-static

# 输出示例：
# 🚀 开始上传前端静态资源到R2...
# 📁 源目录: frontend
# 📦 存储桶: my-flower-pots（您现有的存储桶）
# ✅ 上传成功: index.html (text/html;charset=UTF-8)
# ✅ 上传成功: css/app.css (text/css)
# ✅ 上传成功: js/app.js (application/javascript)
# ...
```

#### 方法二：手动上传
```bash
# 使用Wrangler CLI上传到现有存储桶
wrangler r2 object put my-flower-pots/index.html --file=frontend/index.html --content-type="text/html"

# 批量上传目录
wrangler r2 object put my-flower-pots/css/app.css --file=frontend/css/app.css --content-type="text/css"
wrangler r2 object put my-flower-pots/js/app.js --file=frontend/js/app.js --content-type="application/javascript"

# 上传图片资源
wrangler r2 object put my-flower-pots/assets/images/default-pot.png --file=frontend/assets/images/default-pot.png --content-type="image/png"
```

#### 方法三：使用Cloudflare Dashboard
1. 访问 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 进入 R2 → my-flower-pots（您现有的存储桶）
3. 点击 "Upload" 按钮
4. 选择文件或拖放上传
5. 设置适当的Content-Type

### 阶段四：部署Worker到生产环境

#### 1. 测试开发环境
```bash
# 启动本地开发服务器
npm run dev

# 访问 http://127.0.0.1:8787
# 测试所有功能：
# - 页面加载
# - 用户认证
# - 花盆管理
# - API调用
```

#### 2. 部署到生产环境
```bash
# 方法一：分步部署
npm run upload-static    # 上传静态资源
npm run deploy          # 部署Worker

# 方法二：一键部署
npm run deploy-all

# 输出示例：
# ⛅️ wrangler 4.47.0
# --------------------
# Total Upload: 1.24 KiB / gzip: 0.68 KiB
# Uploaded my-flower-pots-api (2.19 sec)
# Published my-flower-pots-api (4.53 sec)
#   https://my-flower-pots-api.<your-username>.workers.dev
```

#### 3. 验证部署
```bash
# 测试生产环境API
curl -X POST https://my-flower-pots-api.<your-username>.workers.dev/api/auth/identify \
  -H "Content-Type: application/json" \
  -d "{}"

# 测试生产环境前端
open https://my-flower-pots-api.<your-username>.workers.dev/
```

### 阶段五：配置自定义域名（可选）

#### 1. 添加自定义域名
```bash
# 在wrangler.toml中添加
routes = [
  { pattern = "flowerpots.yourdomain.com", zone_name = "yourdomain.com" }
]

# 或者使用Dashboard配置：
# 1. 进入 Workers & Pages → 你的Worker
# 2. 点击 "Triggers" 标签
# 3. 在 "Custom Domains" 部分添加域名
```

#### 2. 配置DNS记录
```
# 在Cloudflare DNS中添加CNAME记录
名称: flowerpots
目标: my-flower-pots-api.<your-username>.workers.dev
代理状态: 已代理（橙色云）
TTL: 自动
```

#### 3. 更新前端配置
由于项目采用了动态配置机制，请从模板创建配置文件：

```bash
cp frontend/js/config.js.example frontend/js/config.js
```

然后在 `frontend/js/config.js` 中更新 `prodUrl`：
```javascript
const API_CONFIG = {
    api: {
        prodUrl: 'https://flowerpots.yourdomain.com', // 使用您的真实域名
        // ...
    }
};
```
> [!NOTE]
> `api-client.js` 会自动读取此配置，无需手动修改代码。

## 🔧 故障排除

### 常见问题及解决方案

#### 1. R2上传失败
```bash
# 错误：认证失败
# 解决方案：检查R2_ACCESS_KEY_ID和R2_SECRET_ACCESS_KEY

# 错误：存储桶不存在
# 解决方案：验证存储桶名称是否正确，或创建新存储桶
wrangler r2 bucket list
# 如果确实需要创建（不推荐，因为您已有存储桶）：
# wrangler r2 bucket create my-flower-pots
```

#### 2. Worker部署失败
```bash
# 错误：数据库绑定失败
# 解决方案：检查wrangler.toml中的database_id

# 错误：权限不足
# 解决方案：确保wrangler login已执行
```

#### 3. 前端页面404
```bash
# 问题：静态资源未上传
# 解决方案：运行 npm run upload-static

# 问题：Content-Type不正确
# 解决方案：检查上传时的content-type参数
```

#### 4. API返回错误
```bash
# 错误：CORS问题
# 解决方案：检查response-utils.ts中的CORS头

# 错误：数据库查询失败
# 解决方案：运行 npm run migrate 初始化数据库
```

## 📊 监控和维护

### 1. 监控指标
- **Worker请求**：Cloudflare Dashboard → Workers Analytics
- **R2存储**：Cloudflare Dashboard → R2 Analytics
- **D1查询**：Cloudflare Dashboard → D1 Analytics
- **错误日志**：Worker日志和浏览器控制台

### 2. 定期维护
```bash
# 更新依赖
npm update

# 备份数据库
wrangler d1 export my-flower-pots-db --output=backup.sql

# 清理旧文件
# 在R2 Dashboard中管理文件生命周期
```

### 3. 性能优化
- 启用R2智能分层
- 配置Worker缓存策略
- 优化数据库索引
- 压缩静态资源

## 🚨 紧急恢复

### 数据库恢复
```bash
# 从备份恢复
wrangler d1 execute my-flower-pots-db --file=backup.sql

# 重新初始化
npm run migrate
```

### 静态资源恢复
```bash
# 重新上传所有文件
npm run upload-static

# 或从本地备份恢复
cp -r backup/frontend/* frontend/
npm run upload-static
```

### Worker回滚
```bash
# 查看部署历史
wrangler deployments list

# 回滚到指定版本
wrangler rollback --version <version-id>
```

## 📞 支持资源

### 官方文档
- [Cloudflare Workers文档](https://developers.cloudflare.com/workers/)
- [D1数据库文档](https://developers.cloudflare.com/d1/)
- [R2存储文档](https://developers.cloudflare.com/r2/)

### 社区支持
- [Cloudflare社区论坛](https://community.cloudflare.com/)
- [GitHub Issues](https://github.com/your-username/my-flower-pots/issues)

---

**🌱 部署成功！现在可以通过以下地址访问你的应用：**

- 开发环境：http://127.0.0.1:8787
- 生产环境：https://my-flower-pots-api.<your-username>.workers.dev
- 自定义域名：https://flowerpots.yourdomain.com（如已配置）

**祝你的花盆茁壮成长！**
