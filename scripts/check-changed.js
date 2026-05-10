#!/usr/bin/env node

import { spawnSync } from "node:child_process";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: false,
    stdio: options.capture ? "pipe" : "inherit",
    windowsHide: true,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0 && !options.allowFailure) {
    process.exit(result.status || 1);
  }

  return result;
}

function capture(command, args, options = {}) {
  const result = run(command, args, { ...options, capture: true });
  return result.stdout || "";
}

function runNpm(args) {
  if (process.platform === "win32") {
    run("cmd.exe", ["/d", "/s", "/c", "npm.cmd", ...args]);
    return;
  }

  run("npm", args);
}

function splitFiles(output) {
  return output
    .split(/\r?\n/)
    .map((file) => file.trim().replace(/\\/g, "/"))
    .filter(Boolean);
}

const changed = new Set([
  ...splitFiles(capture("git", ["diff", "--name-only", "--diff-filter=ACMR", "HEAD", "--"], { allowFailure: true })),
  ...splitFiles(capture("git", ["ls-files", "--others", "--exclude-standard"], { allowFailure: true })),
]);

if (changed.size === 0) {
  console.log("No changed files detected.");
  process.exit(0);
}

const files = Array.from(changed);
const frontendFiles = files.filter((file) =>
  (file.startsWith("frontend/js/") && file.endsWith(".js")) ||
  (file.startsWith("frontend/") && file.endsWith(".html"))
);
const tsFiles = files.filter((file) => file.startsWith("src/") && file.endsWith(".ts"));
const testFiles = files.filter((file) => /^tests\/unit\/.*\.test\.(js|ts)$/.test(file));
const workerTestFiles = files.filter((file) => /^tests\/worker\/.*\.test\.ts$/.test(file));
const smokeTestFiles = files.filter((file) => /^tests\/smoke\/.*\.test\.ts$/.test(file));
const apiTestFiles = files.filter((file) => /^tests\/api\/.*\.test\.ts$/.test(file));
const unitTestSourceFiles = new Set([
  "frontend/js/care-utils.js",
  "frontend/js/date-utils.js",
  "frontend/js/form-utils.js",
  "frontend/js/pwa-diagnostics.js",
  "frontend/js/pot-permissions.js",
  "src/utils/auth-utils.ts",
  "scripts/check-static-routes.js",
]);
const smokeTestSourceFiles = new Set([
  "src/index.ts",
  "src/api/auth.ts",
  "src/api/pots.ts",
  "src/api/care-records.ts",
  "src/api/care-schedules.ts",
  "src/api/timelines.ts",
  "src/api/share.ts",
  "src/api/collaborators.ts",
  "src/api/viewers.ts",
  "src/api/messages.ts",
  "src/api/plants.ts",
  "src/utils/d1-session-utils.ts",
]);
const apiTestSourceFiles = new Set([
  "src/index.ts",
  "src/utils/auth-utils.ts",
  "src/utils/d1-session-utils.ts",
  "src/utils/pot-access-utils.ts",
  "src/utils/response-utils.ts",
  "src/utils/storage-utils.ts",
  "src/utils/email-service.ts",
]);
const needsCssBuild = files.some((file) =>
  file === "frontend/css/tailwind-input.css" ||
  file.startsWith("frontend/") && file.endsWith(".html")
);
const needsWorkerDryRun = files.some((file) =>
  file === "wrangler.toml" ||
  file === "package.json" ||
  file.startsWith("src/") ||
  file.startsWith("migrations/")
);
const needsUnitTests = testFiles.length > 0 ||
  files.includes("package.json") ||
  files.includes("vitest.unit.config.ts") ||
  files.some((file) => unitTestSourceFiles.has(file));
const needsWorkerTests = workerTestFiles.length > 0 ||
  files.includes("package.json") ||
  files.includes("vitest.worker.config.ts") ||
  files.includes("wrangler.toml") ||
  files.includes("src/index.ts");
const needsSmokeTests = smokeTestFiles.length > 0 ||
  files.includes("package.json") ||
  files.includes("vitest.smoke.config.ts") ||
  files.includes("wrangler.toml") ||
  files.some((file) =>
    smokeTestSourceFiles.has(file) ||
    file.startsWith("migrations/")
  );
const needsApiTests = apiTestFiles.length > 0 ||
  files.includes("package.json") ||
  files.includes("vitest.api.config.ts") ||
  files.includes("wrangler.toml") ||
  files.some((file) =>
    file.startsWith("src/api/") ||
    file.startsWith("migrations/") ||
    apiTestSourceFiles.has(file)
  );
const needsRouteCheck = files.some((file) =>
  file === "src/index.ts" ||
  file === "wrangler.toml" ||
  file === "scripts/check-static-routes.js"
);

run("git", ["diff", "--check"]);

if (needsRouteCheck) {
  run(process.execPath, ["scripts/check-static-routes.js"]);
}

if (frontendFiles.length > 0) {
  run(process.execPath, ["scripts/check-frontend.js", "--files", ...frontendFiles]);
}

if (tsFiles.length > 0) {
  run(process.execPath, ["scripts/check-types.js", "--files", ...tsFiles]);
}

if (needsCssBuild) {
  runNpm(["run", "build-css"]);
}

if (needsUnitTests) {
  runNpm(testFiles.length > 0
    ? ["run", "test:unit", "--", ...testFiles]
    : ["run", "test:unit"]);
}

if (needsWorkerTests) {
  runNpm(workerTestFiles.length > 0
    ? ["run", "test:worker", "--", ...workerTestFiles]
    : ["run", "test:worker"]);
}

if (needsSmokeTests) {
  runNpm(smokeTestFiles.length > 0
    ? ["run", "test:smoke", "--", ...smokeTestFiles]
    : ["run", "test:smoke"]);
}

if (needsApiTests) {
  runNpm(apiTestFiles.length > 0
    ? ["run", "test:api", "--", ...apiTestFiles]
    : ["run", "test:api"]);
}

if (needsWorkerDryRun) {
  run(process.execPath, ["scripts/check-worker.js"]);
}

console.log(`Changed-file checks completed (${files.length} changed files).`);
