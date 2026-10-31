import { describe, expect, it } from 'vitest';
import { analyzeFrames, CHECK_SIZE, sizeCheck } from './legibility';

/** Square of `rgb` from `from` to `to` (inclusive) on a transparent 128x128 frame */
function square(from: number, to: number, rgb: [number, number, number]): Uint8ClampedArray {
  const f = new Uint8ClampedArray(CHECK_SIZE * CHECK_SIZE * 4);
  for (let y = from; y <= to; y++) {
    for (let x = from; x <= to; x++) {
      f.set([...rgb, 255], (y * CHECK_SIZE + x) * 4);
    }
  }
  return f;
}

const status = (checks: ReturnType<typeof analyzeFrames>, id: string) => checks.find((c) => c.id === id)?.status;
const still = { animated: false, solidBackground: false };

describe('analyzeFrames', () => {
  it('passes a well-sized orange square with a margin', () => {
    const checks = analyzeFrames([square(8, 119, [249, 115, 22])], still);
    expect(status(checks, 'fill')).toBe('ok');
    expect(status(checks, 'margin')).toBe('ok');
    expect(status(checks, 'contrast')).toBe('warn'); // orange on white is under 3:1
  });

  it('flags small artwork, edge contact and dark-on-dark', () => {
    expect(status(analyzeFrames([square(50, 77, [255, 255, 255])], still), 'fill')).toBe('warn');
    expect(status(analyzeFrames([square(0, 120, [255, 255, 255])], still), 'margin')).toBe('warn');
    const darkChecks = analyzeFrames([square(8, 119, [20, 20, 24])], still);
    expect(darkChecks.find((c) => c.id === 'contrast')?.detail).toContain('Slack Dark');
  });

  it('fails an empty export and skips fill/margin on a solid background', () => {
    expect(status(analyzeFrames([square(0, -1, [0, 0, 0])], still), 'fill')).toBe('fail');
    const solid = analyzeFrames([square(0, 127, [255, 255, 255])], { animated: false, solidBackground: true });
    expect(status(solid, 'fill')).toBe('ok');
    expect(status(solid, 'margin')).toBeUndefined();
  });

  it('detects a loop seam', () => {
    const smooth = Array.from({ length: 8 }, (_, k) => square(8 + (k < 4 ? k : 8 - k), 100, [255, 255, 255]));
    expect(status(analyzeFrames(smooth, { ...still, animated: true }), 'seam')).toBe('ok');
    const jump = Array.from({ length: 8 }, (_, k) => square(8 + k, 100, [255, 255, 255]));
    expect(status(analyzeFrames(jump, { ...still, animated: true }), 'seam')).toBe('warn');
  });
});

describe('sizeCheck', () => {
  it('grades against the 128 KB limit', () => {
    expect(sizeCheck(50 * 1024).status).toBe('ok');
    expect(sizeCheck(100 * 1024, 'Auto-compressed').status).toBe('warn');
    expect(sizeCheck(129 * 1024).status).toBe('fail');
  });
});
