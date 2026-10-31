import {
  DEFAULT_UNIVERSAL_MODIFIERS,
  type LoadedEmoji,
  type ParamValues,
  type UniversalModifiers,
} from '../types/emoji';

const VIRTUAL_SIZE = 128;

export function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/**
 * Deterministic pseudo-random in [0, 1) for a seed so frame rendering is 100% repeatable
 */
export function seededRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** Decoded raster asset: one frame for still images, several for animated GIF/WebP/APNG. */
export interface RasterImage {
  frames: CanvasImageSource[];
  /** Cumulative end time of each frame in ms; the last entry is the loop length */
  ends: number[];
  width: number;
  height: number;
}

/** Decodes every frame of an image URL. Falls back to a single frame where ImageDecoder is unavailable. */
export async function decodeRasterImage(url: string): Promise<RasterImage> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;
  await img.decode();
  const still: RasterImage = {
    frames: [img],
    ends: [1],
    width: img.naturalWidth,
    height: img.naturalHeight,
  };
  if (typeof ImageDecoder === 'undefined') return still;

  const blob = await (await fetch(url)).blob();
  if (!blob.type || !(await ImageDecoder.isTypeSupported(blob.type))) return still;
  const decoder = new ImageDecoder({ data: blob.stream(), type: blob.type });
  try {
    await decoder.completed;
    const count = decoder.tracks.selectedTrack?.frameCount ?? 1;
    if (count <= 1) return still;
    const frames: CanvasImageSource[] = [];
    const ends: number[] = [];
    let elapsed = 0;
    for (let i = 0; i < count; i++) {
      const { image } = await decoder.decode({ frameIndex: i });
      // Browsers play GIF delays under 20ms as 100ms; match that
      const ms = (image.duration ?? 0) / 1000;
      elapsed += ms < 20 ? 100 : ms;
      frames.push(await createImageBitmap(image));
      ends.push(elapsed);
      image.close();
    }
    return { ...still, frames, ends };
  } finally {
    decoder.close();
  }
}

const rasterCache = new Map<string, Promise<RasterImage>>();

/** Drops a cached decode, e.g. for a temporary object URL. */
export function evictRasterImage(url: string) {
  rasterCache.delete(url);
}

/** Cached decodeRasterImage so every canvas shares one decoded copy per asset. */
export function loadRasterImage(url: string): Promise<RasterImage> {
  let pending = rasterCache.get(url);
  if (!pending) {
    pending = decodeRasterImage(url);
    pending.catch(() => rasterCache.delete(url));
    rasterCache.set(url, pending);
  }
  return pending;
}

export interface RasterCleanup {
  autoCrop: boolean;
  removeBg: boolean;
  /** 0-100: how far a pixel's colour may be from the background colour and still be removed */
  bgTolerance: number;
}

const PROCESS_MAX_SIZE = 512;
const ALPHA_EMPTY = 8;

function createCanvas(w: number, h: number) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

/** Top-left pixel colour of the first frame, or null when it is transparent. */
function sampleBackground(data: Uint8ClampedArray): [number, number, number] | null {
  return data[3] < ALPHA_EMPTY ? null : [data[0], data[1], data[2]];
}

/**
 * Clears background pixels connected to the image edges (flood fill), so matching colours
 * inside the artwork (e.g. white eyes on a white background) are kept.
 */
