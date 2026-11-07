/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Prepares `dist` for Cloudflare Pages, which allows 20,000 files on the free plan.
 *
 * Merges JSON files and small icons into shard files under `dist/packs`, removes files the game never requests,
 * and writes `dist/_worker.js`, which serves merged files at their original URLs and enforces the site password.
 *
 * Usage: node scripts/deploy/pack-assets.mjs
 */

import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const DIST = "dist";
const MAX_SHARD_BYTES = 2 * 1024 * 1024;
const MAX_PAGES_FILES = 20_000;
const MAX_PAGES_FILE_BYTES = 25 * 1024 * 1024;
/** Files only used for authoring assets, or for debugging the bundle. */
const REMOVED_EXTENSIONS = new Set([".map", ".bat", ".tps", ".ps1"]);
/** These are requested by the loader before the game starts and stay as real files. */
const KEEP_AS_FILES = new Set(["asset-manifest.json", "manifest.json"]);

function listFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

const toUrlPath = file => `/${relative(DIST, file).split(sep).join("/")}`;

function shouldPack(file) {
  const urlPath = toUrlPath(file);
  if (urlPath.lastIndexOf("/") === 0 && KEEP_AS_FILES.has(urlPath.slice(1))) {
    return false;
  }
  if (urlPath.startsWith("/assets/")) {
    return false;
  }
  return urlPath.endsWith(".json") || (urlPath.startsWith("/images/pokemon/icons/") && urlPath.endsWith(".png"));
}

rmSync(join(DIST, "packs"), { recursive: true, force: true });
rmSync(join(DIST, ".vite"), { recursive: true, force: true });
rmSync(join(DIST, "test"), { recursive: true, force: true });

for (const file of listFiles(DIST)) {
  if (REMOVED_EXTENSIONS.has(file.slice(file.lastIndexOf(".")))) {
    rmSync(file);
  }
}

mkdirSync(join(DIST, "packs"));
const index = {};
let shardNumber = 0;
let shardParts = [];
let shardBytes = 0;

function flushShard() {
  if (shardBytes > 0) {
    writeFileSync(join(DIST, "packs", `${shardNumber}.bin`), Buffer.concat(shardParts));
    shardNumber++;
    shardParts = [];
    shardBytes = 0;
  }
}

// Sorted, so files from the same folder share shards and repeat builds are identical.
const packable = listFiles(DIST).filter(shouldPack).sort();
for (const file of packable) {
  const content = readFileSync(file);
  if (shardBytes > 0 && shardBytes + content.length > MAX_SHARD_BYTES) {
    flushShard();
  }
  index[toUrlPath(file)] = [shardNumber, shardBytes, content.length];
  shardParts.push(content);
  shardBytes += content.length;
  rmSync(file);
}
flushShard();

const template = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "worker-template.js"), "utf8");
const worker = template.replace("__PACK_INDEX__", () => JSON.stringify(JSON.stringify(index)));
writeFileSync(join(DIST, "_worker.js"), worker);

const finalFiles = listFiles(DIST);
const oversized = finalFiles.filter(file => statSync(file).size > MAX_PAGES_FILE_BYTES);
console.log(`Packed ${packable.length} files into ${shardNumber} shards.`);
console.log(`Deployable files: ${finalFiles.length} of ${MAX_PAGES_FILES} allowed.`);
console.log(`Worker size: ${(statSync(join(DIST, "_worker.js")).size / 1024).toFixed(0)} KiB.`);
if (finalFiles.length > MAX_PAGES_FILES || oversized.length > 0) {
  console.error("Over the Cloudflare Pages limits:", oversized);
  process.exitCode = 1;
}
