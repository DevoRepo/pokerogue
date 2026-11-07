/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Repeatable 60-second battle benchmark, active only in `--mode benchmark` builds.
 *
 * It starts the fixed double battle configured by the benchmark overrides in `src/overrides.ts`,
 * presses the action button at a steady pace, and records frame times once the first command menu appears.
 * The result is logged and stored on `window.__benchmarkResult`, which is what the profiling script reads.
 */

import { getGameMode } from "#app/game-mode";
import { globalScene } from "#app/global-scene";
import { Button } from "#enums/buttons";
import { GameModes } from "#enums/game-modes";
import { Nature } from "#enums/nature";
import { SpeciesId } from "#enums/species-id";
import { UiMode } from "#enums/ui-mode";
import { SelectStarterPhase } from "#phases/select-starter-phase";
import type { Starter } from "#types/save-data";
import { type FrameStats, frameRecorder } from "./perf-overlay";

const BENCHMARK_DURATION_MS = 60_000;
const INPUT_INTERVAL_MS = 300;
const BENCHMARK_PARTY = [SpeciesId.CHARIZARD, SpeciesId.GENGAR];

export interface BenchmarkResult extends FrameStats {
  canvas: string;
  renderer: string;
  userAgent: string;
  cpuThreads: number;
  turnsStarted: number;
}

declare global {
  interface Window {
    __benchmarkResult?: BenchmarkResult;
    /** Set by the profiling script so tracing starts exactly when recording does. */
    __benchmarkOnStart?: () => void;
  }
}

function getRendererName(): string {
  const gl = document.createElement("canvas").getContext("webgl");
  const info = gl?.getExtension("WEBGL_debug_renderer_info");
  return gl && info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "unknown";
}

function startBattle(): void {
  const starters: Starter[] = BENCHMARK_PARTY.map(speciesId => ({
    speciesId,
    shiny: true,
    variant: 2,
    formIndex: 0,
    ivs: [31, 31, 31, 31, 31, 31],
    abilityIndex: 0,
    passive: false,
    nature: Nature.HARDY,
    pokerus: false,
  }));
  globalScene.ui.setMode(UiMode.MESSAGE);
  globalScene.gameMode = getGameMode(GameModes.CLASSIC);
  globalScene.newArena(globalScene.gameMode.getStartingBiome());
  globalScene.phaseManager.pushNew("EncounterPhase", false);
  new SelectStarterPhase().initBattle(starters);
}

export function initBenchmarkDriver(): void {
  let started = false;
  let recordingSince: number | null = null;
  let turnsStarted = 0;
  let lastMode: UiMode | null = null;

  const tick = (): void => {
    const ui = globalScene?.ui;
    if (!ui) {
      return;
    }
    const mode = ui.mode;

    if (!started) {
      if (mode === UiMode.TITLE) {
        started = true;
        startBattle();
      } else if (mode === UiMode.OPTION_SELECT || mode === UiMode.MESSAGE) {
        // A fresh browser profile gets the first-launch prompts before the title screen.
        ui.processInput(Button.ACTION);
      }
      return;
    }

    if (mode === UiMode.COMMAND) {
      if (recordingSince === null) {
        recordingSince = performance.now();
        window.__benchmarkOnStart?.();
        frameRecorder.start();
      }
      if (lastMode !== UiMode.COMMAND) {
        turnsStarted++;
      }
    }
    lastMode = mode;

    if (recordingSince !== null && performance.now() - recordingSince >= BENCHMARK_DURATION_MS) {
      clearInterval(timer);
      const canvas = globalScene.game.canvas;
      window.__benchmarkResult = {
        ...frameRecorder.stop(),
        canvas: `${canvas.width}x${canvas.height}`,
        renderer: getRendererName(),
        userAgent: navigator.userAgent,
        cpuThreads: navigator.hardwareConcurrency,
        turnsStarted,
      };
      console.info(`[benchmark] ${JSON.stringify(window.__benchmarkResult)}`);
      return;
    }

    switch (mode) {
      case UiMode.COMMAND:
      case UiMode.FIGHT:
      case UiMode.TARGET_SELECT:
      case UiMode.MESSAGE:
        // A message handler only reacts while it waits for input, so text keeps its normal speed.
        ui.processInput(Button.ACTION);
        break;
      case UiMode.CONFIRM:
        // Declines the "switch Pokémon?" prompt.
        ui.processInput(Button.CANCEL);
        break;
    }
  };

  const timer = setInterval(tick, INPUT_INTERVAL_MS);
}
