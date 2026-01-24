# Wrangler批量上传脚本使用指南

## 概述

`upload-static-wrangler.js` 是一个使用 Cloudflare Wrangler CLI 批量上传前端静态资源到 R2 存储桶的脚本。这个脚本具有以下优势：

- ✅ **使用wrangler CLI**：直接使用项目配置的wrangler，无需额外配置R2凭证
- ✅ **并行上传**：支持多文件并发上传，提高上传速度
- ✅ **增量上传**：通过文件哈希比较，只上传修改过的文件
- ✅ **进度显示**：实时显示上传进度和统计信息
- ✅ **自动重试**：上传失败时自动重试（最多3次）

## 快速开始

### 安装依赖
确保已安装 Node.js 和 wrangler：
```bash
npm install
```

### 上传前端文件
```bash
# 使用npm脚本（推荐）
npm run upload

# 或直接运行脚本
node upload-static-wrangler.js
```

### 完整部署（上传 + 部署Worker）
```bash
npm run deploy-full
```

## 可用命令

| 命令 | 说明 |
|------|------|
| `npm run upload` | 使用wrangler上传前端文件到R2（增量上传） |
| `npm run upload-wrangler` | 同上，直接调用脚本 |
| `npm run upload-static` | 使用原有脚本上传（AWS SDK方式） |
| `npm run deploy-full` | 上传前端文件 + 部署Worker |
| `npm run deploy-all` | 使用原有脚本上传 + 部署Worker |
| `npm run deploy` | 仅部署Worker |

## 功能特性

### 1. 增量上传
脚本会自动创建 `.upload-cache.json` 文件记录已上传文件的哈希值。下次运行时，只会重新上传修改过的文件。

**示例输出：**
```
⏭️  跳过 (未修改): index.html
⏭️  跳过 (未修改): css/app.css
✅ 上传成功: js/app.js  # 只有修改过的文件会被上传
```

### 2. 并行上传
默认使用5个并发线程上传文件，可显著提高上传速度。

**配置修改：**
```javascript
// 在 upload-static-wrangler.js 中修改
const config = {
    maxConcurrent: 10, // 增加并发数
    // ...
};
```

### 3. 进度显示
实时显示上传进度：
```
📊 进度: 15/23 (65%) | ✅ 12 | ❌ 0 | ⏭️ 3
```

### 4. 错误处理和重试
上传失败时会自动重试（最多3次），并显示详细的错误信息。

## 配置说明

脚本的主要配置在文件顶部的 `config` 对象中：

```javascript
const config = {
    bucketName: 'my-flower-pots',          // R2存储桶名称
    frontendDir: join(__dirname, 'frontend'), // 前端目录
    excludeExtensions: ['.js.map', ...],   // 排除的文件扩展名
    excludeDirs: ['node_modules', ...],    // 排除的目录
    maxConcurrent: 5,                      // 最大并发数
    retryCount: 3,                         // 重试次数
    cacheFile: '.upload-cache.json',       // 增量上传缓存文件
};
```

### 自定义配置

1. **修改存储桶名称**：如果使用不同的R2存储桶，修改 `bucketName`
2. **调整并发数**：根据网络情况调整 `maxConcurrent`
3. **排除文件/目录**：在 `excludeExtensions` 和 `excludeDirs` 中添加需要排除的内容

## 使用场景

### 场景1：开发环境快速上传
```bash
# 修改文件后快速上传
npm run upload
```

### 场景2：生产环境部署
```bash
# 完整部署流程
npm run deploy-full
```

### 场景3：强制重新上传所有文件
```bash
# 删除缓存文件后运行
rm .upload-cache.json
npm run upload
```


## 常见问题

### Q1: 上传速度慢怎么办？
A: 可以增加并发数，修改 `config.maxConcurrent` 为更大的值（如10）。

### Q2: 如何跳过特定文件？
A: 在 `config.excludeExtensions` 中添加文件扩展名，或在 `config.excludeDirs` 中添加目录名。

### Q3: 上传失败如何排查？
A: 检查以下问题：
1. 确保已登录wrangler：`npx wrangler login`
2. 检查R2存储桶是否存在
3. 查看详细的错误信息输出

### Q4: 如何清除上传缓存？
A: 删除 `.upload-cache.json` 文件即可。

## 高级用法

### 1. 自定义Content-Type
如果需要添加新的文件类型支持，在 `config.contentTypeMap` 中添加对应的MIME类型：

```javascript
contentTypeMap: {
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    // ... 添加其他类型
}
```

### 2. 环境变量覆盖
可以通过环境变量覆盖配置：

```bash
# 临时修改并发数
MAX_CONCURRENT=10 node upload-static-wrangler.js

# 临时修改存储桶
BUCKET_NAME=my-other-bucket node upload-static-wrangler.js
```

### 3. 集成到CI/CD
在GitHub Actions或其他CI/CD工具中使用：

```yaml
# GitHub Actions示例
- name: Upload to R2
  run: npm run upload
  env:
    CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

## 性能数据

基于测试环境的数据：
- 23个文件（总计约2MB）
- 首次上传：约17秒
- 增量上传：约0.5秒
- 并发数：5个线程

## 技术支持

如有问题，请检查：
1. 控制台输出的错误信息
2. 确保wrangler已正确配置
3. 检查网络连接和权限

脚本设计为健壮且易于调试，大多数问题都可以通过控制台输出解决。