export function clearConnectedBackground(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  bg: [number, number, number],
  tolerance: number
) {
  const limit = (tolerance / 100) * 255;
  const isBg = (i: number) =>
    data[i * 4 + 3] < ALPHA_EMPTY ||
    Math.max(
      Math.abs(data[i * 4] - bg[0]),
      Math.abs(data[i * 4 + 1] - bg[1]),
      Math.abs(data[i * 4 + 2] - bg[2])
    ) <= limit;
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  const visit = (i: number) => {
    if (!seen[i] && isBg(i)) {
      seen[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) {
    visit(x);
    visit((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    visit(y * w);
    visit(y * w + w - 1);
  }
  while (stack.length) {
    const i = stack.pop()!;
    data[i * 4 + 3] = 0;
    const x = i % w;
    if (x > 0) visit(i - 1);
    if (x < w - 1) visit(i + 1);
    if (i >= w) visit(i - w);
    if (i < w * (h - 1)) visit(i + w);
  }
}

/** Applies background removal and auto-crop to every frame. Crop uses the union of all frames so animation stays aligned. */
export function cleanupRasterImage(src: RasterImage, opts: RasterCleanup): RasterImage {
  const scale = Math.min(1, PROCESS_MAX_SIZE / Math.max(src.width, src.height));
  const w = Math.max(1, Math.round(src.width * scale));
  const h = Math.max(1, Math.round(src.height * scale));
  const images = src.frames.map((frame) => {
    const ctx = createCanvas(w, h).getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(frame, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h);
  });

  const bg = opts.removeBg ? sampleBackground(images[0].data) : null;
  if (bg) {
    for (const img of images) clearConnectedBackground(img.data, w, h, bg, opts.bgTolerance);
  }

  let minX = 0;
  let minY = 0;
  let maxX = w - 1;
  let maxY = h - 1;
  if (opts.autoCrop) {
    minX = w;
    minY = h;
    maxX = -1;
    maxY = -1;
    for (const { data } of images) {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (data[(y * w + x) * 4 + 3] >= ALPHA_EMPTY) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
    }
    if (maxX < 0) return src; // fully transparent: nothing to crop to
  }

  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;
  const frames = images.map((img) => {
    const canvas = createCanvas(cropW, cropH);
    canvas.getContext('2d')!.putImageData(img, -minX, -minY);
    return canvas;
  });
  return { frames, ends: src.ends, width: cropW, height: cropH };
}

// ponytail: small per-image cache (4 cleanup settings), so slider drags and exports reuse work
const cleanupCache = new WeakMap<RasterImage, { key: string; result: RasterImage }[]>();

function getCleanedRaster(src: RasterImage, params: ParamValues): RasterImage {
  const opts: RasterCleanup = {
    autoCrop: params.autoCrop === true,
    removeBg: params.removeBg === true,
    bgTolerance: Number(params.bgTolerance ?? 15),
  };
  if (!opts.autoCrop && !opts.removeBg) return src;
  const key = `${opts.autoCrop}|${opts.removeBg}|${opts.removeBg ? opts.bgTolerance : ''}`;
  const entries = cleanupCache.get(src) ?? [];
  let hit = entries.find((e) => e.key === key);
  if (!hit) {
    hit = { key, result: cleanupRasterImage(src, opts) };
    entries.unshift(hit);
    entries.length = Math.min(entries.length, 4);
    cleanupCache.set(src, entries);
  }
  return hit.result;
}

let outlineScratch: HTMLCanvasElement | null = null;

/** Die-cut sticker outline: stamps a solid-colour silhouette of the frame in rings around it. */
function drawShapeOutline(
  ctx: CanvasRenderingContext2D,
  frame: CanvasImageSource,
  x: number,
  y: number,
  w: number,
  h: number,
  width: number,
  color: string
) {
  outlineScratch ??= document.createElement('canvas');
  const scratch = outlineScratch;
  // 2x the virtual size keeps the silhouette sharp on the HiDPI preview without huge source images
  scratch.width = Math.max(1, Math.ceil(w * 2));
  scratch.height = Math.max(1, Math.ceil(h * 2));
  const sctx = scratch.getContext('2d')!;
  sctx.drawImage(frame, 0, 0, scratch.width, scratch.height);
  sctx.globalCompositeOperation = 'source-in';
  sctx.fillStyle = color;
  sctx.fillRect(0, 0, scratch.width, scratch.height);
  const steps = 16;
  for (let r = width; r > 0; r -= 1.5) {
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      ctx.drawImage(scratch, x + Math.cos(a) * r, y + Math.sin(a) * r, w, h);
    }
  }
}

/**
 * Renders a single frame of an emoji at normalized progress `t` in [0, 1)
 * onto the target canvas context.
 */
export function renderEmojiFrame(
  targetCtx: CanvasRenderingContext2D,
  emoji: LoadedEmoji,
  customParams: ParamValues,
  partialModifiers?: Partial<UniversalModifiers>,
  tRaw: number = 0,
  rasterImage?: RasterImage | null
) {
  const modifiers: UniversalModifiers = {
    ...DEFAULT_UNIVERSAL_MODIFIERS,
    ...(emoji.manifest.modifiers || {}),
    ...(partialModifiers || {}),
  };

  const params: ParamValues = {
    ...emoji.manifest.defaultParams,
    ...customParams,
  };

  // Normalize time t in [0, 1)
  const t = ((tRaw % 1) + 1) % 1;
  const tau = t * Math.PI * 2;

  const canvasW = targetCtx.canvas.width;
  const canvasH = targetCtx.canvas.height;
  const scaleFactorX = canvasW / VIRTUAL_SIZE;
  const scaleFactorY = canvasH / VIRTUAL_SIZE;

  targetCtx.save();
  targetCtx.clearRect(0, 0, canvasW, canvasH);
  targetCtx.scale(scaleFactorX, scaleFactorY);

  // 1. Optional Background Layer
  if (!modifiers.backgroundTransparent) {
    targetCtx.save();
    targetCtx.fillStyle = modifiers.backgroundColor || '#1e1b4b';
    drawRoundedRect(
      targetCtx,
      2,
      2,
      VIRTUAL_SIZE - 4,
      VIRTUAL_SIZE - 4,
      modifiers.backgroundRadius ?? 24
    );
    targetCtx.fill();
    targetCtx.restore();
  }

  // 2. Compute Universal Motion Transform
  let offsetX = 0;
  let offsetY = 0;
  let extraRotationRad = 0;
  let extraScaleX = 1;
  let extraScaleY = 1;
  const intensity = modifiers.motionIntensity ?? 1.0;

  switch (modifiers.motion) {
    case 'shake': {
      // Deterministic shake ("intensifies")
      const step = Math.floor(t * 12);
      offsetX = (seededRandom(step * 17 + 1) * 2 - 1) * 4.5 * intensity;
      offsetY = (seededRandom(step * 31 + 2) * 2 - 1) * 4.5 * intensity;
      extraRotationRad = (seededRandom(step * 47 + 3) * 2 - 1) * 0.08 * intensity;
      break;
    }
    case 'bounce': {
      const bounceWave = Math.abs(Math.sin(tau));
      offsetY = (0.35 - bounceWave) * 20 * intensity;
      // Squash and stretch at bottom of bounce
      const squash = Math.max(0, 1 - bounceWave * 2.5) * 0.16 * intensity;
      extraScaleX = 1 + squash;
      extraScaleY = 1 - squash;
      break;
    }
    case 'spin': {
      extraRotationRad = tau * (intensity >= 1.5 ? 2 : 1);
      break;
    }
    case 'pulse': {
      const pulse = Math.sin(tau);
      const s = 1 + pulse * 0.15 * intensity;
      extraScaleX = s;
      extraScaleY = s;
      break;
    }
    case 'wobble': {
      extraRotationRad = Math.sin(tau) * 0.25 * intensity;
      offsetX = Math.sin(tau) * 5 * intensity;
      extraScaleX = 1 + Math.cos(tau * 2) * 0.06 * intensity;
      extraScaleY = 1 - Math.cos(tau * 2) * 0.06 * intensity;
      break;
    }
    case 'party': {
      // Party combines a lively dance bounce + rainbow hue rotation
      const bounce = Math.abs(Math.sin(tau));
      offsetY = (0.4 - bounce) * 10 * intensity;
      offsetX = Math.sin(tau) * 5 * intensity;
      extraRotationRad = Math.sin(tau) * 0.14 * intensity;
      break;
    }
    case 'glitch': {
      const step = Math.floor(t * 16);
      if (seededRandom(step * 19) > 0.45) {
        offsetX = (seededRandom(step * 23) * 2 - 1) * 9 * intensity;
      }
      break;
    }
    default:
      break;
  }

  // 3. Apply Color Filters (Hue, Saturation, Brightness, Contrast, Party Rainbow)
  let totalHue = modifiers.hueRotate || 0;
  if (modifiers.motion === 'party') {
    totalHue = (totalHue + t * 360) % 360;
  }
  const hasFilter =
    totalHue !== 0 ||
    modifiers.saturate !== 100 ||
    modifiers.brightness !== 100 ||
    modifiers.contrast !== 100;

  targetCtx.save();
  if (hasFilter) {
    const filterParts: string[] = [];
    if (totalHue !== 0) filterParts.push(`hue-rotate(${totalHue.toFixed(1)}deg)`);
    if (modifiers.saturate !== 100) filterParts.push(`saturate(${modifiers.saturate}%)`);
    if (modifiers.brightness !== 100) filterParts.push(`brightness(${modifiers.brightness}%)`);
    if (modifiers.contrast !== 100) filterParts.push(`contrast(${modifiers.contrast}%)`);
    targetCtx.filter = filterParts.join(' ');
  }

  // 4. Apply Spatial Transforms around center (64, 64)
  targetCtx.translate(VIRTUAL_SIZE / 2 + offsetX, VIRTUAL_SIZE / 2 + offsetY);
  const baseRotRad = ((modifiers.rotation || 0) * Math.PI) / 180;
  targetCtx.rotate(baseRotRad + extraRotationRad);

  const flipSignX = modifiers.flipX ? -1 : 1;
  const flipSignY = modifiers.flipY ? -1 : 1;
  const baseScale = modifiers.scale || 1;
  targetCtx.scale(
    baseScale * extraScaleX * flipSignX,
    baseScale * extraScaleY * flipSignY
  );
  targetCtx.translate(-VIRTUAL_SIZE / 2, -VIRTUAL_SIZE / 2);

  // 5. Render the Emoji Content (Parametric or Raster)
  if (emoji.render) {
    emoji.render(targetCtx, {
      t,
      width: VIRTUAL_SIZE,
      height: VIRTUAL_SIZE,
      params,
    });
  } else if (rasterImage && rasterImage.width > 0) {
    const raster = getCleanedRaster(rasterImage, params);
    const pad = Number(params.padding ?? 4);
    const radius = Number(params.cornerRadius ?? 0);
    const borderW = Number(params.borderWidth ?? 0);
    const borderColor = String(params.borderColor ?? '#ffffff');
    // Older imports have no outlineStyle and keep the box outline
    const shapeOutline = params.outlineStyle === 'shape';

    // The shape outline grows outward, so leave room for it inside the canvas
    const drawBox = VIRTUAL_SIZE - pad * 2 - (shapeOutline ? borderW * 2 : 0);
    const imgAspect = raster.width / raster.height;
    const { ends } = raster;
    const frameMs = t * ends[ends.length - 1];
    const frameIdx = Math.max(0, ends.findIndex((end) => frameMs < end));
    let drawW = drawBox;
    let drawH = drawBox;
    if (imgAspect > 1) {
      drawH = drawBox / imgAspect;
    } else {
      drawW = drawBox * imgAspect;
    }
    const drawX = (VIRTUAL_SIZE - drawW) / 2;
    const drawY = (VIRTUAL_SIZE - drawH) / 2;

    const frame = raster.frames[frameIdx];
    if (shapeOutline && borderW > 0) {
      drawShapeOutline(targetCtx, frame, drawX, drawY, drawW, drawH, borderW, borderColor);
    }

    targetCtx.save();
    if (radius > 0) {
      drawRoundedRect(targetCtx, drawX, drawY, drawW, drawH, radius);
      targetCtx.clip();
    }
    targetCtx.drawImage(frame, drawX, drawY, drawW, drawH);
    targetCtx.restore();

    if (!shapeOutline && borderW > 0) {
      targetCtx.save();
      targetCtx.strokeStyle = borderColor;
      targetCtx.lineWidth = borderW;
      drawRoundedRect(targetCtx, drawX, drawY, drawW, drawH, radius);
      targetCtx.stroke();
      targetCtx.restore();
    }
  }

  targetCtx.restore(); // Restore spatial + filter transforms

  // 6. Optional Glitch Scanline Overlay
  if (modifiers.motion === 'glitch') {
    const step = Math.floor(t * 16);
    if (seededRandom(step * 41) > 0.35) {
      const sliceY = Math.floor(seededRandom(step * 53) * 100) + 10;
      const sliceH = Math.floor(seededRandom(step * 61) * 18) + 6;
      const shiftX = (seededRandom(step * 73) * 2 - 1) * 14 * intensity;
      targetCtx.save();
      targetCtx.fillStyle = seededRandom(step * 83) > 0.5 ? 'rgba(0, 255, 255, 0.28)' : 'rgba(255, 0, 128, 0.28)';
      targetCtx.fillRect(Math.max(0, shiftX), sliceY, VIRTUAL_SIZE, sliceH);
      targetCtx.restore();
    }
  }

  // 7. Universal Slack Badge / Text Overlay
  const badgeText = (modifiers.badgeText || '').trim();
  if (badgeText.length > 0) {
    renderBadgeOverlay(targetCtx, badgeText, modifiers);
  }

  targetCtx.restore();
}

function renderBadgeOverlay(
  ctx: CanvasRenderingContext2D,
  text: string,
  modifiers: UniversalModifiers
) {
  ctx.save();
  const badgeScale = modifiers.badgeScale || 1.0;

  // Dynamic font size so short texts like "LGTM" or "WIP" are bold & huge at 22px Slack size
  const baseFontSize =
    text.length <= 4 ? 28 : text.length <= 7 ? 22 : text.length <= 10 ? 17 : 14;
  const fontSize = Math.round(baseFontSize * badgeScale);

  ctx.font = `900 ${fontSize}px 'Inter', Impact, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const metrics = ctx.measureText(text);
  const textWidth = Math.min(VIRTUAL_SIZE - 8, metrics.width);
  const pillWidth = Math.min(VIRTUAL_SIZE - 4, textWidth + 16);
  const pillHeight = Math.min(VIRTUAL_SIZE - 4, fontSize + 10);

  let centerY = VIRTUAL_SIZE - pillHeight / 2 - 4;
  if (modifiers.badgePosition === 'top') {
    centerY = pillHeight / 2 + 4;
  } else if (modifiers.badgePosition === 'center') {
    centerY = VIRTUAL_SIZE / 2;
  }

  if (modifiers.badgeShowPill) {
    ctx.fillStyle = modifiers.badgeBgColor || '#111827';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 2;
    drawRoundedRect(
      ctx,
      (VIRTUAL_SIZE - pillWidth) / 2,
      centerY - pillHeight / 2,
      pillWidth,
      pillHeight,
      8
    );
    ctx.fill();
    ctx.stroke();
  }

  // Heavy dark outline for maximum legibility on any background
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  ctx.lineWidth = Math.max(4, Math.round(fontSize * 0.22));
  ctx.strokeStyle = modifiers.badgeBgColor || '#09090b';
  ctx.strokeText(text, VIRTUAL_SIZE / 2, centerY + 1, VIRTUAL_SIZE - 10);

  ctx.fillStyle = modifiers.badgeColor || '#ffffff';
  ctx.fillText(text, VIRTUAL_SIZE / 2, centerY + 1, VIRTUAL_SIZE - 10);
  ctx.restore();
}
