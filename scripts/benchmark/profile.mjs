/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Runs the 60-second battle benchmark from a `vite build --mode benchmark` bundle in Chrome.
 *
 * A clean run produces the FPS numbers. A separate traced run produces the time breakdown and hot functions,
 * because tracing itself costs frame time and should not affect the FPS numbers.
 *
 * Usage: node scripts/benchmark/profile.mjs [--preset native|weak] [--out dir] [--runs n]
 *   [--query "lowEnd=1&res=540"] [--label name] [--no-trace]
 * - `native` uses this machine's GPU and CPU.
 * - `weak` uses software WebGL and a 4x CPU slowdown as a rough stand-in for an old laptop.
 */

import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import puppeteer from "puppeteer-core";

const CHROME_PATH = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const DIST = resolve("dist");
const RUN_TIMEOUT_MS = 8 * 60 * 1000;

const { values } = parseArgs({
  options: {
    preset: { type: "string", default: "native" },
    out: { type: "string", default: "benchmark-results" },
    runs: { type: "string", default: "2" },
    query: { type: "string", default: "" },
    label: { type: "string", default: "" },
    "no-trace": { type: "boolean", default: false },
  },
});

const PRESETS = {
  native: { args: ["--use-angle=metal", "--ignore-gpu-blocklist"], cpuThrottle: 1 },
  weak: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"], cpuThrottle: 4 },
};
const preset = PRESETS[values.preset];
if (!preset) {
  throw new Error(`Unknown preset ${values.preset}`);
}

const MIME_TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
};

function serveDist() {
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const relative = pathname === "/" ? "index.html" : normalize(pathname).replace(/^[/\\]+/, "");
    const file = join(DIST, relative);
    if (!file.startsWith(DIST + sep) || !existsSync(file) || statSync(file).isDirectory()) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "Content-Type": MIME_TYPES[extname(file)] ?? "application/octet-stream" });
    createReadStream(file).pipe(response);
  });
  return new Promise(ready => server.listen(0, "127.0.0.1", () => ready(server)));
}

/** Counts WebGL work per animation frame. Only injected into traced runs. */
function installGlCounters() {
  const counts = { frames: 0, draws: 0, uploads: 0, shaderSwitches: 0, drawnVertices: 0 };
  window.__glCounts = counts;
  const wrap = (proto, name, onCall) => {
    const original = proto[name];
    if (original) {
      proto[name] = function (...args) {
        onCall(args);
        return original.apply(this, args);
      };
    }
  };
  for (const proto of [WebGLRenderingContext.prototype, globalThis.WebGL2RenderingContext?.prototype]) {
    if (!proto) {
      continue;
    }
    wrap(proto, "drawArrays", args => {
      counts.draws++;
      counts.drawnVertices += args[2];
    });
    wrap(proto, "drawElements", args => {
      counts.draws++;
      counts.drawnVertices += args[1];
    });
    wrap(proto, "texImage2D", () => counts.uploads++);
    wrap(proto, "texSubImage2D", () => counts.uploads++);
    wrap(proto, "useProgram", () => counts.shaderSwitches++);
  }
  const onFrame = () => {
    counts.frames++;
    requestAnimationFrame(onFrame);
  };
  requestAnimationFrame(onFrame);
}

/** Splits trace time into categories, using each event's self time so nested events are not counted twice. */
function summarizeTrace(events) {
  const threadNames = new Map();
  for (const event of events) {
    if (event.ph === "M" && event.name === "thread_name") {
      threadNames.set(`${event.pid}:${event.tid}`, event.args.name);
    }
  }
  const categoryOf = name => {
    if (/GC|Scavenge|MarkCompact|Sweep/i.test(name)) {
      return "garbage collection";
    }
    if (
      /^(FunctionCall|EvaluateScript|TimerFire|FireAnimationFrame|RunMicrotasks|v8\.|V8\.|EventDispatch)/.test(name)
    ) {
      return "scripting";
    }
    if (/^(UpdateLayoutTree|Layout|PrePaint|Paint|Layerize|Commit|HitTest|IntersectionObserver)/.test(name)) {
      return "layout and paint";
    }
    return "other main-thread";
  };

  const byThread = new Map();
  for (const event of events) {
    if (event.ph === "X" && event.dur) {
      const key = `${event.pid}:${event.tid}`;
      if (!byThread.has(key)) {
        byThread.set(key, []);
      }
      byThread.get(key).push(event);
    }
  }

  const main = {};
  const threadBusyMs = {};
  let spanMs = 0;
  for (const [key, list] of byThread) {
    const threadName = threadNames.get(key) ?? "unknown";
    list.sort((a, b) => a.ts - b.ts || b.dur - a.dur);
    const stack = [];
    let busy = 0;
    for (const event of list) {
      while (stack.length > 0 && stack.at(-1).end <= event.ts) {
        stack.pop();
      }
      if (stack.length === 0) {
        busy += event.dur;
      } else {
        stack.at(-1).self -= event.dur;
      }
      const entry = { event, end: event.ts + event.dur, self: event.dur };
      stack.push(entry);
      event.__entry = entry;
    }
    threadBusyMs[threadName] = (threadBusyMs[threadName] ?? 0) + busy / 1000;
    if (threadName === "CrRendererMain") {
      for (const event of list) {
        const category = categoryOf(event.name);
        main[category] = (main[category] ?? 0) + Math.max(0, event.__entry.self) / 1000;
      }
      spanMs = Math.max(spanMs, (list.at(-1).ts + list.at(-1).dur - list[0].ts) / 1000);
    }
  }
  return { spanMs, mainThreadMs: main, threadBusyMs };
}

