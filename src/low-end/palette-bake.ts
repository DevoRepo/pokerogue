/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { globalScene } from "#app/global-scene";
import type Phaser from "phaser";

type WebGLTextureWrapper = Phaser.Renderer.WebGL.Wrappers.WebGLTextureWrapper;

export interface SpritePalettes {
  /** Colors matched by the shiny variant swap, scaled to 0-1. */
  variantBase: Float32Array;
  /** Replacements for the shiny variant swap, scaled to 0-1. */
  variantTarget: Float32Array;
  /** Colors matched by the fusion swap, scaled to 0-1. */
  fusionBase: Float32Array;
  /** Replacement colors for the fusion swap, in 0-255. */
  fusionTarget: Int32Array;
}

const PALETTE_SIZE = 32;
/** Each entry is a full sprite atlas on the GPU, so this bounds the extra video memory used. */
const MAX_BAKED_TEXTURES = 24;

/** `null` means this texture cannot be baked exactly, so it keeps using the shader path. */
const bakedTextures = new Map<string, { key: string; glTexture: WebGLTextureWrapper } | null>();
const paletteIds = new WeakMap<Float32Array | Int32Array, number>();
let nextPaletteId = 0;
let nextTextureId = 0;

function paletteId(palette: Float32Array | Int32Array): number {
  let id = paletteIds.get(palette);
  if (id === undefined) {
    id = nextPaletteId++;
    paletteIds.set(palette, id);
  }
  return id;
}

const packColor = (r: number, g: number, b: number): number => (r << 16) | (g << 8) | b;

function to8Bit(value: number): number {
  return Math.round(Math.min(1, Math.max(0, value)) * 255);
}

/** Builds the same first-match lookup as the shader's variant swap. */
function buildVariantLookup(base: Float32Array, target: Float32Array): Map<number, number> {
  const lookup = new Map<number, number>();
  for (let i = 0; i < PALETTE_SIZE && base[i * 4 + 3] !== 0; i++) {
    const from = packColor(to8Bit(base[i * 4]), to8Bit(base[i * 4 + 1]), to8Bit(base[i * 4 + 2]));
    if (!lookup.has(from)) {
      lookup.set(from, packColor(to8Bit(target[i * 4]), to8Bit(target[i * 4 + 1]), to8Bit(target[i * 4 + 2])));
    }
  }
  return lookup;
}

/** Builds the same first-match lookup and overlay blend as the shader's fusion swap. */
function buildFusionLookup(base: Float32Array, target: Int32Array): Map<number, number> {
  const lookup = new Map<number, number>();
  for (let i = 0; i < PALETTE_SIZE && base[i * 4 + 3] !== 0; i++) {
    const r = base[i * 4];
    const g = base[i * 4 + 1];
    const b = base[i * 4 + 2];
    const from = packColor(to8Bit(r), to8Bit(g), to8Bit(b));
    if (lookup.has(from)) {
      continue;
    }
    const gray = (r + g + b) / 3;
    const blend = (channel: number): number => {
      const foreground = channel / 255;
      return gray <= 0.5 ? 2 * gray * foreground : 1 - 2 * (1 - gray) * (1 - foreground);
    };
    lookup.set(
      from,
      packColor(to8Bit(blend(target[i * 4])), to8Bit(blend(target[i * 4 + 1])), to8Bit(blend(target[i * 4 + 2]))),
    );
  }
  return lookup;
}

/**
 * Recolors an image's pixels in place.
 * @returns Whether the recolor is exact. Partly transparent pixels are not, because of premultiplied alpha.
 */
export function recolorPixels(pixels: Uint8ClampedArray, palettes: SpritePalettes): boolean {
  const variant = buildVariantLookup(palettes.variantBase, palettes.variantTarget);
  const fusion = buildFusionLookup(palettes.fusionBase, palettes.fusionTarget);
  for (let i = 0; i < pixels.length; i += 4) {
    const alpha = pixels[i + 3];
    if (alpha === 0) {
      continue;
    }
    if (alpha !== 255) {
      return false;
    }
    let color = packColor(pixels[i], pixels[i + 1], pixels[i + 2]);
    // As in the shader, the fusion swap sees the result of the variant swap.
    color = variant.get(color) ?? color;
    color = fusion.get(color) ?? color;
    pixels[i] = color >> 16;
    pixels[i + 1] = (color >> 8) & 255;
    pixels[i + 2] = color & 255;
  }
  return true;
}

function bake(sprite: Phaser.GameObjects.Sprite, palettes: SpritePalettes) {
  const source = sprite.texture.source[0];
  const image = source.image as CanvasImageSource | undefined;
  if (sprite.texture.source.length !== 1 || !image) {
    return null;
  }
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return null;
  }
  context.drawImage(image, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  if (!recolorPixels(imageData.data, palettes)) {
    return null;
  }
  context.putImageData(imageData, 0, 0);

  const key = `__palette_baked_${nextTextureId++}`;
  const texture = globalScene.textures.addCanvas(key, canvas);
  const glTexture = texture?.source[0].glTexture;
  return glTexture ? { key, glTexture } : null;
}

/** @returns A texture with the palettes already applied, or `null` if the shader must do the swap. */
export function getBakedTexture(
  sprite: Phaser.GameObjects.Sprite,
  palettes: SpritePalettes,
): WebGLTextureWrapper | null {
  const cacheKey = [
    sprite.texture.key,
    paletteId(palettes.variantBase),
    paletteId(palettes.variantTarget),
    paletteId(palettes.fusionBase),
    paletteId(palettes.fusionTarget),
  ].join("|");

  const cached = bakedTextures.get(cacheKey);
  if (cached !== undefined) {
    // Reinserting keeps the map in least-recently-used order.
    bakedTextures.delete(cacheKey);
    bakedTextures.set(cacheKey, cached);
    return cached?.glTexture ?? null;
  }

  const baked = bake(sprite, palettes);
  bakedTextures.set(cacheKey, baked);
  if (bakedTextures.size > MAX_BAKED_TEXTURES) {
    const [oldestKey, oldest] = bakedTextures.entries().next().value as [string, { key: string } | null];
    bakedTextures.delete(oldestKey);
    if (oldest) {
      globalScene.textures.remove(oldest.key);
    }
  }
  return baked?.glTexture ?? null;
}
