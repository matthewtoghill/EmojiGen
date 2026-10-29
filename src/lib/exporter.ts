import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import {
  DEFAULT_UNIVERSAL_MODIFIERS,
  type LoadedEmoji,
  type ParamValues,
  type UniversalModifiers,
} from '../types/emoji';
import { renderEmojiFrame } from './renderer';

export interface ExportResult {
  blob: Blob;
  dataUrl: string;
  sizeBytes: number;
  frameCount: number;
  fps: number;
  width: number;
  height: number;
  optimizedNote?: string;
}

export interface GifTimingPlan {
  frames: number;
  delayMs: number;
  fps: number;
  effectiveDurationSec: number;
}

const SLACK_MAX_BYTES = 128 * 1024; // 128 KB
const EXPORT_SIZE = 128;
const ALPHA_CUTOFF = 96;
// Dark neutral matte (#1A1D21 Slack dark background) for smoothing semi-transparent edge pixels
const MATTE_R = 26;
const MATTE_G = 29;
const MATTE_B = 33;
const MAX_PALETTE_SAMPLE_FRAMES = 12;

export function getEffectiveDurationSeconds(
  duration = DEFAULT_UNIVERSAL_MODIFIERS.duration,
  speed = DEFAULT_UNIVERSAL_MODIFIERS.speed
): number {
  return Math.max(0.4, (duration || 1.2) / Math.max(0.25, speed || 1));
}

/**
 * Computes a frame count and 10ms-rounded GIF frame delay (in ms) so that
 * `frames * delayMs` matches `effectiveDurationSec * 1000` as closely as possible
 * (preferring frame counts that divide the total centiseconds evenly).
 */
export function computeGifTiming(
  effectiveDurationSec: number,
  maxFps: number = DEFAULT_UNIVERSAL_MODIFIERS.fps,
  maxFrames: number = 36,
  minFrames: number = 8
): GifTimingPlan {
  // GIF frame delays are stored in centiseconds (10ms units), with 20ms (2cs) minimum
  const totalCs = Math.max(16, Math.round(effectiveDurationSec * 100));
  const clampedFps = Math.max(8, Math.min(30, maxFps || 20));
  const upperFrames = Math.max(
    minFrames,
    Math.min(maxFrames, Math.round(effectiveDurationSec * clampedFps))
  );
  const lowerFrames = Math.max(minFrames, Math.round(upperFrames * 0.85));

  let bestFrames = upperFrames;
  let bestDelayCs = Math.max(2, Math.round(totalCs / upperFrames));
  let bestErrorCs = Math.abs(bestFrames * bestDelayCs - totalCs);
  let bestFrameDiff = 0;

  for (let f = upperFrames; f >= lowerFrames; f--) {
    const delayCs = Math.max(2, Math.round(totalCs / f));
    const errorCs = Math.abs(f * delayCs - totalCs);
    const frameDiff = upperFrames - f;

    // Prefer exact divisors (errorCs === 0) or smaller loop duration drift near upperFrames
    if (
      errorCs < bestErrorCs ||
      (errorCs === bestErrorCs && frameDiff < bestFrameDiff)
    ) {
      bestFrames = f;
      bestDelayCs = delayCs;
      bestErrorCs = errorCs;
      bestFrameDiff = frameDiff;
      if (errorCs === 0) {
        break;
      }
    }
  }

  const delayMs = bestDelayCs * 10;
  const effectiveFps = Math.round((1000 / delayMs) * 10) / 10;

  return {
    frames: bestFrames,
    delayMs,
    fps: effectiveFps,
    effectiveDurationSec,
  };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function exportEmojiToPng(
  emoji: LoadedEmoji,
  customParams: ParamValues,
  partialModifiers?: Partial<UniversalModifiers>,
  t: number = 0,
  rasterImage?: HTMLImageElement | null
): Promise<ExportResult> {
  const canvas = document.createElement('canvas');
  canvas.width = EXPORT_SIZE;
  canvas.height = EXPORT_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not initialize 2D canvas context');

  renderEmojiFrame(ctx, emoji, customParams, partialModifiers, t, rasterImage);

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encode failed'))), 'image/png');
  });

  const dataUrl = await blobToDataUrl(blob);
  return {
    blob,
    dataUrl,
    sizeBytes: blob.size,
    frameCount: 1,
    fps: 1,
    width: EXPORT_SIZE,
    height: EXPORT_SIZE,
  };
}

