// Runs every emoji in emojis/ through the real renderer and GIF exporter in Node,
// using @napi-rs/canvas in place of the browser's Canvas 2D.
import { beforeAll, describe, expect, it } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { loadAllEmojis } from './emojiRegistry';
import { renderEmojiFrame } from './renderer';
import { exportEmojiToGif } from './exporter';
import { DEFAULT_UNIVERSAL_MODIFIERS, type LoadedEmoji } from '../types/emoji';

const SIZE = 128;
const SLACK_MAX_BYTES = 128 * 1024;

beforeAll(() => {
  // Minimal DOM stand-ins the exporter needs: document.createElement('canvas') and FileReader
  Object.assign(globalThis, {
    document: { createElement: () => createCanvas(SIZE, SIZE) },
    FileReader: class {
      result: string | null = null;
      onloadend: (() => void) | null = null;
      onerror: ((err: unknown) => void) | null = null;
      readAsDataURL(blob: Blob) {
        blob.arrayBuffer().then(
          (buf) => {
            this.result = `data:${blob.type};base64,${Buffer.from(buf).toString('base64')}`;
            this.onloadend?.();
          },
          (err) => this.onerror?.(err)
        );
      }
    },
  });
});

function renderPixels(emoji: LoadedEmoji, t: number): Uint8ClampedArray {
  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
  renderEmojiFrame(ctx, emoji, emoji.manifest.defaultParams, undefined, t);
  return ctx.getImageData(0, 0, SIZE, SIZE).data;
}

/** Fraction of channel values that differ by more than a small anti-aliasing tolerance */
function diffRatio(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let differing = 0;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i] - b[i]) > 8) differing++;
  }
  return differing / a.length;
}

const emojis = loadAllEmojis().filter((e) => e.render);

describe.each(emojis.map((e) => [e.slug, e] as const))('%s', (_slug, emoji) => {
  it('renders deterministically', () => {
    for (const t of [0, 0.37, 0.81]) {
      expect(renderPixels(emoji, t)).toEqual(renderPixels(emoji, t));
    }
  });

  it('loops seamlessly (last frame -> first frame is no bigger a jump than any other step)', () => {
    // Some emojis jitter in deliberate steps, so frames can differ a lot. A seam bug shows up
    // as the wrap-around step being much larger than every step inside the loop.
    const N = 36; // max exported frame count
    const frames = Array.from({ length: N }, (_, k) => renderPixels(emoji, k / N));
    let maxInLoop = 0;
    for (let k = 0; k < N - 1; k++) {
      maxInLoop = Math.max(maxInLoop, diffRatio(frames[k], frames[k + 1]));
    }
    expect(diffRatio(frames[N - 1], frames[0])).toBeLessThanOrEqual(maxInLoop * 1.5 + 0.005);
  });

  it('exports a GIF within Slack’s 128 KB limit', async () => {
    const modifiers = { ...DEFAULT_UNIVERSAL_MODIFIERS, ...(emoji.manifest.modifiers || {}) };
    const result = await exportEmojiToGif(emoji, emoji.manifest.defaultParams, modifiers);
    expect(result.sizeBytes).toBeLessThanOrEqual(SLACK_MAX_BYTES);
  }, 30_000);
});
