/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { settings } from "#app/global-settings-manager";
import { applyLowEndDefaults } from "#app/low-end/low-end-config";

const PROMPT_SHOWN_KEY = "lowEndPromptShown";
/** Software renderers and integrated GPUs that struggle with a 1080p backbuffer. */
const WEAK_RENDERER =
  /swiftshader|llvmpipe|software|microsoft basic|intel.*(hd graphics|gma|\buhd graphics [56]\d\d\b)|radeon.*(hd|r[2-5]\b|vega [38]\b)|geforce.*(gt|mx)\s?\d|mali-[4t]|adreno.*[34]\d\d/i;
const TEST_FRAMES = 12;
/** A 640x360 fill should take far less than this on a GPU that can handle the game at 1080p. */
const SLOW_FRAME_MS = 8;

const VERTEX_SHADER = `
attribute vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

/** Palette-style loops, in the same style as the game's sprite shader. */
const FRAGMENT_SHADER = `
precision mediump float;
uniform vec4 palette[32];
void main() {
  vec3 c = fract(gl_FragCoord.xyx / 97.0);
  for (int i = 0; i < 32; i++) {
    if (all(lessThan(abs(c - palette[i].rgb), vec3(0.002)))) { c = palette[i].bgr; }
  }
  gl_FragColor = vec4(c, 1.0);
}`;

function compileProgram(gl: WebGLRenderingContext): WebGLProgram | null {
  const program = gl.createProgram();
  for (const [type, source] of [
    [gl.VERTEX_SHADER, VERTEX_SHADER],
    [gl.FRAGMENT_SHADER, FRAGMENT_SHADER],
  ] as const) {
    const shader = gl.createShader(type);
    if (!shader) {
      return null;
    }
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    gl.attachShader(program, shader);
  }
  gl.linkProgram(program);
  return gl.getProgramParameter(program, gl.LINK_STATUS) ? program : null;
}

/** @returns The median milliseconds to draw and finish one test frame, or `null` if the test could not run. */
function measureFillMs(gl: WebGLRenderingContext): number | null {
  const program = compileProgram(gl);
  if (!program) {
    return null;
  }
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "p");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  const pixel = new Uint8Array(4);
  const times: number[] = [];
  for (let frame = 0; frame < TEST_FRAMES; frame++) {
    const start = performance.now();
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // Reading a pixel waits until the GPU has really finished the draw.
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)];
}

/** @returns Whether this device looks too weak to run the game smoothly in normal mode. */
export function isWeakGpu(): boolean {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 360;
  const gl = canvas.getContext("webgl", { antialias: false, powerPreference: "high-performance" });
  if (!gl) {
    return false;
  }
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  const renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
  const fillMs = measureFillMs(gl);
  gl.getExtension("WEBGL_lose_context")?.loseContext();
  return WEAK_RENDERER.test(renderer) || (fillMs !== null && fillMs > SLOW_FRAME_MS);
}

/**
 * On first launch only, offers Low-end mode if the GPU looks weak.
 * This runs before the game is created, so accepting it takes effect without a reload.
 */
export function offerLowEndModeOnFirstLaunch(): void {
  if (settings.display.lowEndMode || localStorage.getItem(PROMPT_SHOWN_KEY)) {
    return;
  }
  localStorage.setItem(PROMPT_SHOWN_KEY, "1");
  if (
    isWeakGpu()
    && window.confirm(
      "This device's graphics look slow for this game.\n\nTurn on Low-end mode? It lowers the internal resolution for smoother play. You can change it any time under Settings > Display.",
    )
  ) {
    settings.update("display", "lowEndMode", true);
    applyLowEndDefaults();
  }
}
