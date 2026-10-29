import type { EmojiRenderFn } from '../../src/types/emoji';

export const render: EmojiRenderFn = (ctx, { t, params }) => {
  const hullColor = String(params.hullColor || '#f8fafc');
  const finColor = String(params.finColor || '#ef4444');
  const flameColor = String(params.flameColor || '#f97316');
  const thrustPower = Number(params.thrustPower ?? 1.2);
  const showStars = Boolean(params.showStars ?? true);
  const windowGlow = String(params.windowGlow || '#38bdf8');

  const tau = t * Math.PI * 2;

  ctx.save();

  // 1. Warp Star Streaks in background
  if (showStars) {
    const stars = [
      { x: 20, baseY: 20, speed: 1, len: 14 },
      { x: 108, baseY: 45, speed: 1, len: 18 },
      { x: 18, baseY: 85, speed: 2, len: 12 },
      { x: 104, baseY: 95, speed: 1, len: 15 },
      { x: 34, baseY: 40, speed: 1, len: 10 },
      { x: 92, baseY: 18, speed: 2, len: 14 },
    ];
    ctx.strokeStyle = 'rgba(253, 224, 71, 0.85)';
    ctx.lineCap = 'round';
    ctx.lineWidth = 3.5;

    for (const s of stars) {
      const y = ((s.baseY + t * 118 * s.speed) % 118) + 5;
      ctx.beginPath();
      ctx.moveTo(s.x - s.len * 0.4, y + s.len * 0.4);
      ctx.lineTo(s.x + s.len * 0.4, y - s.len * 0.4);
      ctx.stroke();
    }
  }

  // Subtle rocket vibration + diagonal flight angle (-38 deg)
  const vibX = Math.sin(tau * 2) * 1.5 * thrustPower;
  const vibY = Math.cos(tau * 2) * 1.5 * thrustPower;

  ctx.translate(66 + vibX, 56 + vibY);
  ctx.rotate((-38 * Math.PI) / 180);

  // 2. Thruster Flame Plume
  const flicker = 0.88 + Math.sin(tau * 3) * 0.16;
  const flameLen = 36 * thrustPower * flicker;

  // Outer flame
  ctx.fillStyle = flameColor;
  ctx.beginPath();
  ctx.moveTo(-13, 28);
  ctx.quadraticCurveTo(-18, 28 + flameLen * 0.6, 0, 28 + flameLen);
  ctx.quadraticCurveTo(18, 28 + flameLen * 0.6, 13, 28);
  ctx.closePath();
  ctx.fill();

  // Inner white-hot core
  ctx.fillStyle = '#fef08a';
  ctx.beginPath();
  ctx.moveTo(-7, 28);
  ctx.quadraticCurveTo(-9, 28 + flameLen * 0.45, 0, 28 + flameLen * 0.68);
  ctx.quadraticCurveTo(9, 28 + flameLen * 0.45, 7, 28);
  ctx.closePath();
  ctx.fill();

  // 3. Left & Right Fins
  ctx.fillStyle = finColor;
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 4.5;
  ctx.lineJoin = 'round';

  // Left fin
  ctx.beginPath();
  ctx.moveTo(-15, 4);
  ctx.lineTo(-32, 26);
  ctx.lineTo(-14, 24);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Right fin
  ctx.beginPath();
  ctx.moveTo(15, 4);
  ctx.lineTo(32, 26);
  ctx.lineTo(14, 24);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // 4. Rocket Main Body
  ctx.fillStyle = hullColor;
  ctx.beginPath();
  ctx.moveTo(0, -46);
  ctx.bezierCurveTo(22, -24, 22, 12, 14, 28);
  ctx.lineTo(-14, 28);
  ctx.bezierCurveTo(-22, 12, -22, -24, 0, -46);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // 5. Nose Cone Accent
  ctx.save();
  ctx.clip();
  ctx.fillStyle = finColor;
  ctx.fillRect(-26, -50, 52, 26);
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-25, -24);
  ctx.lineTo(25, -24);
  ctx.stroke();
  ctx.restore();

  // Re-stroke hull outline for crispness
  ctx.beginPath();
  ctx.moveTo(0, -46);
  ctx.bezierCurveTo(22, -24, 22, 12, 14, 28);
  ctx.lineTo(-14, 28);
  ctx.bezierCurveTo(-22, 12, -22, -24, 0, -46);
  ctx.closePath();
  ctx.stroke();

  // 6. Porthole Window
  ctx.fillStyle = windowGlow;
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.arc(0, -2, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Window glint
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(-3, -5, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
};

export default render;
