import "#app/polyfills"; // All polyfills MUST be loaded first for side effects
import "#init/init-manifest"; // initializes the manifest, must be done *before* i18n is initialized due to being used for caching
import "#app/i18n"; // Initializes i18n on import

import { isMobile, preventDoubleTapZoom } from "#app/touch-controls";
import { isBeta, isDev } from "#constants/app-constants";
import { version } from "#package.json";
import Phaser from "phaser";
import BBCodeTextPlugin from "phaser4-rex-plugins/plugins/bbcodetext-plugin";
import InputTextPlugin from "phaser4-rex-plugins/plugins/inputtext-plugin";
import TransitionImagePackPlugin from "phaser4-rex-plugins/templates/transitionimagepack/transitionimagepack-plugin";
import UIPlugin from "phaser4-rex-plugins/templates/ui/ui-plugin";

if (isBeta || isDev) {
  document.title += " (Beta)";
}

preventDoubleTapZoom();

async function startGame(): Promise<void> {
  const { initSettingsManager } = await import("#app/global-settings-manager");
  const { initGlobalAudioManager } = await import("#app/global-audio-manager");

  await initSettingsManager();
  const audioManager = await initGlobalAudioManager();

  const { initLowEndConfig } = await import("#app/low-end/low-end-config");
  if (import.meta.env.VITE_BENCHMARK !== "1") {
    const { offerLowEndModeOnFirstLaunch } = await import("#app/low-end/gpu-detect");
    offerLowEndModeOnFirstLaunch();
  }
  const lowEnd = initLowEndConfig();

  const LoadingScene = (await import("./loading-scene")).LoadingScene;
  const BattleScene = (await import("./battle-scene")).BattleScene;
  const game = new Phaser.Game({
    type: Phaser.WEBGL,
    parent: "app",
    audio: {
      noAudio: !audioManager.isAudioEnabled,
    },
    scale: {
      width: 1920 * lowEnd.renderScale,
      height: 1080 * lowEnd.renderScale,
      mode: Phaser.Scale.FIT,
    },
    ...(lowEnd.fpsLimit > 0 && { fps: { limit: lowEnd.fpsLimit } }),
    plugins: {
      global: [
        {
          key: "rexInputTextPlugin",
          plugin: InputTextPlugin,
          start: true,
        },
        {
          key: "rexBBCodeTextPlugin",
          plugin: BBCodeTextPlugin,
          start: true,
        },
        {
          key: "rexTransitionImagePackPlugin",
          plugin: TransitionImagePackPlugin,
          start: true,
        },
      ],
      scene: [
        {
          key: "rexUI",
          plugin: UIPlugin,
          mapping: "rexUI",
        },
      ],
    },
    input: {
      mouse: {
        target: "app",
      },
      touch: {
        target: "app",
      },
      gamepad: true,
    },
    dom: {
      createContainer: true,
    },
    antialias: false,
    scene: [LoadingScene, BattleScene],
    version,
  });
  game.sound.pauseOnBlur = isMobile();
  if (lowEnd.renderScale !== 1) {
    // Keeps the art's pixels sharp when the smaller canvas is stretched to fit the window.
    game.canvas.style.imageRendering = "pixelated";
  }

  if (import.meta.env.DEV || import.meta.env.VITE_PERF_TOOLS === "1") {
    const { initPerfOverlay } = await import("#app/dev-tools/perf-overlay");
    initPerfOverlay();
  }
  if (import.meta.env.VITE_BENCHMARK === "1") {
    const { initBenchmarkDriver } = await import("#app/dev-tools/benchmark-driver");
    initBenchmarkDriver();
  }
}

try {
  await Promise.all([document.fonts.load("16px emerald"), document.fonts.load("10px pkmnems")]);
} catch (err) {
  console.error("Error loading fonts:", err);
} finally {
  await startGame();
}
