import type { EmojiRenderFn } from '../../src/types/emoji';

export const render: EmojiRenderFn = (ctx, { t, params }) => {
  const binColor = String(params.binColor || '#15803d');
  const outerFlameColor = String(params.outerFlameColor || '#ea580c');
  const innerFlameColor = String(params.innerFlameColor || '#facc15');
  const flameHeight = Number(params.flameHeight ?? 1.2);
  const binText = String(params.binText ?? 'FINE').slice(0, 8);
  const showEmbers = Boolean(params.showEmbers ?? true);

  const tau = t * Math.PI * 2;

  ctx.save();

  // 1. Rising Embers
  if (showEmbers) {
    const embers = [
      { x0: 32, phase: 0.0, size: 4 },
      { x0: 54, phase: 0.35, size: 5 },
      { x0: 78, phase: 0.7, size: 4.5 },
      { x0: 96, phase: 0.15, size: 3.5 },
    ];
    for (const e of embers) {
      const progress = (t + e.phase) % 1;
      const y = 62 - progress * 54;
      const x = e.x0 + Math.sin(progress * Math.PI * 2 + e.x0) * 8;
      const envelope = Math.sin(progress * Math.PI);
      ctx.fillStyle = progress > 0.6 ? '#fb923c' : '#fef08a';
      ctx.beginPath();
      ctx.arc(x, y, Math.max(0.5, e.size * envelope), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 2. Multi-tongue Flickering Flames emerging from top of bin (y = 66)
  const drawFlameLayer = (
    color: string,
    scaleY: number,
    scaleX: number,
    phaseOffset: number
  ) => {
    const sway1 = Math.sin(tau + phaseOffset) * 7;
    const sway2 = Math.cos(tau * 2 + phaseOffset) * 5;
    const sway3 = Math.sin(tau * 2 - phaseOffset) * 5;

    const topCenterY = 66 - 48 * scaleY * flameHeight;
    const topLeftY = 66 - 36 * scaleY * flameHeight;
    const topRightY = 66 - 38 * scaleY * flameHeight;

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(64 - 40 * scaleX, 68);
    // Left flame tongue
    ctx.quadraticCurveTo(
      64 - 44 * scaleX,
      topLeftY + 18,
      64 - 24 * scaleX + sway1,
      topLeftY
    );
    ctx.quadraticCurveTo(
      64 - 12 * scaleX,
      topLeftY + 16,
      64 + sway2,
      topCenterY
    );
    // Right flame tongue
    ctx.quadraticCurveTo(
      64 + 14 * scaleX,
      topRightY + 16,
      64 + 26 * scaleX + sway3,
      topRightY
    );
    ctx.quadraticCurveTo(
      64 + 44 * scaleX,
      topRightY + 18,
      64 + 40 * scaleX,
      68
    );
    ctx.closePath();
    ctx.fill();
  };

  // Outer red/orange blaze with dark outline
  ctx.save();
  drawFlameLayer(outerFlameColor, 1.0, 1.0, 0);
  ctx.strokeStyle = '#18181b';
  ctx.lineWidth = 4.5;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();

  // Middle amber-yellow flame
  drawFlameLayer(innerFlameColor, 0.72, 0.78, 1.4);

  // Core white-hot flame
  drawFlameLayer('#fef9c3', 0.42, 0.5, 2.8);

  // 3. Dumpster Bin Rim & Body
  ctx.fillStyle = binColor;
  ctx.strokeStyle = '#09090b';
  ctx.lineWidth = 5;
  ctx.lineJoin = 'round';

  // Main trapezoid bin body
  ctx.beginPath();
  ctx.moveTo(18, 66);
  ctx.lineTo(110, 66);
  ctx.lineTo(100, 118);
  ctx.lineTo(28, 118);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Dumpster top lip bar
  ctx.fillStyle = binColor;
  ctx.fillRect(14, 58, 100, 10);
  ctx.strokeRect(14, 58, 100, 10);

  // Vertical reinforcement ribs on bin
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(42, 70);
  ctx.lineTo(46, 114);
  ctx.moveTo(86, 70);
  ctx.lineTo(82, 114);
  ctx.stroke();

  // 4. Stencil Text on Dumpster Front
  if (binText.trim()) {
    ctx.font = `900 22px 'Inter', Impact, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#09090b';
    ctx.strokeText(binText, 64, 94, 72);
    ctx.fillStyle = '#fef08a';
    ctx.fillText(binText, 64, 94, 72);
  }

  ctx.restore();
};

export default render;
