import { describe, expect, it } from 'vitest';
import { clearConnectedBackground } from './renderer';

describe('clearConnectedBackground', () => {
  it('removes edge-connected background but keeps enclosed matching pixels', () => {
    // 5x5 white image with a black ring; the centre pixel is white but enclosed
    const w = 5;
    const h = 5;
    const data = new Uint8ClampedArray(w * h * 4).fill(255);
    const ring = [6, 7, 8, 11, 13, 16, 17, 18];
    for (const i of ring) data.set([0, 0, 0, 255], i * 4);

    clearConnectedBackground(data, w, h, [255, 255, 255], 10);

    const alpha = (i: number) => data[i * 4 + 3];
    expect(alpha(0)).toBe(0);
    expect(alpha(24)).toBe(0);
    expect(ring.every((i) => alpha(i) === 255)).toBe(true);
    expect(alpha(12)).toBe(255);
  });
});
