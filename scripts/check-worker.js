#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const wranglerBin = require.resolve("wrangler/bin/wrangler.js");
const outDir = path.join("Temp", "wrangler-dry-run");
const wranglerLogPath = path.join("Temp", "wrangler-logs");
mkdirSync(wranglerLogPath, { recursive: true });

const result = spawnSync(process.execPath, [
  wranglerBin,
  "deploy",
  "--dry-run",
  "--outdir",
  outDir,
], {
  encoding: "utf8",
  env: {
    ...process.env,
    WRANGLER_LOG_PATH: process.env.WRANGLER_LOG_PATH || wranglerLogPath,
  },
  shell: false,
  stdio: "inherit",
  windowsHide: true,
});

if (result.error) {
  throw result.error;
}

process.exit(result.status || 0);
