#!/usr/bin/env node

import { mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
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

const wranglerConfigPath = path.resolve(
  rootDir,
  process.env.WRANGLER_CONFIG || "wrangler.toml"
);
const d1Binding = process.env.D1_BINDING || "DB";
const keepDays = Number(process.env.BACKUP_KEEP_DAYS || 7);
const dryRun = process.argv.includes("--dry-run");

function stripTomlComment(line) {
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escaped = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (inDoubleQuote && char === "\\") {
      escaped = true;
      continue;
    }

    if (!inDoubleQuote && char === "'") {
      inSingleQuote = !inSingleQuote;
      continue;
    }

    if (!inSingleQuote && char === '"') {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote && char === "#") {
      return line.slice(0, i);
    }
  }

  return line;
}

function parseTomlValue(value) {
  const trimmed = value.trim();

  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return JSON.parse(trimmed);
  }

  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function parseD1Databases(toml) {
  const databases = [];
  let current = null;

  const flushCurrent = () => {
    if (current) {
      databases.push(current);
      current = null;
    }
  };

  for (const rawLine of toml.split(/\r?\n/)) {
    const line = stripTomlComment(rawLine).trim();
    if (!line) {
      continue;
    }

    const arrayTableMatch = line.match(/^\[\[\s*([^\]]+?)\s*\]\]$/);
    if (arrayTableMatch) {
      flushCurrent();
      current = arrayTableMatch[1] === "d1_databases" ? {} : null;
      continue;
    }

    const tableMatch = line.match(/^\[\s*([^\]]+?)\s*\]$/);
    if (tableMatch) {
      flushCurrent();
      continue;
    }

    if (!current) {
      continue;
    }

    const keyValueMatch = line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.+)$/);
    if (keyValueMatch) {
      current[keyValueMatch[1]] = parseTomlValue(keyValueMatch[2]);
    }
  }

  flushCurrent();
  return databases;
}

async function resolveDatabaseName() {
  if (process.env.D1_DATABASE_NAME) {
    return {
      databaseName: process.env.D1_DATABASE_NAME,
      source: "D1_DATABASE_NAME"
    };
  }

  const wranglerConfig = await readFile(wranglerConfigPath, "utf8");
  const databases = parseD1Databases(wranglerConfig);
  const database = databases.find((item) => item.binding === d1Binding);

  if (!database?.database_name) {
    const bindings = databases
      .map((item) => item.binding)
      .filter(Boolean)
      .join(", ");

    throw new Error(
      `D1 database binding "${d1Binding}" was not found in ${wranglerConfigPath}.` +
        (bindings ? ` Available bindings: ${bindings}.` : "")
    );
  }

  return {
    databaseName: database.database_name,
    source: `${path.relative(rootDir, wranglerConfigPath)} binding "${d1Binding}"`
  };
}

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

function runWranglerExport(databaseName, outputFile) {
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
  const { databaseName, source } = await resolveDatabaseName();

  await mkdir(backupsDir, { recursive: true });

  const backupFile = path.join(
    backupsDir,
    `db-backup-${createTimestamp()}.sql`
  );

  console.log(`Starting backup for D1 database: ${databaseName}`);
  console.log(`Database source: ${source}`);
  console.log(`Backup file: ${backupFile}`);

  if (dryRun) {
    console.log("Dry run enabled. Skipping wrangler export and cleanup.");
    return;
  }

  await runWranglerExport(databaseName, backupFile);
  await cleanupOldBackups(backupsDir, keepDays);

  console.log("Backup completed successfully.");
}

main().catch((error) => {
  console.error("Backup failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
