#!/usr/bin/env node

import { constants, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const localFiles = [
  { source: '.dev.vars.example', target: '.dev.vars' },
];

export function setupLocalFiles({ rootDir = process.cwd(), log = console.log } = {}) {
  const pending = localFiles.filter(({ target }) => !existsSync(join(rootDir, target)));

  for (const { source } of pending) {
    if (!existsSync(join(rootDir, source))) {
      throw new Error(`模板文件不存在：${source}`);
    }
  }

  const created = [];
  const skipped = [];

  for (const { source, target } of localFiles) {
    const targetPath = join(rootDir, target);
    if (existsSync(targetPath)) {
      skipped.push(target);
      log(`已跳过（文件已存在）：${target}`);
      continue;
    }

    mkdirSync(dirname(targetPath), { recursive: true });
    copyFileSync(join(rootDir, source), targetPath, constants.COPYFILE_EXCL);
    created.push(target);
    log(`已创建：${target}`);
  }

  return { created, skipped };
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (entryPath === fileURLToPath(import.meta.url)) {
  try {
    setupLocalFiles();
    console.log('本地配置初始化完成。请按需填写个人开发配置。');
  } catch (error) {
    console.error(`本地配置初始化失败：${error.message}`);
    process.exitCode = 1;
  }
}
