<!--
SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# Running the Low-end benchmark

The benchmark is a fixed 60-second double battle: wave 25, rain, and shiny variant fusions on both sides. A build made with `--mode benchmark` starts it by itself and presses the buttons for you.

## On the old laptop

You need one machine to build and serve the benchmark, and it can be the same laptop or your main PC.

1. On the machine with the repo, build and serve the benchmark:

   ```bash
   corepack pnpm exec vite build --mode benchmark
   corepack pnpm exec vite preview --mode benchmark --host --port 4173
   ```

2. On the old laptop, close other programs, plug in the charger, and set Windows power mode to **Best performance**.
3. In Chrome on the old laptop, open an **Incognito** window so the run starts from a clean profile. Open `http://<address-of-the-build-machine>:4173/`. Use `localhost` if the laptop is also serving the build.
4. Press **F12**, open the **Console** tab, then leave the window alone and focused.
5. The battle starts after loading. About 60 seconds after the first command menu, a line starting with `[benchmark]` appears in the console.
6. Copy that whole line and send it back. It holds FPS, frame time, 1% low FPS, heap size and the GPU name.
7. Run it three times, closing the Incognito window between runs.

## Testing individual Low-end settings

Add these to the address. They only work in benchmark builds.

| Address ending | What it tests |
| --- | --- |
| *(nothing)* | Baseline, with normal rendering |
| `?res=540` | 960×540 internal resolution |
| `?res=360` | 640×360 internal resolution |
| `?bake=1` | Cached palette textures |
| `?fps=30` | 30 FPS cap |
| `?defaults=1` | Low-end defaults for existing settings |
| `?res=540&bake=1&defaults=1` | Everything Low-end mode turns on by default |

## Profiling in DevTools

1. Open **Performance** in DevTools, and start recording when the first command menu appears.
2. Stop after 30 seconds. The summary shows Scripting, Rendering, Painting and System time. Time in the **GPU** track is the graphics cost.
3. Open **Memory** and take a heap snapshot to see JS memory.

## On the build machine (automated)

`scripts/benchmark/profile.mjs` runs this in headless Chrome and writes a summary with a time breakdown and the hottest functions. It expects Chrome in the default macOS location, or set `CHROME_PATH`.

```bash
node scripts/benchmark/profile.mjs --preset weak --query "res=540&bake=1" --label low-end
```

`--preset weak` uses software WebGL and a 4× CPU slowdown. This is only a rough stand-in for an old laptop, so real laptop numbers always take priority.
