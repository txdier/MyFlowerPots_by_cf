#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

function parseQuotedStrings(block) {
  return Array.from(block.matchAll(/["']([^"']+)["']/g), (match) => match[1]);
}

function normalizePagePath(path) {
  const clean = String(path || "").trim().replace(/\\/g, "/");
  if (!clean || clean === "/") return "/";
  return `/${clean.replace(/^\/+/, "").replace(/\/+$/, "").replace(/\.html$/i, "")}`;
}

function normalizeCanonicalSeoPath(path) {
  const normalized = normalizePagePath(path);
  return normalized === "/index" ? "/" : normalized;
}

export function extractStaticPagePaths(indexSource) {
  const match = indexSource.match(/const\s+STATIC_PAGE_PATHS\s*=\s*new\s+Set\s*\(\s*\[([\s\S]*?)\]\s*\)/);
  if (!match) {
    throw new Error("Unable to find STATIC_PAGE_PATHS in src/index.ts");
  }

  return new Set(parseQuotedStrings(match[1]).map(normalizePagePath));
}

export function extractPublicSeoPagePaths(indexSource) {
  const match = indexSource.match(/const\s+SEO_PUBLIC_PAGE_PATHS\s*=\s*new\s+Set\s*\(\s*\[([\s\S]*?)\]\s*\)/);
  if (!match) {
    throw new Error("Unable to find SEO_PUBLIC_PAGE_PATHS in src/index.ts");
  }

  return new Set(parseQuotedStrings(match[1]).map(normalizePagePath));
}

export function extractSitemapPaths(indexSource) {
  const match = indexSource.match(/const\s+SITEMAP_PATHS\s*=\s*\[([\s\S]*?)\]/);
  if (!match) {
    throw new Error("Unable to find SITEMAP_PATHS in src/index.ts");
  }

  return new Set(parseQuotedStrings(match[1]).map(normalizeCanonicalSeoPath));
}

export function extractRunWorkerFirstPaths(wranglerSource) {
  const match = wranglerSource.match(/run_worker_first\s*=\s*\[([\s\S]*?)\]/);
  if (!match) {
    throw new Error("Unable to find run_worker_first in wrangler.toml");
  }

  return new Set(parseQuotedStrings(match[1]));
}

export function findStaticRouteDrift(indexSource, wranglerSource) {
  const staticPages = extractStaticPagePaths(indexSource);
  const publicSeoPages = extractPublicSeoPagePaths(indexSource);
  const sitemapPages = extractSitemapPaths(indexSource);
  const publicCanonicalSeoPages = new Set(Array.from(publicSeoPages).map(normalizeCanonicalSeoPath));
  const workerFirst = extractRunWorkerFirstPaths(wranglerSource);
  const normalizedWorkerPages = new Set(
    Array.from(workerFirst)
      .filter((path) => path !== "/api/*" && path !== "/robots.txt" && path !== "/sitemap.xml")
      .map(normalizePagePath)
  );
  const errors = [];

  for (const page of staticPages) {
    const required = page === "/" ? ["/"] : [page, `${page}.html`];
    for (const path of required) {
      if (!workerFirst.has(path)) {
        errors.push(`wrangler.toml run_worker_first is missing ${path} for static page ${page}`);
      }
    }
  }

  for (const page of normalizedWorkerPages) {
    if (!staticPages.has(page)) {
      errors.push(`wrangler.toml run_worker_first contains ${page}, but src/index.ts STATIC_PAGE_PATHS does not`);
    }
  }

  for (const page of publicSeoPages) {
    if (!staticPages.has(page)) {
      errors.push(`src/index.ts SEO_PUBLIC_PAGE_PATHS contains ${page}, but STATIC_PAGE_PATHS does not`);
    }
    if (!sitemapPages.has(normalizeCanonicalSeoPath(page))) {
      errors.push(`src/index.ts SITEMAP_PATHS is missing public SEO page ${page}`);
    }
  }

  for (const page of sitemapPages) {
    if (!publicCanonicalSeoPages.has(page)) {
      errors.push(`src/index.ts SITEMAP_PATHS contains ${page}, but SEO_PUBLIC_PAGE_PATHS does not`);
    }
    if (!staticPages.has(page)) {
      errors.push(`src/index.ts SITEMAP_PATHS contains ${page}, but STATIC_PAGE_PATHS does not`);
    }
  }

  return { errors, staticPages, publicSeoPages, sitemapPages, workerFirst };
}

function main() {
  const indexSource = readFileSync("src/index.ts", "utf8");
  const wranglerSource = readFileSync("wrangler.toml", "utf8");
  const { errors } = findStaticRouteDrift(indexSource, wranglerSource);

  if (errors.length > 0) {
    console.error(errors.join("\n"));
    process.exit(1);
  }

  console.log("Static route config OK.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
