// Automatic legibility checks: turns the Slack design rules in AGENTS.md into warnings.
// Analysis works on raw 128x128 RGBA frames so it runs the same in the browser and in tests.
import type { LoadedEmoji, ParamValues, UniversalModifiers } from '../types/emoji';
import { renderEmojiFrame, type RasterImage } from './renderer';
import { ALPHA_CUTOFF } from './exporter';

export const CHECK_SIZE = 128;
export const CHECK_FRAMES = 24;
const SLACK_MAX_BYTES = 128 * 1024;
const SLACK_DARK = [0x1a, 0x1d, 0x21];
const SLACK_LIGHT = [0xff, 0xff, 0xff];
const MIN_CONTRAST = 3; // WCAG 1.4.11 non-text contrast
const OUTLINE_BAND = 6; // px inward from the silhouette edge that count as "the outline"

export type CheckStatus = 'ok' | 'warn' | 'fail';

export interface LegibilityCheck {
  id: 'fill' | 'margin' | 'contrast' | 'seam' | 'size';
  label: string;
  status: CheckStatus;
  detail: string;
}

export function renderCheckFrames(
  emoji: LoadedEmoji,
  params: ParamValues,
  modifiers: Partial<UniversalModifiers>,
  rasterImage: RasterImage | null | undefined,
  frameCount: number
): Uint8ClampedArray[] {
  const canvas = document.createElement('canvas');
  canvas.width = CHECK_SIZE;
  canvas.height = CHECK_SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not initialize 2D canvas context');
  return Array.from({ length: frameCount }, (_, k) => {
    ctx.clearRect(0, 0, CHECK_SIZE, CHECK_SIZE);
    renderEmojiFrame(ctx, emoji, params, modifiers, k / frameCount, rasterImage);
    return ctx.getImageData(0, 0, CHECK_SIZE, CHECK_SIZE).data;
  });
}

/** Fraction of channel values that differ by more than a small anti-aliasing tolerance */
export function diffRatio(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let differing = 0;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i] - b[i]) > 8) differing++;
  }
  return differing / a.length;
}

/** Wrap-around step (last frame to first) and the largest step inside the loop */
export function loopSeam(frames: Uint8ClampedArray[]): { seam: number; maxInLoop: number } {
  let maxInLoop = 0;
  for (let k = 0; k < frames.length - 1; k++) {
    maxInLoop = Math.max(maxInLoop, diffRatio(frames[k], frames[k + 1]));
  }
  return { seam: diffRatio(frames[frames.length - 1], frames[0]), maxInLoop };
}

/** A seam bug shows up as the wrap-around step being much larger than every step inside the loop */
export function isSeamless({ seam, maxInLoop }: { seam: number; maxInLoop: number }): boolean {
  return seam <= maxInLoop * 1.5 + 0.005;
}

function luminance(r: number, g: number, b: number): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrastRatio(l1: number, l2: number): number {
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/**
 * Share of silhouette edge pixels that have a pixel contrasting >= 3:1 with `bg`
 * within OUTLINE_BAND px. A dark outline around a bright fill passes on both themes;
 * a dark shape with no light fill or rim fails on Slack Dark.
 */
function edgeContrast(frame: Uint8ClampedArray, bg: number[]): number {
  const S = CHECK_SIZE;
  const bgL = luminance(bg[0], bg[1], bg[2]);
  const solid = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < S && y < S && frame[(y * S + x) * 4 + 3] >= ALPHA_CUTOFF;
  const contrasts = new Uint8Array(S * S);
  for (let i = 0; i < S * S; i++) {
    const p = i * 4;
    if (frame[p + 3] >= ALPHA_CUTOFF) {
      contrasts[i] = contrastRatio(luminance(frame[p], frame[p + 1], frame[p + 2]), bgL) >= MIN_CONTRAST ? 1 : 0;
    }
  }
  let edges = 0;
  let readable = 0;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (!solid(x, y)) continue;
      if (solid(x - 1, y) && solid(x + 1, y) && solid(x, y - 1) && solid(x, y + 1)) continue;
      edges++;
      search: for (let dy = -OUTLINE_BAND; dy <= OUTLINE_BAND; dy++) {
        for (let dx = -OUTLINE_BAND; dx <= OUTLINE_BAND; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < S && ny < S && contrasts[ny * S + nx]) {
            readable++;
            break search;
          }
        }
      }
    }
  }
  return edges === 0 ? 1 : readable / edges;
}