interface PreparedFrame {
  cleanedRgba: Uint8ClampedArray;
  transparentMask: Uint8Array;
  opaqueCount: number;
}

interface FrameBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

function canKeepPreviousFrame(curr: Uint8Array, next: Uint8Array): boolean {
  for (let p = 0; p < curr.length; p++) {
    if (curr[p] !== 0 && next[p] === 0) {
      return false;
    }
  }
  return true;
}

function findNonZeroBounds(
  indices: Uint8Array,
  width: number,
  height: number
): FrameBounds {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      if (indices[rowOffset + x] !== 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return { x: 0, y: 0, width: 1, height: 1 };
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

function extractSubFrame(
  indices: Uint8Array,
  fullWidth: number,
  bounds: FrameBounds
): Uint8Array {
  if (
    bounds.x === 0 &&
    bounds.y === 0 &&
    bounds.width === fullWidth &&
    bounds.height * fullWidth === indices.length
  ) {
    return indices;
  }

  const sub = new Uint8Array(bounds.width * bounds.height);
  for (let row = 0; row < bounds.height; row++) {
    const srcStart = (bounds.y + row) * fullWidth + bounds.x;
    sub.set(
      indices.subarray(srcStart, srcStart + bounds.width),
      row * bounds.width
    );
  }
  return sub;
}

function encodeGifPass(
  emoji: LoadedEmoji,
  customParams: ParamValues,
  modifiers: UniversalModifiers,
  frameCount: number,
  delayMs: number,
  maxColors: number,
  rasterImage?: HTMLImageElement | null
): Uint8Array {
  const canvas = document.createElement('canvas');
  canvas.width = EXPORT_SIZE;
  canvas.height = EXPORT_SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not initialize 2D canvas context');

  const totalPixels = EXPORT_SIZE * EXPORT_SIZE;
  const preparedFrames: PreparedFrame[] = [];

  // 1. Render all frames and blend semi-transparent edge pixels against a dark neutral matte
  for (let i = 0; i < frameCount; i++) {
    const t = i / frameCount;
    renderEmojiFrame(ctx, emoji, customParams, modifiers, t, rasterImage);
    const imgData = ctx.getImageData(0, 0, EXPORT_SIZE, EXPORT_SIZE);
    const rgba = imgData.data;

    const transparentMask = new Uint8Array(totalPixels);
    const cleanedRgba = new Uint8ClampedArray(rgba.length);
    let opaqueCount = 0;

    for (let p = 0; p < totalPixels; p++) {
      const idx = p * 4;
      const a = rgba[idx + 3];
      if (a < ALPHA_CUTOFF) {
        transparentMask[p] = 1;
        cleanedRgba[idx] = 0;
        cleanedRgba[idx + 1] = 0;
        cleanedRgba[idx + 2] = 0;
        cleanedRgba[idx + 3] = 0;
      } else {
        transparentMask[p] = 0;
        opaqueCount++;
        if (a < 255) {
          // Smooth semi-transparent edge pixels against Slack dark neutral (#1A1D21)
          const alpha = a / 255;
          const invAlpha = 1 - alpha;
          cleanedRgba[idx] = Math.round(rgba[idx] * alpha + MATTE_R * invAlpha);
          cleanedRgba[idx + 1] = Math.round(rgba[idx + 1] * alpha + MATTE_G * invAlpha);
          cleanedRgba[idx + 2] = Math.round(rgba[idx + 2] * alpha + MATTE_B * invAlpha);
        } else {
          cleanedRgba[idx] = rgba[idx];
          cleanedRgba[idx + 1] = rgba[idx + 1];
          cleanedRgba[idx + 2] = rgba[idx + 2];
        }
        cleanedRgba[idx + 3] = 255;
      }
    }

    preparedFrames.push({ cleanedRgba, transparentMask, opaqueCount });
  }

  // 2. Build one global palette from opaque pixels sampled across frames (excluding transparent pixels)
  const sampleFrameCount = Math.min(frameCount, MAX_PALETTE_SAMPLE_FRAMES);
  const sampledFrameIndices: number[] = [];
  let totalSampleOpaquePixels = 0;

  for (let s = 0; s < sampleFrameCount; s++) {
    const frameIdx = Math.min(
      frameCount - 1,
      Math.floor((s * frameCount) / sampleFrameCount)
    );
    sampledFrameIndices.push(frameIdx);
    totalSampleOpaquePixels += preparedFrames[frameIdx].opaqueCount;
  }

  let rawPalette: number[][];
  if (totalSampleOpaquePixels > 0) {
    const opaqueSamples = new Uint8Array(totalSampleOpaquePixels * 4);
    let writeOffset = 0;
    for (const frameIdx of sampledFrameIndices) {
      const { cleanedRgba, transparentMask } = preparedFrames[frameIdx];
      for (let p = 0; p < totalPixels; p++) {
        if (transparentMask[p] === 0) {
          const srcIdx = p * 4;
          opaqueSamples[writeOffset] = cleanedRgba[srcIdx];
          opaqueSamples[writeOffset + 1] = cleanedRgba[srcIdx + 1];
          opaqueSamples[writeOffset + 2] = cleanedRgba[srcIdx + 2];
          opaqueSamples[writeOffset + 3] = 255;
          writeOffset += 4;
        }
      }
    }

    rawPalette = quantize(opaqueSamples, Math.max(15, maxColors - 1), {
      format: 'rgb565',
    });
    if (!rawPalette || rawPalette.length === 0) {
      rawPalette = [[0, 0, 0]];
    }
  } else {
    rawPalette = [[0, 0, 0]];
  }

  // Reserve palette index 0 for transparency
  const globalPalette: number[][] = [[0, 0, 0], ...rawPalette];

  // 3. Map all frames to the shared global palette
  const fullFrameIndices: Uint8Array[] = preparedFrames.map(
    ({ cleanedRgba, transparentMask }) => {
      const mapped = applyPalette(cleanedRgba, rawPalette, 'rgb565');
      const indices = new Uint8Array(totalPixels);
      for (let p = 0; p < totalPixels; p++) {
        indices[p] =
          transparentMask[p] === 1 ? 0 : Math.min(255, mapped[p] + 1);
      }
      return indices;
    }
  );

  // 4. Encode frames using global palette, inter-frame diffing, and bounding-box cropping
  const gif = GIFEncoder();
  let prevKeptOnCanvas = false;

  for (let i = 0; i < frameCount; i++) {
    const currentFull = fullFrameIndices[i];
    const keepForNext =
      i < frameCount - 1 &&
      canKeepPreviousFrame(currentFull, fullFrameIndices[i + 1]);
    const dispose = keepForNext ? 1 : 2;

    if (i === 0) {
      gif.writeFrame(currentFull, EXPORT_SIZE, EXPORT_SIZE, {
        palette: globalPalette,
        delay: delayMs,
        transparent: true,
        transparentIndex: 0,
        dispose,
        repeat: 0,
      });
    } else {
      let framePixels = currentFull;
      if (prevKeptOnCanvas) {
        const prevFull = fullFrameIndices[i - 1];
        const diffPixels = new Uint8Array(totalPixels);
        for (let p = 0; p < totalPixels; p++) {
          diffPixels[p] =
            currentFull[p] === prevFull[p] ? 0 : currentFull[p];
        }
        framePixels = diffPixels;
      }

      // When dispose === 1 (keep), we only need to cover changed pixels.
      // When dispose === 2 (clear to background), the frame rect must cover all opaque pixels
      // currently on the canvas so that disposing frame i clears the entire emoji cleanly.
      const bounds =
        dispose === 1
          ? findNonZeroBounds(framePixels, EXPORT_SIZE, EXPORT_SIZE)
          : findNonZeroBounds(currentFull, EXPORT_SIZE, EXPORT_SIZE);

      const croppedPixels = extractSubFrame(
        framePixels,
        EXPORT_SIZE,
        bounds
      );
      const frameStartOffset = gif.bytesView().byteLength;

      gif.writeFrame(croppedPixels, bounds.width, bounds.height, {
        delay: delayMs,
        transparent: true,
        transparentIndex: 0,
        dispose,
      });

      // Patch the GIF Image Descriptor's left/top coordinates (gifenc writes 0,0 by default)
      if (bounds.x !== 0 || bounds.y !== 0) {
        const streamView = gif.bytesView();
        // Graphic Control Extension is 8 bytes; Image Descriptor starts with 0x2c at +8
        if (streamView[frameStartOffset + 8] === 0x2c) {
          streamView[frameStartOffset + 9] = bounds.x & 0xff;
          streamView[frameStartOffset + 10] = (bounds.x >> 8) & 0xff;
          streamView[frameStartOffset + 11] = bounds.y & 0xff;
          streamView[frameStartOffset + 12] = (bounds.y >> 8) & 0xff;
        }
      }
    }

    prevKeptOnCanvas = keepForNext;
  }

  gif.finish();
  return gif.bytes();
}

export async function exportEmojiToGif(
  emoji: LoadedEmoji,
  customParams: ParamValues,
  partialModifiers?: Partial<UniversalModifiers>,
  rasterImage?: HTMLImageElement | null
): Promise<ExportResult> {
  const modifiers: UniversalModifiers = {
    ...DEFAULT_UNIVERSAL_MODIFIERS,
    ...(emoji.manifest.modifiers || {}),
    ...(partialModifiers || {}),
  };

  const baseFps = Math.max(8, Math.min(30, modifiers.fps || 20));
  const effectiveDuration = getEffectiveDurationSeconds(
    modifiers.duration,
    modifiers.speed
  );

  // Progressive optimization passes to fit within Slack's 128 KB limit
  const passConfigs = [
    { maxFrames: 36, maxFps: baseFps, colors: 192, isFallback: false },
    {
      maxFrames: 20,
      maxFps: Math.min(baseFps, 18),
      colors: 128,
      isFallback: true,
    },
    {
      maxFrames: 16,
      maxFps: Math.min(baseFps, 15),
      colors: 64,
      isFallback: true,
    },
    {
      maxFrames: 12,
      maxFps: Math.min(baseFps, 12),
      colors: 32,
      isFallback: true,
    },
  ];

  const initialTiming = computeGifTiming(effectiveDuration, baseFps, 36);
  let bytes: Uint8Array<ArrayBufferLike> = new Uint8Array();
  let chosenTiming = initialTiming;
  let chosenColors = passConfigs[0].colors;
  let usedFallback = false;

  for (const config of passConfigs) {
    const timing = computeGifTiming(
      effectiveDuration,
      config.maxFps,
      config.maxFrames,
      config.maxFrames < 8 ? config.maxFrames : 8
    );

    bytes = encodeGifPass(
      emoji,
      customParams,
      modifiers,
      timing.frames,
      timing.delayMs,
      config.colors,
      rasterImage
    );
    chosenTiming = timing;
    chosenColors = config.colors;
    usedFallback = config.isFallback;

    if (bytes.byteLength <= SLACK_MAX_BYTES) {
      break;
    }
  }

  let optimizedNote: string | undefined;
  if (bytes.byteLength > SLACK_MAX_BYTES) {
    const sizeKb = (bytes.byteLength / 1024).toFixed(1);
    optimizedNote = `Export is ${sizeKb} KB (over Slack's 128 KB limit) even after maximum compression (${chosenTiming.frames} frames, ${chosenColors} colors). Try reducing motion or visual complexity.`;
  } else if (usedFallback) {
    if (chosenTiming.frames < initialTiming.frames) {
      optimizedNote = `Auto-compressed (${chosenTiming.frames} frames, ${chosenColors} colors) to fit under Slack 128 KB limit`;
    } else {
      optimizedNote = `Auto-optimized palette (${chosenColors} colors) to stay under Slack 128 KB limit`;
    }
  }

  const blob = new Blob([new Uint8Array(bytes)], { type: 'image/gif' });
  const dataUrl = await blobToDataUrl(blob);

  return {
    blob,
    dataUrl,
    sizeBytes: blob.size,
    frameCount: chosenTiming.frames,
    fps: chosenTiming.fps,
    width: EXPORT_SIZE,
    height: EXPORT_SIZE,
    optimizedNote,
  };
}
