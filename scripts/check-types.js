#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const tscBin = require.resolve("typescript/bin/tsc");

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: false,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  return result.status || 0;
}

function listTrackedSourceFiles() {
  const result = spawnSync("git", ["ls-files", "src/**/*.ts"], {
    encoding: "utf8",
    shell: false,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(result.stderr || "git ls-files failed");
  }

  return result.stdout.split(/\r?\n/).filter(Boolean);
}

const filesIndex = process.argv.indexOf("--files");
const files = filesIndex === -1
  ? listTrackedSourceFiles()
  : process.argv.slice(filesIndex + 1).filter(Boolean);

if (files.length === 0) {
  console.log("No TypeScript files to check.");
  process.exit(0);
}

const args = [
  tscBin,
  "--noEmit",
  "--target", "ES2022",
  "--module", "ESNext",
  "--moduleResolution", "bundler",
  "--lib", "ES2022,WebWorker",
  "--skipLibCheck",
  ...files,
];

process.exit(run(process.execPath, args));
