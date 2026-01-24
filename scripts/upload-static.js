#!/usr/bin/env node

import { createReadStream, readdirSync, statSync } from 'fs';
import { join, relative, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 配置
const config = {
    bucketName: 'my-flower-pots',
    frontendDir: join(__dirname, '..', 'frontend'),
    excludeExtensions: ['.js.map', '.css.map', '.ts', '.tsx'],
    excludeDirs: ['node_modules', '.git', '__pycache__'],
    contentTypeMap: {
        '.html': 'text/html;charset=UTF-8',
        '.htm': 'text/html;charset=UTF-8',
        '.js': 'application/javascript',
        '.mjs': 'application/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
        '.txt': 'text/plain',
        '.pdf': 'application/pdf',
        '.zip': 'application/zip',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2',
        '.ttf': 'font/ttf',
        '.eot': 'application/vnd.ms-fontobject',
        '.otf': 'font/otf',
    }
};

// 初始化S3客户端（使用Cloudflare R2兼容的S3 API）
const s3Client = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT || 'https://<account-id>.r2.cloudflarestorage.com',
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID || 'your-access-key-id',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || 'your-secret-access-key',
    },
});

// 获取所有文件
function getAllFiles(dir, fileList = []) {
    const files = readdirSync(dir);
    
    files.forEach(file => {
        const filePath = join(dir, file);
        const stat = statSync(filePath);
        
        if (stat.isDirectory()) {
            // 检查是否在排除目录中
            const dirName = file;
            if (!config.excludeDirs.includes(dirName)) {
                getAllFiles(filePath, fileList);
            }
        } else {
            // 检查文件扩展名
            const ext = extname(file).toLowerCase();
            if (!config.excludeExtensions.includes(ext)) {
                fileList.push(filePath);
            }
        }
    });
    
    return fileList;
}

// 获取Content-Type
function getContentType(filePath) {
    const ext = extname(filePath).toLowerCase();
    return config.contentTypeMap[ext] || 'application/octet-stream';
}

// 上传文件到R2
async function uploadFile(filePath) {
    const relativePath = relative(config.frontendDir, filePath);
    const key = relativePath.replace(/\\/g, '/'); // Windows路径转换
    
    const contentType = getContentType(filePath);
    const fileStream = createReadStream(filePath);
    
    const command = new PutObjectCommand({
        Bucket: config.bucketName,
        Key: key,
        Body: fileStream,
        ContentType: contentType,
        CacheControl: 'public, max-age=3600',
    });
    
    try {
        await s3Client.send(command);
        console.log(`✅ 上传成功: ${key} (${contentType})`);
        return true;
    } catch (error) {
        console.error(`❌ 上传失败: ${key}`, error.message);
        return false;
    }
}

// 主函数
async function main() {
    console.log('🚀 开始上传前端静态资源到R2...');
    console.log(`📁 源目录: ${config.frontendDir}`);
    console.log(`📦 存储桶: ${config.bucketName}`);
    console.log('─'.repeat(50));
    
    // 检查环境变量
    if (!process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
        console.warn('⚠️  警告: R2_ACCESS_KEY_ID 或 R2_SECRET_ACCESS_KEY 环境变量未设置');
        console.warn('   请设置环境变量或直接在脚本中配置凭据');
        console.warn('   使用示例:');
        console.warn('   export R2_ACCESS_KEY_ID="your-access-key-id"');
        console.warn('   export R2_SECRET_ACCESS_KEY="your-secret-access-key"');
        console.warn('   export R2_ENDPOINT="https://<account-id>.r2.cloudflarestorage.com"');
        console.log('─'.repeat(50));
    }
    
    // 获取所有文件
    const files = getAllFiles(config.frontendDir);
    console.log(`📄 找到 ${files.length} 个文件需要上传`);
    
    if (files.length === 0) {
        console.log('❌ 没有找到需要上传的文件');
        return;
    }
    
    // 上传文件
    let successCount = 0;
    let failCount = 0;
    
    for (const file of files) {
        const success = await uploadFile(file);
        if (success) {
            successCount++;
        } else {
            failCount++;
        }
    }
    
    // 输出结果
    console.log('─'.repeat(50));
    console.log('📊 上传完成!');
    console.log(`✅ 成功: ${successCount} 个文件`);
    if (failCount > 0) {
        console.log(`❌ 失败: ${failCount} 个文件`);
    }
    
    // 提供访问URL
    console.log('─'.repeat(50));
    console.log('🌐 访问地址:');
    console.log(`   主页面: https://my-flower-pots-api.your-username.workers.dev/`);
    console.log(`   API文档: https://my-flower-pots-api.your-username.workers.dev/api/`);
    console.log('─'.repeat(50));
}

// 运行主函数
main().catch(error => {
    console.error('❌ 脚本执行失败:', error);
    process.exit(1);
});
