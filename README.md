<!--
SPDX-FileCopyrightText: 2024-2026 Pagefault Games

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

<div align="center"><picture><img src="https://github.com/pagefaultgames/pokerogue-assets/blob/beta/images/logo.png?raw=true" width="300" alt="PokéRogue"></picture>

[![Discord Static Badge](https://img.shields.io/badge/Community_Discord-blurple?style=flat&logo=discord&logoSize=auto&labelColor=white&color=5865F2)](https://discord.gg/pokerogue)
[![Test Coverage Endpoint Badge](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/Bertie690/9cdfc49361824d1d5a57b7e8b38855d8/raw/coverage-badge.json)](https://github.com/pagefaultgames/pokerogue/actions/workflows/tests.yml) \
[![Docs Coverage Static Badge](https://pagefaultgames.github.io/pokerogue/beta/coverage.svg)](https://pagefaultgames.github.io/pokerogue/beta)
[![Biome Linting Static Badge](https://img.shields.io/badge/Linted_with-Biome-60a5fa?style=flat&logo=biome)](https://biomejs.dev)
[![GNU AGPLv3 License Static Badge](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
</div>

PokéRogue is a browser based Pokémon fangame heavily inspired by the roguelite genre. Battle endlessly while gathering stacking items, exploring many different biomes, fighting trainers, bosses, and more!

# Low-end mode (this fork)

This is a personal, non-commercial fork of [PokéRogue](https://github.com/pagefaultgames/pokerogue) with an optional mode for old laptops. Gameplay and balance are unchanged, and normal mode renders as upstream does.

Turn it on under **Settings > Display > Low-end Mode**, or accept the offer shown on first launch if your GPU looks weak. The game reloads when you change it.

| Setting | Options | What it does |
| --- | --- | --- |
| Low-end Mode | Off, On | Turns on everything below, plus faster game, HP bar and EXP speeds and simple damage numbers. You can change those back. |
| Low-end Resolution | 960x540, 640x360 | Draws fewer pixels and stretches them sharply to fit. This is the biggest gain, so try 640x360 if 960x540 is not smooth. |
| Low-end FPS Cap | Off, 30 | Holds an even 30 FPS. The game runs at the same speed. |

Low-end mode also recolors shiny and fusion sprites once into a cached texture, and loads smaller Opus sound effects when the deployment provides them.

Measurements are in [docs/low-end-results.md](./docs/low-end-results.md), and you can repeat them with [docs/low-end-benchmark.md](./docs/low-end-benchmark.md).

## Backing up saves

On this deployment, saves live only in your browser's local storage, so clearing site data or changing browser or device loses them unless you have a backup.

- **Back up:** Menu > Manage Data > **Export Data** saves your account data. Use **Export Session** for each run in progress, and **Export Run History** for your history.
- **Restore:** Menu > Manage Data > **Import Data** or **Import Session**, then choose the `.prsv` file.

## Deploying privately

See [docs/private-deploy.md](./docs/private-deploy.md).

# Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md), this includes instructions on how to set up the game locally.

# 📝 Credits

> If this project contains assets you have produced and you do not see your name, **please** reach out, either [here on GitHub](https://github.com/pagefaultgames/pokerogue/issues/new) or via [Discord](https://discord.gg/pokerogue).

Thank you to all the wonderful people that have contributed to the PokéRogue project! You can find the credits [here](./CREDITS.md).

# Licensing

This repository seeks to be [REUSE compliant](https://reuse.software/): copyright and/or licensing information for each file is stored
either in the file itself or in an associated `REUSE.toml` file.

The full licensing information for each file can be found by utilizing [REUSE's tooling](https://github.com/fsfe/reuse-tool), such as via `reuse spdx`. \
An abbreviated summary of said information is as follows:
- All source code belonging to the project, unless otherwise noted, is licensed under [AGPL-v3.0-only](LICENSES/AGPL-3.0-only.txt).
- All forms of documentation (both Markdown files[^1] and any comments explicitly documenting source code) are licensed under [CC-BY-NC-SA-4.0](LICENSES/CC-BY-NC-SA-4.0.txt).
- Auto-generated files produced by external tools or files of insignificant originality are not copyrighted and are licensed under [CC0-1.0](LICENSES/CC0-1.0.txt).
- To the extent that the assets we provide are [licensable and applicable](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.en#ref-exception-or-limitation), they are licensed under [CC-BY-NC-SA-4.0](LICENSES/CC-BY-NC-SA-4.0.txt) unless otherwise noted.
  Exceptions can be found in associated `REUSE.toml` files.
  - ⚠️ Files in `assets/` that are not explicitly licensed via `REUSE.toml` files should be considered to have _no_ licensing / copyright information.

[^1]: Including this README
