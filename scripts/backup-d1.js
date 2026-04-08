#!/usr/bin/env node

import { mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const backupsDir = path.join(rootDir, "backups");
const require = createRequire(import.meta.url);
const wranglerBin = require.resolve("wrangler/bin/wrangler.js");

const databaseName = process.env.D1_DATABASE_NAME || "my-flower-pots-db";
const keepDays = Number(process.env.BACKUP_KEEP_DAYS || 7);

function pad(value) {
  return String(value).padStart(2, "0");
}

function createTimestamp() {
  const now = new Date();
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("-");
}

async function cleanupOldBackups(directory, retentionDays) {
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
    return;
  }

  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".sql")) {
      continue;
    }

    const filePath = path.join(directory, entry.name);
    const fileInfo = await stat(filePath);

    if (fileInfo.mtimeMs < cutoff) {
      await rm(filePath);
      console.log(`Deleted old backup: ${entry.name}`);
    }
  }
}

function runWranglerExport(outputFile) {
  const command = process.execPath;
  const args = [
    wranglerBin,
    "d1",
    "export",
    databaseName,
    "--remote",
    "--output",
    outputFile,
  ];

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: "inherit",
      windowsHide: true,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`wrangler d1 export exited with code ${code}`));
    });
  });
}

async function main() {
  await mkdir(backupsDir, { recursive: true });

  const backupFile = path.join(
    backupsDir,
    `db-backup-${createTimestamp()}.sql`
  );

  console.log(`Starting backup for D1 database: ${databaseName}`);
  console.log(`Backup file: ${backupFile}`);

  await runWranglerExport(backupFile);
  await cleanupOldBackups(backupsDir, keepDays);

  console.log("Backup completed successfully.");
}

main().catch((error) => {
  console.error("Backup failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
