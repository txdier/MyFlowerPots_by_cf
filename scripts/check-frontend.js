#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import vm from "node:vm";

const vendorJsFiles = new Set([
  "frontend/js/Sortable.min.js",
  "frontend/js/vue.global.js",
  "frontend/js/vue.global.prod.js",
]);

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: false,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(detail || `${command} ${args.join(" ")} failed`);
  }

  return result.stdout.trim();
}

function normalizePath(file) {
  return file.replace(/\\/g, "/");
}

function getTrackedFiles(patterns) {
  const output = run("git", ["ls-files", ...patterns]);
  return output ? output.split(/\r?\n/).map(normalizePath).filter(Boolean) : [];
}

function getFilesFromArgs() {
  const filesIndex = process.argv.indexOf("--files");
  if (filesIndex === -1) return null;
  return process.argv.slice(filesIndex + 1).map(normalizePath).filter(Boolean);
}

function isJavaScriptType(attrs) {
  const typeMatch = attrs.match(/\btype\s*=\s*["']?([^"'\s>]+)/i);
  if (!typeMatch) return true;

  const type = typeMatch[1].toLowerCase();
  return [
    "text/javascript",
    "application/javascript",
    "module",
  ].includes(type);
}

function checkScript(file) {
  const code = readFileSync(file, "utf8");
  new vm.Script(code, { filename: file });
}

function checkHtml(file) {
  const html = readFileSync(file, "utf8");
  const scriptTagPattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let checked = 0;

  for (const match of html.matchAll(scriptTagPattern)) {
    const attrs = match[1] || "";
    if (/\bsrc\s*=/i.test(attrs) || !isJavaScriptType(attrs)) {
      continue;
    }

    checked += 1;
    new vm.Script(match[2], { filename: `${file}#inline-script-${checked}` });
  }

  return checked;
}

const argFiles = getFilesFromArgs();
const files = argFiles || getTrackedFiles(["frontend/js/*.js", "frontend/*.html"]);
const jsFiles = files
  .filter((file) => file.startsWith("frontend/js/") && file.endsWith(".js"))
  .filter((file) => !vendorJsFiles.has(file));
const htmlFiles = files
  .filter((file) => file.startsWith("frontend/") && file.endsWith(".html"));

const failures = [];

for (const file of jsFiles) {
  try {
    checkScript(file);
  } catch (error) {
    failures.push(`${file}: ${error.message}`);
  }
}

for (const file of htmlFiles) {
  try {
    checkHtml(file);
  } catch (error) {
    failures.push(`${file}: ${error.message}`);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n\n"));
  process.exit(1);
}

console.log(`Frontend syntax OK (${jsFiles.length} JS files, ${htmlFiles.length} HTML files).`);
