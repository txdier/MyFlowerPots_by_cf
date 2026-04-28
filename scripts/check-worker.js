#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const wranglerBin = require.resolve("wrangler/bin/wrangler.js");
const outDir = path.join("Temp", "wrangler-dry-run");

const result = spawnSync(process.execPath, [
  wranglerBin,
  "deploy",
  "--dry-run",
  "--outdir",
  outDir,
], {
  encoding: "utf8",
  shell: false,
  stdio: "inherit",
  windowsHide: true,
});

if (result.error) {
  throw result.error;
}

process.exit(result.status || 0);
