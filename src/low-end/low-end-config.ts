/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { settings } from "#app/global-settings-manager";
import { DamageNumbersMode } from "#enums/damage-numbers-mode";
import { ExpGainsSpeed } from "#enums/exp-gains-speed";
import { GameSpeed } from "#enums/game-speed";
import { HpBarSpeed } from "#enums/hp-bar-speed";

/** Everything Low-end mode changes at runtime. These values leave rendering untouched, as in normal mode. */
export interface LowEndConfig {
  /** Backbuffer size relative to the game's 1920x1080 coordinate system. */
  renderScale: number;
  /** Frame rate limit, or `0` for none. */
  fpsLimit: number;
  /** Whether palette swaps are computed once into a texture, not per pixel in the shader. */
  bakePalettes: boolean;
  /** Whether sound effects load from the Opus files that the deploy build generates. */
  useOpusSfx: boolean;
}

const INTERNAL_HEIGHT_TO_SCALE: Readonly<Record<number, number>> = {
  540: 1 / 2,
  360: 1 / 3,
};

const NORMAL_CONFIG: LowEndConfig = { renderScale: 1, fpsLimit: 0, bakePalettes: false, useOpusSfx: false };

let activeConfig: LowEndConfig = NORMAL_CONFIG;

/** The active configuration. Fixed at startup, as changing it requires a reload. */
export function getLowEndConfig(): LowEndConfig {
  return activeConfig;
}

/** Applies existing settings that reduce work, all of which the player can change back. */
export function applyLowEndDefaults(): void {
  settings.update("general", "gameSpeed", GameSpeed.FAST);
  settings.update("general", "hpBarSpeed", HpBarSpeed.FAST);
  settings.update("general", "expGainsSpeed", ExpGainsSpeed.FAST);
  settings.update("display", "damageNumbersMode", DamageNumbersMode.SIMPLE);
}

/** Lets benchmark builds test each optimization separately through the address, such as `?res=540&bake=1`. */
function readBenchmarkConfig(): LowEndConfig {
  const params = new URLSearchParams(window.location.search);
  if (params.get("defaults") === "1") {
    applyLowEndDefaults();
  }
  return {
    renderScale: INTERNAL_HEIGHT_TO_SCALE[Number(params.get("res"))] ?? 1,
    fpsLimit: Number(params.get("fps")) || 0,
    bakePalettes: params.get("bake") === "1",
    useOpusSfx: false,
  };
}

/** Reads the configuration. Must run after the settings manager is ready, and before the game is created. */
export function initLowEndConfig(): LowEndConfig {
  if (import.meta.env.VITE_BENCHMARK === "1") {
    activeConfig = readBenchmarkConfig();
  } else if (settings.display.lowEndMode) {
    activeConfig = {
      renderScale: INTERNAL_HEIGHT_TO_SCALE[settings.display.internalResolution] ?? 1 / 2,
      fpsLimit: settings.display.lowEndFpsCap,
      bakePalettes: true,
      useOpusSfx: import.meta.env.VITE_OPUS_SFX === "1",
    };
  } else {
    activeConfig = NORMAL_CONFIG;
  }
  return activeConfig;
}
