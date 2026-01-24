#!/usr/bin/env node

import { createReadStream, readdirSync, statSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join, relative, extname, dirname } from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const execAsync = promisify(exec);

// 配置
const config = {
    bucketName: 'my-flower-pots',
    frontendDir: join(__dirname, 'frontend'),
    excludeExtensions: ['.js.map', '.css.map', '.ts', '.tsx', '.md'],
    excludeDirs: ['node_modules', '.git', '__pycache__', '.DS_Store'],
    excludeFiles: ['tailwind-input.css'],
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
    },
    // 上传配置
    maxConcurrent: 5, // 最大并发数
    retryCount: 3,    // 重试次数
    cacheFile: join(__dirname, '.upload-cache.json'), // 增量上传缓存文件
};

// 获取所有文件
function getAllFiles(dir, fileList = []) {
    if (!existsSync(dir)) {
        console.error(`❌ 目录不存在: ${dir}`);
        return fileList;
    }

    const files = readdirSync(dir);

    files.forEach(file => {
        const filePath = join(dir, file);

        try {
            const stat = statSync(filePath);

            if (stat.isDirectory()) {
                // 检查是否在排除目录中
                const dirName = file;
                if (!config.excludeDirs.includes(dirName)) {
                    getAllFiles(filePath, fileList);
                }
            } else {
                // 检查是否在排除文件中
                if (config.excludeFiles && config.excludeFiles.includes(file)) {
                    return;
                }

                // 检查文件扩展名
                const ext = extname(file).toLowerCase();
                if (!config.excludeExtensions.includes(ext)) {
                    fileList.push(filePath);
                }
            }
        } catch (error) {
            console.warn(`⚠️  无法访问文件 ${filePath}: ${error.message}`);
        }
    });

    return fileList;
}

// 计算文件哈希（用于增量上传）
function calculateFileHash(filePath) {
    try {
        const fileBuffer = readFileSync(filePath);
        const hashSum = crypto.createHash('sha256');
        hashSum.update(fileBuffer);
        return hashSum.digest('hex');
    } catch (error) {
        console.warn(`⚠️  无法计算文件哈希 ${filePath}: ${error.message}`);
        return null;
    }
}

// 加载上传缓存
function loadUploadCache() {
    if (!existsSync(config.cacheFile)) {
        return {};
    }

    try {
        const cacheData = readFileSync(config.cacheFile, 'utf8');
        return JSON.parse(cacheData);
    } catch (error) {
        console.warn(`⚠️  无法加载上传缓存: ${error.message}`);
        return {};
    }
}

// 保存上传缓存
function saveUploadCache(cache) {
    try {
        const cacheData = JSON.stringify(cache, null, 2);
        writeFileSync(config.cacheFile, cacheData, 'utf8');
    } catch (error) {
        console.warn(`⚠️  无法保存上传缓存: ${error.message}`);
    }
}

// 获取Content-Type
function getContentType(filePath) {
    const ext = extname(filePath).toLowerCase();
    return config.contentTypeMap[ext] || 'application/octet-stream';
}

// 构建wrangler上传命令
function buildWranglerCommand(filePath, key) {
    const contentType = getContentType(filePath);
    const relativePath = relative(config.frontendDir, filePath);

    // 构建命令 - 确保 --remote 参数在正确位置
    const command = `npx wrangler r2 object put ${config.bucketName}/${key} --file "${filePath}" --content-type "${contentType}" --cache-control "public, max-age=3600" --remote`;

    return command;
}

// 执行wrangler命令
async function executeWranglerCommand(command, retry = 0) {
    try {
        const { stdout, stderr } = await execAsync(command);

        if (stderr && !stderr.includes('warning')) {
            console.warn(`⚠️  命令警告: ${stderr.trim()}`);
        }

        return { success: true, stdout: stdout.trim() };
    } catch (error) {
        if (retry < config.retryCount) {
            console.log(`🔄 重试上传 (${retry + 1}/${config.retryCount})...`);
            await new Promise(resolve => setTimeout(resolve, 1000 * (retry + 1)));
            return executeWranglerCommand(command, retry + 1);
        }

        return {
            success: false,
            error: error.message,
            stderr: error.stderr ? error.stderr.trim() : '',
            stdout: error.stdout ? error.stdout.trim() : ''
        };
    }
}