/** Totals self time per function in a V8 CPU profile. */
function summarizeCpuProfile(profile) {
  const nodes = new Map(profile.nodes.map(node => [node.id, node]));
  const selfMs = new Map();
  profile.samples.forEach((id, index) => {
    const node = nodes.get(id);
    const { functionName, url, lineNumber } = node.callFrame;
    const file = url ? url.split("/").pop() : "(native)";
    const key = `${functionName || "(anonymous)"} @ ${file}${url ? `:${lineNumber + 1}` : ""}`;
    selfMs.set(key, (selfMs.get(key) ?? 0) + (profile.timeDeltas[index] ?? 0) / 1000);
  });
  const total = [...selfMs.values()].reduce((sum, ms) => sum + ms, 0);
  return {
    totalMs: total,
    top: [...selfMs.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 40)
      .map(([fn, ms]) => ({ fn, ms: Math.round(ms), percent: Math.round((ms / total) * 1000) / 10 })),
  };
}

async function runBenchmark(url, traced, outDir) {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    defaultViewport: { width: 1366, height: 768 },
    args: [
      ...preset.args,
      "--enable-precise-memory-info",
      "--autoplay-policy=no-user-gesture-required",
      "--mute-audio",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
    ],
    protocolTimeout: RUN_TIMEOUT_MS,
  });
  try {
    const page = await browser.newPage();
    const client = await page.createCDPSession();
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    await client.send("Emulation.setCPUThrottlingRate", { rate: preset.cpuThrottle });

    let startedAt = 0;
    const launchedAt = Date.now();
    let onStarted;
    const recordingStarted = new Promise(ready => {
      onStarted = ready;
    });
    await page.exposeFunction("__benchmarkOnStart", () => {
      startedAt = Date.now();
      onStarted();
    });

    // The default buffer stops at 250 entries, which would cut off the list of files loaded at boot.
    await page.evaluateOnNewDocument(() => performance.setResourceTimingBufferSize(20_000));
    if (traced) {
      await page.evaluateOnNewDocument(installGlCounters);
    }
    await page.goto(`${url}${values.query ? `?${values.query}` : ""}`, { waitUntil: "load", timeout: RUN_TIMEOUT_MS });

    let glAtStart = null;
    if (traced) {
      await recordingStarted;
      glAtStart = await page.evaluate(() => ({ ...window.__glCounts }));
      await client.send("Profiler.enable");
      await client.send("Profiler.setSamplingInterval", { interval: 1000 });
      await client.send("Profiler.start");
      await page.tracing.start({
        path: join(outDir, `${values.preset}-trace.json`),
        categories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "v8", "blink.user_timing", "gpu"],
      });
    }

    await page.waitForFunction(() => window.__benchmarkResult !== undefined, {
      timeout: RUN_TIMEOUT_MS,
      polling: 1000,
    });
    const result = await page.evaluate(() => window.__benchmarkResult);
    result.secondsToBattle = Math.round((startedAt - launchedAt) / 100) / 10;
    result.pageErrors = pageErrors;
    if (!traced) {
      return { result };
    }

    const traceBuffer = await page.tracing.stop();
    const { profile } = await client.send("Profiler.stop");
    const glAtEnd = await page.evaluate(() => ({ ...window.__glCounts }));
    await page.screenshot({ path: join(outDir, `${values.preset}-battle.png`) });

    const frames = glAtEnd.frames - glAtStart.frames;
    const perFrame = key => Math.round(((glAtEnd[key] - glAtStart[key]) / frames) * 10) / 10;
    const memory = await page.evaluate(() => {
      const resources = performance.getEntriesByType("resource");
      const groups = {};
      for (const entry of resources) {
        const path = new URL(entry.name).pathname;
        const group = path.split("/")[1] || "(root)";
        const extension = path.split(".").pop();
        const key = `${group} .${extension}`;
        groups[key] ??= { count: 0, megabytes: 0 };
        groups[key].count++;
        groups[key].megabytes += entry.decodedBodySize / (1024 * 1024);
      }
      for (const group of Object.values(groups)) {
        group.megabytes = Math.round(group.megabytes * 10) / 10;
      }
      return { resourcesLoaded: resources.length, groups };
    });
    return {
      result,
      trace: summarizeTrace(JSON.parse(Buffer.from(traceBuffer).toString()).traceEvents),
      cpu: summarizeCpuProfile(profile),
      gl: {
        draws: perFrame("draws"),
        uploads: perFrame("uploads"),
        shaderSwitches: perFrame("shaderSwitches"),
        drawnVertices: perFrame("drawnVertices"),
      },
      memory,
    };
  } finally {
    await browser.close();
  }
}

const outDir = resolve(values.out);
mkdirSync(outDir, { recursive: true });
const server = await serveDist();
const url = `http://127.0.0.1:${server.address().port}/`;

try {
  const cleanRuns = [];
  for (let run = 0; run < Number(values.runs); run++) {
    const { result } = await runBenchmark(url, false, outDir);
    cleanRuns.push(result);
    console.log(`clean run ${run + 1}: ${JSON.stringify(result)}`);
  }
  const traced = values["no-trace"] ? null : await runBenchmark(url, true, outDir);
  if (traced) {
    console.log(`traced run: ${JSON.stringify(traced.result)}`);
  }
  const name = `${values.preset}${values.label ? `-${values.label}` : ""}-summary.json`;
  writeFileSync(
    join(outDir, name),
    JSON.stringify(
      { preset: values.preset, query: values.query, cpuThrottle: preset.cpuThrottle, cleanRuns, traced },
      null,
      2,
    ),
  );
  console.log(`Wrote ${join(outDir, name)}`);
} finally {
  server.close();
}
