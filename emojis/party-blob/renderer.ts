import type { EmojiRenderFn } from '../../src/types/emoji';

function drawStar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  outerR: number,
  innerR: number
) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (i * Math.PI) / 5 - Math.PI / 2;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

export const render: EmojiRenderFn = (ctx, { t, params }) => {
  const baseColor = String(params.blobColor || '#fbbf24');
  const glasses = String(params.glasses || 'shades');
  const expression = String(params.expression || 'grin');
  const bounceAmount = Number(params.bounceAmount ?? 1.1);
  const showConfetti = Boolean(params.showConfetti ?? true);
  const rainbowCycle = Boolean(params.rainbowCycle ?? true);

  const tau = t * Math.PI * 2;
  const bounce = Math.abs(Math.sin(tau)) * 11 * bounceAmount;
  const sway = Math.sin(tau) * 8 * bounceAmount;
  const squash = Math.cos(tau * 2) * 0.08 * bounceAmount;

  ctx.save();

  // 1. Confetti particles
  if (showConfetti) {
    const confettiSpecs = [
      { x: 18, y0: 10, color: '#f43f5e', rot: 1 },
      { x: 108, y0: 25, color: '#38bdf8', rot: -1 },
      { x: 26, y0: 65, color: '#a855f7', rot: 2 },
      { x: 106, y0: 80, color: '#22c55e', rot: -2 },
      { x: 64, y0: 8, color: '#facc15', rot: 1 },
    ];
    for (const c of confettiSpecs) {
      const y = ((c.y0 + t * 115) % 115) + 6;
      ctx.save();
      ctx.translate(c.x + Math.sin(tau + c.x) * 4, y);
      ctx.rotate(tau * c.rot);
      ctx.fillStyle = c.color;
      ctx.fillRect(-4, -2.5, 8, 5);
      ctx.restore();
    }
  }

  // 2. Blob Body with Squash & Stretch
  ctx.save();
  if (rainbowCycle) {
    ctx.filter = `hue-rotate(${Math.round(t * 360)}deg)`;
  }

  ctx.translate(64 + sway, 108);
  ctx.scale(1 + squash, 1 - squash * 0.85);
  ctx.translate(0, -bounce * 0.6);

  ctx.fillStyle = baseColor;
  ctx.strokeStyle = '#18181b';
  ctx.lineWidth = 5;
  ctx.lineJoin = 'round';

  // Classic gumdrop / blob silhouette
  ctx.beginPath();
  ctx.moveTo(-40, 0);
  ctx.bezierCurveTo(-48, -10, -44, -55, -24, -74);
  ctx.bezierCurveTo(-8, -88, 12, -88, 26, -72);
  ctx.bezierCurveTo(44, -52, 48, -10, 40, 0);
  ctx.quadraticCurveTo(0, 6, -40, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Cute top highlight
  ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.beginPath();
  ctx.ellipse(-14, -64, 10, 5, -0.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore(); // End rainbow filter so glasses stay crisp

  // 3. Face & Eyewear (transformed to match blob head position)
  ctx.save();
  ctx.translate(64 + sway * 1.15, 58 - bounce * 0.75 + squash * 14);
  ctx.rotate(sway * 0.015);

  if (glasses === 'shades') {
    // Pixel/Vector Deal With It Shades
    ctx.fillStyle = '#09090b';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;

    // Bridge + Strap
    ctx.fillRect(-34, -8, 68, 6);
    // Left lens
    ctx.fillRect(-30, -8, 26, 16);
    // Right lens
    ctx.fillRect(4, -8, 26, 16);

    // Glint stripes on lenses
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(-26, -4, 5, 10);
    ctx.fillRect(-18, -4, 3, 10);
    ctx.fillRect(8, -4, 5, 10);
    ctx.fillRect(16, -4, 3, 10);
  } else if (glasses === 'stars') {
    ctx.fillStyle = '#ec4899';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    drawStar(ctx, -16, -1, 16, 7);
    ctx.fill();
    ctx.stroke();
    drawStar(ctx, 16, -1, 16, 7);
    ctx.fill();
    ctx.stroke();
  } else {
    // Cute eyes
    ctx.fillStyle = '#18181b';
    ctx.beginPath();
    ctx.arc(-14, -2, 6, 0, Math.PI * 2);
    ctx.arc(14, -2, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-16, -4, 2.2, 0, Math.PI * 2);
    ctx.arc(12, -4, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // 4. Mouth Expression
  ctx.translate(0, 16);
  if (expression === 'grin') {
    ctx.fillStyle = '#7f1d1d';
    ctx.strokeStyle = '#18181b';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(0, -2, 14, 0, Math.PI);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Tongue
    ctx.fillStyle = '#fb7185';
    ctx.beginPath();
    ctx.arc(0, 6, 7, Math.PI, 0);
    ctx.fill();
  } else if (expression === 'oh') {
    ctx.fillStyle = '#18181b';
    ctx.beginPath();
    ctx.ellipse(0, 4, 7, 9, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.strokeStyle = '#18181b';
    ctx.lineWidth = 4.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, -2, 12, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  }

  ctx.restore();
  ctx.restore();
};

export default render;