// 上传单个文件
async function uploadFile(filePath, cache, stats) {
    const relativePath = relative(config.frontendDir, filePath);
    const key = relativePath.replace(/\\/g, '/'); // Windows路径转换

    // 检查是否需要增量上传
    const fileHash = calculateFileHash(filePath);
    const cachedHash = cache[key];

    if (fileHash && cachedHash === fileHash) {
        stats.skipped++;
        console.log(`⏭️  跳过 (未修改): ${key}`);
        return { success: true, skipped: true };
    }

    // 构建并执行命令
    const command = buildWranglerCommand(filePath, key);
    const result = await executeWranglerCommand(command);

    if (result.success) {
        stats.success++;

        // 更新缓存
        if (fileHash) {
            cache[key] = fileHash;
        }

        console.log(`✅ 上传成功: ${key}`);
        return { success: true, key, fileHash };
    } else {
        stats.failed++;
        console.error(`❌ 上传失败: ${key}`, result.error);
        return { success: false, key, error: result.error };
    }
}

// 并行上传控制
async function uploadFilesParallel(files, cache) {
    const stats = {
        total: files.length,
        success: 0,
        failed: 0,
        skipped: 0
    };

    console.log(`🚀 开始上传 ${files.length} 个文件 (并发数: ${config.maxConcurrent})...`);

    // 创建上传队列
    const queue = [...files];
    const active = new Set();
    const results = [];

    // 进度显示
    let processed = 0;
    const updateProgress = () => {
        const percent = Math.round((processed / files.length) * 100);
        process.stdout.write(`\r📊 进度: ${processed}/${files.length} (${percent}%) | ✅ ${stats.success} | ❌ ${stats.failed} | ⏭️ ${stats.skipped}`);
    };

    // 上传任务
    const uploadTask = async (filePath) => {
        active.add(filePath);
        const result = await uploadFile(filePath, cache, stats);
        active.delete(filePath);
        processed++;
        updateProgress();
        return result;
    };

    // 启动上传
    while (queue.length > 0 || active.size > 0) {
        // 填充活动任务
        while (active.size < config.maxConcurrent && queue.length > 0) {
            const filePath = queue.shift();
            uploadTask(filePath).then(result => {
                results.push(result);
            });
        }

        // 等待一段时间
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    // 完成进度显示
    process.stdout.write('\n');

    return { stats, results };
}

// 主函数
async function main() {
    console.log('🚀 Wrangler批量上传脚本启动...');
    console.log(`📁 源目录: ${config.frontendDir}`);
    console.log(`📦 存储桶: ${config.bucketName}`);
    console.log(`⚡ 并发数: ${config.maxConcurrent}`);
    console.log('─'.repeat(60));

    // 检查目录是否存在
    if (!existsSync(config.frontendDir)) {
        console.error(`❌ 前端目录不存在: ${config.frontendDir}`);
        console.log('请确保frontend目录存在，或修改脚本中的frontendDir配置');
        process.exit(1);
    }

    // 获取所有文件
    console.log('🔍 扫描文件...');
    const files = getAllFiles(config.frontendDir);

    if (files.length === 0) {
        console.log('❌ 没有找到需要上传的文件');
        return;
    }

    console.log(`📄 找到 ${files.length} 个文件`);

    // 加载上传缓存
    const cache = loadUploadCache();
    console.log(`📋 加载上传缓存: ${Object.keys(cache).length} 个已记录文件`);

    // 上传文件
    console.log('─'.repeat(60));
    const startTime = Date.now();

    const { stats, results } = await uploadFilesParallel(files, cache);

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    // 保存上传缓存
    saveUploadCache(cache);

    // 输出结果
    console.log('─'.repeat(60));
    console.log('📊 上传完成!');
    console.log(`⏱️  耗时: ${duration} 秒`);
    console.log(`📄 总计: ${stats.total} 个文件`);
    console.log(`✅ 成功: ${stats.success} 个文件`);
    console.log(`❌ 失败: ${stats.failed} 个文件`);
    console.log(`⏭️  跳过: ${stats.skipped} 个文件 (增量上传)`);

    if (stats.failed > 0) {
        console.log('\n❌ 失败的文件:');
        results.filter(r => !r.success && !r.skipped).forEach(r => {
            console.log(`   - ${r.key}: ${r.error}`);
        });
    }

    // 提供访问信息
    console.log('─'.repeat(60));
    console.log('🌐 访问地址:');
    console.log(`   主页面: https://my-flower-pots-api.qiao-li.workers.dev/`);
    console.log(`   R2管理: https://dash.cloudflare.com/`);
    console.log('─'.repeat(60));

    // 退出码
    if (stats.failed > 0) {
        process.exit(1);
    }
}

// 运行主函数
main().catch(error => {
    console.error('❌ 脚本执行失败:', error);
    process.exit(1);
});
