/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Shrinks the assets in `dist` for deployment. Run after the build and before `pack-assets.mjs`.
 * - PNGs: recompressed losslessly, and each file is kept only if its decoded pixels are unchanged and it got smaller.
 * - WAV sound effects: an Opus `.ogg` copy is added next to each one. The WAV stays as the fallback.
 *
 * Requires `ffmpeg` on the PATH.
 *
 * Usage: node scripts/deploy/optimize-assets.mjs [--png-only | --opus-only]
 */

import { execFile } from "node:child_process";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { cpus } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads";

const run = promisify(execFile);
const DIST = "dist";

function listFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

async function forEachLimit(items, limit, task) {
  let next = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (next < items.length) {
        await task(items[next++]);
      }
    }),
  );
}

async function encodeOpus() {
  const wavs = listFiles(join(DIST, "audio")).filter(file => file.endsWith(".wav"));
  let before = 0;
  let after = 0;
  await forEachLimit(wavs, cpus().length, async wav => {
    const ogg = `${wav.slice(0, -4)}.ogg`;
    await run("ffmpeg", ["-y", "-v", "error", "-i", wav, "-c:a", "libopus", "-b:a", "64k", ogg]);
    before += statSync(wav).size;
    after += statSync(ogg).size;
  });
  console.log(
    `Opus: ${wavs.length} files, ${(before / 1048576).toFixed(1)} MiB WAV to ${(after / 1048576).toFixed(1)} MiB.`,
  );
}

async function compressPngs() {
  const pngs = listFiles(DIST).filter(file => file.endsWith(".png"));
  const threads = Math.max(1, cpus().length - 1);
  const chunks = Array.from({ length: threads }, (_, thread) => pngs.filter((_png, i) => i % threads === thread));
  const totals = await Promise.all(
    chunks.map(
      files =>
        new Promise((resolve, reject) => {
          const worker = new Worker(new URL(import.meta.url), { workerData: { files } });
          worker.once("message", resolve);
          worker.once("error", reject);
        }),
    ),
  );
  const sum = key => totals.reduce((total, part) => total + part[key], 0);
  console.log(
    `PNG: ${pngs.length} files, ${(sum("before") / 1048576).toFixed(1)} MiB to ${(sum("after") / 1048576).toFixed(1)} MiB, ${sum("rejected")} rejected by the pixel check, ${sum("failed")} failed.`,
  );
  const firstError = totals.find(part => part.firstError)?.firstError;
  if (firstError) {
    console.error(`First failure: ${firstError}`);
  }
  // A few unusual files can be left as they are, but widespread failure means the tool itself is broken.
  if (sum("failed") > pngs.length * 0.01) {
    throw new Error("Too many PNGs failed to compress.");
  }
}

/** Runs in each worker thread. */
async function compressPngChunk(files) {
  const require = createRequire(join(process.cwd(), "package.json"));
  const { PNG } = require("pngjs");
  const { default: optimise, init } = await import(pathToFileURL(require.resolve("@jsquash/oxipng/optimise.js")).href);
  const wasmPath = require.resolve("@jsquash/oxipng/codec/pkg/squoosh_oxipng_bg.wasm");
  await init(await WebAssembly.compile(readFileSync(wasmPath)));

  const totals = { before: 0, after: 0, rejected: 0, failed: 0, firstError: null };
  for (const file of files) {
    const original = readFileSync(file);
    totals.before += original.length;
    let output = original;
    try {
      const input = original.buffer.slice(original.byteOffset, original.byteOffset + original.length);
      const candidate = Buffer.from(await optimise(input, { level: 2, interlace: false, optimiseAlpha: false }));
      if (candidate.length < original.length) {
        const a = PNG.sync.read(original);
        const b = PNG.sync.read(candidate);
        if (a.width === b.width && a.height === b.height && Buffer.compare(a.data, b.data) === 0) {
          output = candidate;
          writeFileSync(file, output);
        } else {
          totals.rejected++;
        }
      }
    } catch (error) {
      totals.failed++;
      totals.firstError ??= `${file}: ${error}`;
    }
    totals.after += output.length;
  }
  return totals;
}

if (isMainThread) {
  const mode = process.argv[2];
  if (mode !== "--opus-only") {
    await compressPngs();
  }
  if (mode !== "--png-only") {
    await encodeOpus();
  }
} else {
  parentPort.postMessage(await compressPngChunk(workerData.files));
}
