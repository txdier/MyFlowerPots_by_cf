# My Flower Pots (我的花盆) 🌱

这是一个从微信小程序完整迁移到现代 Web 架构的全栈植物养护管理应用。

- **全栈 Serverless**: 基于 Cloudflare Workers + D1 数据库 + R2 存储，部署成本几乎为零。
- **现代化 UI**: 采用 Vue 3 + Tailwind CSS 打造的响应式视觉设计，适配移动端和桌面端。


## 🏗️ 技术架构

- **后端**: [Cloudflare Workers](https://workers.cloudflare.com/) (TypeScript)
- **数据库**: [Cloudflare D1](https://developers.cloudflare.com/d1/) (SQLite 兼容)
- **存储**: [Cloudflare R2](https://developers.cloudflare.com/r2/) (S3 兼容)
- **前端**: Vue 3 + Tailwind CSS + Font Awesome 6
- **部署**: 自研批量增量上传脚本 (`upload-static-wrangler.js`)

## 🚀 快速开始

### 1. 环境配置
```bash
# 安装依赖
npm install

# 登录 Cloudflare
npx wrangler login
```

### 2. 配置文件
由于项目安全性加固，`config.js` 已被忽略。请从模板创建：
```bash
cp frontend/js/config.js.example frontend/js/config.js
# 然后在 config.js 中填入您的真实生产域名
```

### 3. 本地开发
```bash
npx wrangler dev
```

### 4. 部署
```bash
# 自动执行 CSS 构建及资源同步
npm run upload
```

## 📖 详细指南

- [部署总指南](./DEPLOYMENT_GUIDE.md) - 从零开始的完整部署流程
- [配置指南](./DEPLOYMENT_CONFIGURATION.md) - D1、R2 和环境变量的详细配置
- [上传脚本说明](./README-UPLOAD-WRANGLER.md) - 详解静态资源同步逻辑
- [前端迁移文档](./README-FRONTEND-MIGRATION.md) - 记录前端演进历程
- [API 迁移文档](./README-API-MIGRATION.md) - 记录后端逻辑迁移

---

**🌱 让每一株植物都被精心照料！**
