/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Dev-only performance overlay: FPS, frame time, 1% low FPS and JS heap.
 * Press F9 to toggle it. It is imported dynamically from `main.ts` only in the
 * dev server and `--mode benchmark` builds, so it never reaches a normal build.
 */

const TOGGLE_KEY = "F9";
/** Roughly 10 seconds of frames at 60 FPS. */
const LIVE_WINDOW_FRAMES = 600;
const REFRESH_INTERVAL_MS = 250;

export interface FrameStats {
  frames: number;
  durationSeconds: number;
  averageFps: number;
  averageFrameMs: number;
  /** FPS implied by the average of the slowest 1% of frames. */
  onePercentLowFps: number;
  worstFrameMs: number;
  /** Frames slower than 22.2ms, i.e. under the 45 FPS floor. */
  framesOver22ms: number;
  /** Frames slower than 50ms, which a player sees as a stutter. */
  framesOver50ms: number;
  /** `null` outside Chromium browsers. */
  heapUsedMb: number | null;
  heapPeakMb: number | null;
}

/** Non-standard Chromium API, which is absent from the standard DOM typings. */
function readHeapMb(): number | null {
  const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
  return memory ? memory.usedJSHeapSize / (1024 * 1024) : null;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Summarizes a list of frame durations in milliseconds. */
export function summarizeFrames(frameMs: readonly number[], heapPeakMb: number | null = null): FrameStats {
  const total = frameMs.reduce((sum, ms) => sum + ms, 0);
  const sorted = [...frameMs].sort((a, b) => b - a);
  const slowestCount = Math.max(1, Math.ceil(sorted.length / 100));
  const slowest = sorted.slice(0, slowestCount).reduce((sum, ms) => sum + ms, 0) / slowestCount;
  const heapUsedMb = readHeapMb();
  return {
    frames: frameMs.length,
    durationSeconds: round(total / 1000),
    averageFps: total > 0 ? round((frameMs.length * 1000) / total) : 0,
    averageFrameMs: frameMs.length > 0 ? round(total / frameMs.length) : 0,
    onePercentLowFps: slowest > 0 ? round(1000 / slowest) : 0,
    worstFrameMs: round(sorted[0] ?? 0),
    framesOver22ms: frameMs.filter(ms => ms > 22.2).length,
    framesOver50ms: frameMs.filter(ms => ms > 50).length,
    heapUsedMb: heapUsedMb === null ? null : round(heapUsedMb),
    heapPeakMb: heapPeakMb === null ? null : round(heapPeakMb),
  };
}

/** Collects every frame between {@linkcode start} and {@linkcode stop}. */
class FrameRecorder {
  private frames: number[] = [];
  private heapPeakMb: number | null = null;
  public recording = false;

  public start(): void {
    this.frames = [];
    this.heapPeakMb = readHeapMb();
    this.recording = true;
  }

  public add(frameMs: number): void {
    this.frames.push(frameMs);
    const heap = readHeapMb();
    if (heap !== null && heap > (this.heapPeakMb ?? 0)) {
      this.heapPeakMb = heap;
    }
  }

  public stop(): FrameStats {
    this.recording = false;
    return summarizeFrames(this.frames, this.heapPeakMb);
  }
}

export const frameRecorder = new FrameRecorder();

export function initPerfOverlay(): void {
  const panel = document.createElement("div");
  panel.id = "perf-overlay";
  panel.style.cssText = [
    "position:fixed",
    "top:4px",
    "left:4px",
    "z-index:99999",
    "padding:6px 8px",
    "background:rgba(0,0,0,.75)",
    "color:#7dff9a",
    "font:12px/1.35 monospace",
    "white-space:pre",
    "pointer-events:none",
    "display:none",
  ].join(";");
  document.body.appendChild(panel);

  window.addEventListener("keydown", event => {
    if (event.key === TOGGLE_KEY) {
      panel.style.display = panel.style.display === "none" ? "block" : "none";
    }
  });

  const live: number[] = [];
  let previous = performance.now();
  let lastRefresh = previous;

  const onFrame = (now: number): void => {
    const frameMs = now - previous;
    previous = now;
    live.push(frameMs);
    if (live.length > LIVE_WINDOW_FRAMES) {
      live.shift();
    }
    if (frameRecorder.recording) {
      frameRecorder.add(frameMs);
    }
    if (panel.style.display !== "none" && now - lastRefresh >= REFRESH_INTERVAL_MS) {
      lastRefresh = now;
      const stats = summarizeFrames(live);
      panel.textContent = [
        `FPS      ${stats.averageFps.toFixed(1)}`,
        `Frame    ${stats.averageFrameMs.toFixed(1)} ms`,
        `1% low   ${stats.onePercentLowFps.toFixed(1)} FPS`,
        `JS heap  ${stats.heapUsedMb === null ? "n/a" : `${stats.heapUsedMb.toFixed(0)} MB`}`,
      ].join("\n");
    }
    requestAnimationFrame(onFrame);
  };
  requestAnimationFrame(onFrame);
}