export interface AnalyzeOptions {
  animated: boolean;
  solidBackground: boolean;
}

export function analyzeFrames(frames: Uint8ClampedArray[], opts: AnalyzeOptions): LegibilityCheck[] {
  const S = CHECK_SIZE;
  const checks: LegibilityCheck[] = [];

  // Union bounding box of visible (exported) pixels across every frame
  let minX = S, minY = S, maxX = -1, maxY = -1;
  for (const frame of frames) {
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        if (frame[(y * S + x) * 4 + 3] < ALPHA_CUTOFF) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const empty = maxX < 0;

  if (opts.solidBackground) {
    checks.push({ id: 'fill', label: 'Canvas fill', status: 'ok', detail: 'Solid background fills the canvas' });
  } else if (empty) {
    checks.push({ id: 'fill', label: 'Canvas fill', status: 'fail', detail: 'Nothing visible in the export' });
  } else {
    const span = Math.max(maxX - minX + 1, maxY - minY + 1) / S;
    const pct = Math.round(span * 100);
    checks.push({
      id: 'fill',
      label: 'Canvas fill',
      status: span < 0.7 ? 'warn' : 'ok',
      detail: `${pct}% of the canvas${span < 0.7 ? ', looks small at 22px (target 80–90%)' : ''}`,
    });
    const margin = Math.min(minX, minY, S - 1 - maxX, S - 1 - maxY);
    checks.push({
      id: 'margin',
      label: 'Edge margin',
      status: margin < 2 ? 'warn' : 'ok',
      detail: margin < 2 ? `${margin}px, artwork touches the edge and may clip` : `${margin}px`,
    });
  }

  if (!empty) {
    // Worst frame decides, so a flash of low contrast mid-loop is still caught
    const dark = Math.min(...frames.map((f) => edgeContrast(f, SLACK_DARK)));
    const light = Math.min(...frames.map((f) => edgeContrast(f, SLACK_LIGHT)));
    const weak = [dark < 0.6 && 'Slack Dark', light < 0.6 && 'Slack Light'].filter(Boolean);
    checks.push({
      id: 'contrast',
      label: 'Contrast',
      status: weak.length ? 'warn' : 'ok',
      detail: `Outline readable: ${Math.round(dark * 100)}% on dark, ${Math.round(light * 100)}% on light${
        weak.length ? ` (weak on ${weak.join(' and ')})` : ''
      }`,
    });
  }

  if (opts.animated && frames.length > 2) {
    const seam = loopSeam(frames);
    const ok = isSeamless(seam);
    checks.push({
      id: 'seam',
      label: 'Loop seam',
      status: ok ? 'ok' : 'warn',
      detail: ok
        ? 'Last frame flows into the first'
        : `Jump at loop restart (${(seam.seam * 100).toFixed(1)}% pixels change vs ${(seam.maxInLoop * 100).toFixed(1)}% max elsewhere)`,
    });
  }

  return checks;
}

export function sizeCheck(sizeBytes: number, optimizedNote?: string): LegibilityCheck {
  const kb = (sizeBytes / 1024).toFixed(1);
  if (sizeBytes > SLACK_MAX_BYTES) {
    return { id: 'size', label: 'File size', status: 'fail', detail: `${kb} KB, over Slack's 128 KB limit` };
  }
  if (optimizedNote) {
    return { id: 'size', label: 'File size', status: 'warn', detail: `${kb} KB. ${optimizedNote}` };
  }
  return { id: 'size', label: 'File size', status: 'ok', detail: `${kb} KB of 128 KB` };
}
