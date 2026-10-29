import type { EmojiRenderFn } from '../../src/types/emoji';
import { seededRandom } from '../../src/lib/renderer';

// Hard-edged shadow layers as [dx, dy] steps. Blurred shadows turn into dark fringes after GIF 1-bit transparency
const SHADOW_LAYERS: Record<string, Array<[number, number]>> = {
  none: [],
  drop: [[3, 3]],
  extrude: Array.from({ length: 6 }, (_, k): [number, number] => [0, k + 1]),
  long: Array.from({ length: 10 }, (_, k): [number, number] => [k + 1, k + 1]),
};

export const render: EmojiRenderFn = (ctx, { t, params }) => {
  let line1 = String(params.line1 ?? 'LGTM').trim();
  let line2 = String(params.line2 ?? '').trim();
  // Long single line with spaces: break at the space nearest the middle so it stays legible
  if (!line2 && line1.length > 6 && line1.includes(' ')) {
    const spaces = [...line1.matchAll(/ /g)].map((m) => m.index!);
    const cut = spaces.reduce((a, b) => (Math.abs(b - line1.length / 2) < Math.abs(a - line1.length / 2) ? b : a));
    [line1, line2] = [line1.slice(0, cut).trim(), line1.slice(cut).trim()];
  }

  let lines = [line1, line2]
    .filter(Boolean)
    .map((l) => Array.from(l)); // code points, so ★ / emoji count as one char
  if (!lines.length) return;

  const textMotion = String(params.textMotion || 'none');
  const marquee = textMotion === 'marquee';
  if (marquee) lines = [lines.flatMap((chars, li) => (li ? [' ', ...chars] : chars))];

  const font = String(params.font || "'Inter', sans-serif");
  const weight = String(params.weight || '900');
  const colorTop = String(params.colorTop || '#fde047');
  const colorBottom = String(params.colorBottom || '#f97316');
  const outlineColor = String(params.outlineColor || '#09090b');
  const outlineWidth = Math.max(0, Number(params.outlineWidth ?? 4));
  const stickerColor = String(params.stickerColor || '#ffffff');
  const stickerWidth = Math.max(0, Number(params.stickerWidth ?? 0));
  const shadowLayers = SHADOW_LAYERS[String(params.shadowStyle || 'drop')] ?? SHADOW_LAYERS.drop;
  const line2Scale = Number(params.line2Scale ?? 1);
  const letterSpacing = Number(params.letterSpacing ?? 0); // em
  const tau = t * Math.PI * 2;

  // Line sizes relative to the base size (line 2 scale is meaningless once marquee joins the lines)
  const scales = lines.map((_, li) => (li === 1 ? line2Scale : 1));
  const fontAt = (px: number) => `${weight} ${px}px ${font}`;
  ctx.font = fontAt(100);
  const spacingAt100 = letterSpacing * 100;
  // At 100px: x of char n within its line, and full line width (spacing between letters, not after the last)
  const x100 = (chars: string[], n: number) => ctx.measureText(chars.slice(0, n).join('')).width + spacingAt100 * n;
  const width100 = (chars: string[]) => x100(chars, chars.length) - spacingAt100;

  // Auto-fit: largest base size where every line fits the width and the block fits the height,
  // leaving room for outline, sticker, shadow and motion travel
  const [shadowX, shadowY] = shadowLayers.at(-1) ?? [0, 0];
  const edge = (outlineWidth + stickerWidth) * 2;
  const maxWidth = 116 - edge - shadowX;
  const maxHeight = 108 - edge - shadowY;
  const lineHeightRatio = 0.95;
  const motionRoom = ['wave', 'bounce', 'jitter'].includes(textMotion) ? 1.16 : 1;
  // Marquee scrolls, so it only fits height (capped so a few letters show at once)
  let base = marquee
    ? Math.min(64, maxHeight / lineHeightRatio)
    : maxHeight / (scales.reduce((a, b) => a + b, 0) * lineHeightRatio * motionRoom);
  if (!marquee) {
    lines.forEach((chars, li) => {
      const w = width100(chars);
      if (w > 0) base = Math.min(base, (100 * maxWidth) / (w * scales[li]));
    });
  }

  const sizes = scales.map((s) => base * s);
  const blockHeight = sizes.reduce((a, s) => a + s * lineHeightRatio, 0);
  // Centre text plus shadow as one shape
  const blockTop = 64 - (blockHeight + shadowY) / 2;
  const blockLeftShift = -shadowX / 2;

  // Lay out every glyph once; motions and passes reuse the positions
  const glyphs: Array<{ ch: string; x: number; y: number; i: number; size: number }> = [];
  let lineTop = blockTop;
  lines.forEach((chars, li) => {
    const size = sizes[li];
    const k = size / 100;
    const lineWidth = width100(chars) * k;
    const y = lineTop + (size * lineHeightRatio) / 2;
    lineTop += size * lineHeightRatio;
    // Marquee: tile copies one period apart and shift by t * period, so t=1 lands back on t=0
    const period = Math.max(lineWidth + size * 0.8, 140);
    const lefts = marquee
      ? Array.from({ length: Math.ceil(128 / period) + 1 }, (_, n) => 8 + n * period - t * period)
      : [64 + blockLeftShift - lineWidth / 2];
    for (const left of lefts) {
      chars.forEach((ch, ci) => {
        glyphs.push({ ch, x: left + x100(chars, ci) * k, y, i: marquee ? ci : glyphs.length, size });
      });
    }
  });

  // Typewriter: type out over 70% of the loop, hold, then clear before restarting
  const visible =
    textMotion === 'typewriter' ? Math.floor((Math.min(t, 0.7) / 0.7) * glyphs.length) + 1 : glyphs.length;
  const shown = glyphs.slice(0, Math.min(visible, glyphs.length));

  const jitterStep = Math.floor(t * 12); // 12 fixed poses per loop
  const offset = ({ i, size }: { i: number; size: number }): [number, number] => {
    if (textMotion === 'wave') return [0, Math.sin(tau - i * 0.7) * size * 0.08];
    if (textMotion === 'bounce') return [0, (0.5 - Math.abs(Math.sin(Math.PI * t - i * 0.45))) * size * 0.16];
    if (textMotion === 'jitter') {
      const r = (n: number) => (seededRandom(i * 131 + jitterStep * 17 + n) - 0.5) * size * 0.09;
      return [r(0), r(1)];
    }
    return [0, 0];
  };

  type Glyph = (typeof glyphs)[number];
  // Draws every shown glyph at layer offset + motion offset: stroked with the current strokeStyle
  // and/or filled with `fill` (per glyph, for rainbow)
  const paint = (dx: number, dy: number, stroke: boolean, fill?: (g: Glyph) => string | CanvasGradient) => {
    for (const g of shown) {
      const [mx, my] = offset(g);
      ctx.font = fontAt(g.size);
      if (stroke) ctx.strokeText(g.ch, g.x + mx + dx, g.y + my + dy);
      if (fill) {
        ctx.fillStyle = fill(g);
        ctx.fillText(g.ch, g.x + mx + dx, g.y + my + dy);
      }
    }
  };

  const gradient = ctx.createLinearGradient(0, blockTop, 0, blockTop + blockHeight);
  gradient.addColorStop(0, colorTop);
  gradient.addColorStop(1, colorBottom);

  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';

  // Sticker: thick die-cut border hugging the letters and their shadow
  if (stickerWidth > 0) {
    ctx.strokeStyle = stickerColor;
    ctx.lineWidth = (outlineWidth + stickerWidth) * 2;
    for (const [dx, dy] of [[0, 0] as [number, number], ...shadowLayers]) paint(dx, dy, true, () => stickerColor);
  }

  if (shadowLayers.length) {
    ctx.strokeStyle = outlineColor;
    ctx.lineWidth = outlineWidth * 2;
    for (const [dx, dy] of shadowLayers) paint(dx, dy, outlineWidth > 0, () => outlineColor);
  }

  if (outlineWidth > 0) {
    ctx.strokeStyle = outlineColor;
    ctx.lineWidth = outlineWidth * 2;
    paint(0, 0, true);
  }

  paint(0, 0, false, (g) =>
    textMotion === 'rainbow' ? `hsl(${(g.i * 45 + t * 360) % 360}, 95%, 60%)` : gradient
  );

  // Shine: diagonal white band sweeps across the letter fills in the first 60% of the loop,
  // starting and ending off-canvas so the loop is seamless. Painted only inside glyphs, onto opaque fill
  if (textMotion === 'shine' && t < 0.6) {
    const bx = -40 + (t / 0.6) * 208;
    const band = ctx.createLinearGradient(bx - 22, 34, bx + 22, 94);
    band.addColorStop(0, 'rgba(255, 255, 255, 0)');
    band.addColorStop(0.5, 'rgba(255, 255, 255, 0.85)');
    band.addColorStop(1, 'rgba(255, 255, 255, 0)');
    paint(0, 0, false, () => band);
  }

  ctx.restore();
};

export default render;
