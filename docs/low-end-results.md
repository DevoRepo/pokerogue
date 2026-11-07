<!--
SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# Low-end mode results

These numbers were **not measured on the target laptop**. They come from a stand-in on an Apple M5 Mac: software WebGL (SwiftShader) and a 4× CPU slowdown. Software rendering is probably harsher than a real old GPU, so use them to compare settings, not to predict real FPS. See [low-end-benchmark.md](./low-end-benchmark.md) to measure on real hardware.

Each row is the average of two 60-second runs of the same benchmark.

## Results by setting

| Optimization | Setting | FPS | Frame time | 1% low FPS | Peak JS heap | Peak Chrome RAM* | Turns started |
| --- | --- | --- | --- | --- | --- | --- | --- |
| None (baseline) | Low-end Mode: Off | 9.1 | 109.7 ms | 3.9 | 54 MB | 2,400 MB | 6 |
| 960×540 | Low-end Resolution | 25.0 | 40.1 ms | 10.9 | 81 MB | 2,210 MB | 10–12 |
| 640×360 | Low-end Resolution | 53.9 | 18.5 ms | 22.6 | 78 MB | 2,161 MB | 16 |
| Baked palettes | Low-end Mode | 9.2 | 108.3 ms | 3.9 | 58 MB | 2,286 MB | 6 |
| 30 FPS cap | Low-end FPS Cap | 8.4 | 119.0 ms | 3.6 | 62 MB | 1,885 MB | 6 |
| Faster defaults | Low-end Mode | 8.6 | 116.3 ms | 3.8 | 70 MB | 1,915 MB | 6 |
| **Low-end Mode as shipped** (960×540, baking, defaults) | Low-end Mode: On | **33.3** | **30.0 ms** | **13.9** | 84 MB | 1,778 MB | 14 |
| **Low-end Mode at 640×360** | Low-end Resolution: 640x360 | **59.2** | **16.9 ms** | **31.7** | 85 MB | 1,697 MB | 18 |

\* Chrome and all helper processes. Shared memory counts more than once, so this only compares runs. The spread between similar runs is a few hundred MB, so small differences here are noise.

On the M5 with its real GPU, both normal mode and Low-end mode hold 60 FPS, with a 59.5 FPS 1% low, so this machine cannot show a difference.

## What the numbers show

- **The GPU is the bottleneck.** In the baseline trace, the GPU process is busy for 59.1 s of 59.2 s, and the main thread for about 3 s.
- **Resolution matters most.** 640×360 has one ninth of the pixels of 1920×1080 and gives about six times the FPS.
- **Baking and defaults have no measurable effect alone** while the frame is dominated by the 1080p fill. Together with 960×540, they raise FPS from 25.0 to 33.3. They were not measured separately at that resolution.
- **The 30 FPS cap cannot help here**, because this setup stays under 30 FPS at 1080p. It is meant for machines that swing between 30 and 60 FPS. Its pacing was not measured on such a machine.
- **The 45 FPS floor is not met in this stand-in.** The best setting averages 59.2 FPS, but its 1% low was 20.4 and 43.0 in two runs.
- **Game speed holds up better with more FPS.** Turns started rise from 6 to as many as 18 in 60 seconds. Part of that rise at the Low-end settings comes from the faster defaults. Below about 5 FPS, Phaser limits its time step, so the game slows down.

## The five biggest costs (baseline trace)

| # | Cost | Time in the 59.2 s trace |
| --- | --- | --- |
| 1 | GPU fill: drawing every pixel at 1920×1080 in software | 59.1 s, GPU process |
| 2 | JavaScript: game logic and Phaser's scene and render loop | 1.7 s, main thread |
| 3 | Other browser main-thread work | 1.1 s, main thread |
| 4 | Layout and paint, including the 2D canvases used for text | 0.13 s, main thread |
| 5 | Garbage collection | 0.05 s, main thread |

There are only about 11 draw calls and 450 vertices per frame, so draw call batching would not help. The shader's cost per pixel multiplies the fill cost, which is why resolution has such a large effect.

## Image quality

Compared on a frozen frame at 1920×1080:

- Two baseline runs match on every pixel, so the comparison is reliable.
- Baked palettes differ on 6.9% of pixels, and never by more than 1/255 per color channel, because of 8-bit rounding.
- Lower resolutions were checked by eye for text, HP bars and menus, which line up. Mouse tooltips were checked at 960×540 only.

## Memory and loading

A battle-ready session loads 914 files. The biggest groups are below.

| Group | Files | Size |
| --- | --- | --- |
| Fonts | 8 requests | 16.9 MB |
| Music (MP3) | 4 | 8.2 MB |
| Sound effects (WAV) | 99 | 7.2 MB |
| JavaScript | 32 | 6.3 MB |
| Images (PNG) | 462 | 2.1 MB |
| Atlas and animation data (JSON) | 193 | 2.1 MB |
| Translations (JSON) | 96 | 0.6 MB |

Sprites, music and move animations already load on demand. Splitting the rest by biome was not done, because it means a large refactor of the loading scene, and the JS heap is not the bottleneck.

Asset compression on the deployed build:

| Asset | Before | After | Note |
| --- | --- | --- | --- |
| PNG | 66.9 MiB | 63.3 MiB | Lossless, and every rewritten file passed a decoded-pixel check. 12 files the checker could not read are unchanged. |
| Sound effects | 41.0 MiB WAV | 11.4 MiB Opus | Used in Low-end mode, with the WAV kept as fallback. This is a smaller download, and is not expected to save RAM, as browsers decode audio to PCM. |

The Opus files and compressed PNGs affect download size only, and were not part of the benchmark runs above.
