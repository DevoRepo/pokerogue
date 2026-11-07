/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { recolorPixels, type SpritePalettes } from "#app/low-end/palette-bake";
import { describe, expect, it } from "vitest";

function floatPalette(...colors: number[][]): Float32Array {
  const palette = new Float32Array(32 * 4);
  colors.forEach((color, index) => {
    palette.set(
      color.map(channel => channel / 255),
      index * 4,
    );
  });
  return palette;
}

function palettes(overrides: Partial<SpritePalettes>): SpritePalettes {
  return {
    variantBase: new Float32Array(32 * 4),
    variantTarget: new Float32Array(32 * 4),
    fusionBase: new Float32Array(32 * 4),
    fusionTarget: new Int32Array(32 * 4),
    ...overrides,
  };
}

describe("recolorPixels", () => {
  it("swaps matching variant colors and leaves other pixels alone", () => {
    const pixels = new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 255]);
    const exact = recolorPixels(
      pixels,
      palettes({
        variantBase: floatPalette([10, 20, 30, 255]),
        variantTarget: floatPalette([200, 100, 50, 255]),
      }),
    );
    expect(exact).toBe(true);
    expect([...pixels]).toEqual([200, 100, 50, 255, 40, 50, 60, 255]);
  });

  it("applies the shader's fusion blend to the result of the variant swap", () => {
    const pixels = new Uint8ClampedArray([1, 2, 3, 255]);
    const fusionTarget = new Int32Array(32 * 4);
    fusionTarget.set([255, 128, 0, 255]);
    recolorPixels(
      pixels,
      palettes({
        variantBase: floatPalette([1, 2, 3, 255]),
        variantTarget: floatPalette([60, 60, 60, 255]),
        fusionBase: floatPalette([60, 60, 60, 255]),
        fusionTarget,
      }),
    );
    // Gray is 60/255, which is under 0.5, so each channel is 2 * gray * target.
    expect([...pixels]).toEqual([120, 60, 0, 255]);
  });

  it("skips fully transparent pixels", () => {
    const pixels = new Uint8ClampedArray([10, 20, 30, 0]);
    recolorPixels(
      pixels,
      palettes({
        variantBase: floatPalette([10, 20, 30, 255]),
        variantTarget: floatPalette([200, 100, 50, 255]),
      }),
    );
    expect([...pixels]).toEqual([10, 20, 30, 0]);
  });

  it("reports partly transparent pixels as not exact, so the shader path is kept", () => {
    expect(recolorPixels(new Uint8ClampedArray([10, 20, 30, 128]), palettes({}))).toBe(false);
  });
});
