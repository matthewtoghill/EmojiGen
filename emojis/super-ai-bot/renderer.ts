import type { EmojiRenderFn } from '../../src/types/emoji';
import { drawRoundedRect } from '../../src/lib/renderer';

const OUTLINE = '#09090b';

export const render: EmojiRenderFn = (ctx, { t, width, height, params }) => {
  const botColor = String(params.botColor || '#38bdf8');
  const capeColor = String(params.capeColor || '#ef4444');
  const visorColor = String(params.visorColor || '#fde047');
  const intensity = Number(params.flightIntensity ?? 1.0);
  const expression = String(params.expression || 'heroic');
  const showSkyLines = Boolean(params.showSkyLines ?? true);

  const tau = t * Math.PI * 2;
  const hoverY = Math.sin(tau) * 4.5 * intensity;
  const hoverX = Math.cos(tau) * 2.0 * intensity;
  const tilt = Math.sin(tau) * 0.04 * intensity;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // 1. Optional Sky Backdrop & Diagonal Speed Streaks (top-right to bottom-left flight vector)
  if (showSkyLines) {
    // Rich sky badge disc behind the hero so it pops on both dark & light Slack themes
    ctx.save();
    const skyGrad = ctx.createLinearGradient(16, 16, 112, 112);
    skyGrad.addColorStop(0, '#1e3a8a');
    skyGrad.addColorStop(1, '#0284c7');
    ctx.fillStyle = skyGrad;
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, 54, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Clip speed lines & clouds inside the sky disc
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, 51, 0, Math.PI * 2);
    ctx.clip();

    // Diagonal rushing speed lines moving from top-right toward bottom-left
    const streaks = [
      { baseX: 28, baseY: 28, len: 28, phase: 0.0 },
      { baseX: 95, baseY: 36, len: 24, phase: 0.35 },
      { baseX: 44, baseY: 96, len: 32, phase: 0.65 },
      { baseX: 20, baseY: 64, len: 22, phase: 0.82 },
    ];
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 4;
    for (const s of streaks) {
      const p = (t + s.phase) % 1;
      const travel = p * 90 - 30;
      // Moving along (-0.75, +0.65)
      const x1 = s.baseX - travel * 0.75;
      const y1 = s.baseY + travel * 0.65;
      const x2 = x1 + s.len * 0.75;
      const y2 = y1 - s.len * 0.65;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    // Fluffy cloud puff scrolling at the bottom-right / bottom-left
    const cloudP = (t + 0.2) % 1;
    const cloudX = 115 - cloudP * 110;
    const cloudY = 98 + Math.sin(tau) * 2;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cloudX, cloudY, 11, 0, Math.PI * 2);
    ctx.arc(cloudX + 12, cloudY - 3, 13, 0, Math.PI * 2);
    ctx.arc(cloudX + 24, cloudY + 1, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Re-fill inner cloud overlap so it reads as a clean silhouette
    ctx.beginPath();
    ctx.arc(cloudX, cloudY, 9, 0, Math.PI * 2);
    ctx.arc(cloudX + 12, cloudY - 3, 11, 0, Math.PI * 2);
    ctx.arc(cloudX + 24, cloudY + 1, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // Apply dynamic hero flight hover & tilt around center
  ctx.translate(64 + hoverX, 64 + hoverY);
  ctx.rotate(tilt);
  ctx.translate(-64, -64);

  // 2. Billowing Superhero Cape (extends to the left/bottom-left behind the flying bot)
  const wave1 = Math.sin(tau) * 6.5 * intensity;
  const wave2 = Math.cos(tau) * 5.5 * intensity;

  ctx.save();
  ctx.fillStyle = capeColor;
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 5;
  ctx.beginPath();
  // Anchor at bot's neck/shoulders around (54, 52) and (68, 66)
  ctx.moveTo(52, 48);
  ctx.bezierCurveTo(
    28,
    36 + wave1,
    14,
    56 - wave2,
    8,
    76 + wave1 * 0.8
  );
  // Scalloped dramatic superhero cape tail edge
  ctx.quadraticCurveTo(18, 86 + wave2 * 0.5, 22, 98 - wave1 * 0.5);
  ctx.quadraticCurveTo(34, 96 + wave1 * 0.4, 42, 108 + wave2 * 0.6);
  ctx.bezierCurveTo(
    54,
    94 + wave2 * 0.4,
    58,
    78,
    66,
    66
  );
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Bright highlight fold on the cape for depth
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(46, 54);
  ctx.quadraticCurveTo(28, 56 + wave1 * 0.5, 18, 74 + wave1 * 0.5);
  ctx.stroke();
  ctx.restore();

  // 3. Rocket Boot Thruster Flame (bottom-left of torso)
  ctx.save();
  const flameFlicker = 1 + Math.sin(tau * 2) * 0.22 * intensity;
  ctx.translate(36, 86);
  ctx.rotate(0.68); // Angled along flight path (top-right)

  // Outer flame (orange/red)
  ctx.fillStyle = '#f97316';
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.moveTo(-10, 0);
  ctx.quadraticCurveTo(-14, 14 * flameFlicker, 0, 26 * flameFlicker);
  ctx.quadraticCurveTo(14, 14 * flameFlicker, 10, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Inner core flame (visorColor / bright yellow-white)
  ctx.fillStyle = visorColor;
  ctx.beginPath();
  ctx.moveTo(-5, 2);
  ctx.quadraticCurveTo(-6, 9 * flameFlicker, 0, 16 * flameFlicker);
  ctx.quadraticCurveTo(6, 9 * flameFlicker, 5, 2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // 4. Flying Bot Body / Torso (angled heroically toward top-right)
  ctx.save();
  ctx.translate(54, 70);
  ctx.rotate(0.55); // Tilted forward in superman flight pose

  // Back leg / thruster boot
  ctx.fillStyle = '#334155';
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 4.5;
  drawRoundedRect(ctx, -11, 12, 22, 11, 5);
  ctx.fill();
  ctx.stroke();

  // Torso armor
  ctx.fillStyle = botColor;
  drawRoundedRect(ctx, -18, -16, 36, 32, 10);
  ctx.fill();
  ctx.stroke();

  // Heroic AI Chest Emblem (Glowing Diamond/Star Shield)
  ctx.fillStyle = visorColor;
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(0, -10);
  ctx.lineTo(10, 0);
  ctx.lineTo(0, 10);
  ctx.lineTo(-10, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Golden Cape Clasp Medallion at collar
  ctx.fillStyle = '#facc15';
  ctx.beginPath();
  ctx.arc(-12, -13, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // 5. Trailing Arm (tucked back along side)
  ctx.save();
  ctx.translate(45, 76);
  ctx.rotate(0.65);
  ctx.fillStyle = botColor;
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 4.5;
  drawRoundedRect(ctx, -7, -6, 14, 22, 7);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // 6. Bot Head (large, expressive, high-contrast rounded TV/AI helmet)
  ctx.save();
  ctx.translate(76, 44);
  ctx.rotate(0.18);

  // Antenna on top of head with glowing orb
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(0, -24);
  ctx.lineTo(-3, -35);
  ctx.stroke();

  const antennaPulse = 6.5 + Math.sin(tau * 2) * 1.5;
  ctx.fillStyle = visorColor;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(-4, -37, antennaPulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Side Ear / Audio Module
  ctx.fillStyle = capeColor;
  ctx.lineWidth = 4.5;
  drawRoundedRect(ctx, -31, -8, 8, 16, 4);
  ctx.fill();
  ctx.stroke();

  // Main Head Chassis
  ctx.fillStyle = botColor;
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 5;
  drawRoundedRect(ctx, -26, -24, 52, 44, 14);
  ctx.fill();
  ctx.stroke();

  // Top metallic sheen highlight on helmet
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(-14, -18);
  ctx.lineTo(12, -18);
  ctx.stroke();

  // Dark AI Visor Screen
  ctx.fillStyle = '#09090b';
  drawRoundedRect(ctx, -19, -15, 38, 26, 8);
  ctx.fill();

  // Glowing AI Eyes inside Visor
  ctx.fillStyle = visorColor;
  ctx.strokeStyle = visorColor;

  if (expression === 'happy') {
    // Happy upward-curving cybernetic arc eyes ^ ^
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.arc(-8, -1, 6, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(9, -1, 6, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
  } else if (expression === 'laser') {
    // Glowing red/gold overdrive visor bar + laser beams shooting forward!
    ctx.fillStyle = '#ff2a5f';
    drawRoundedRect(ctx, -15, -8, 30, 12, 4);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    drawRoundedRect(ctx, -12, -5, 24, 6, 3);
    ctx.fill();

    // Laser beam burst extending forward
    ctx.strokeStyle = '#ff2a5f';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(14, -2);
    ctx.lineTo(44, -8);
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(14, -2);
    ctx.lineTo(44, -8);
    ctx.stroke();
  } else {
    // Heroic Determined angled eyes
    ctx.beginPath();
    ctx.moveTo(-15, -8);
    ctx.lineTo(-3, -4);
    ctx.lineTo(-3, 4);
    ctx.lineTo(-15, 2);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(15, -8);
    ctx.lineTo(3, -4);
    ctx.lineTo(3, 4);
    ctx.lineTo(15, 2);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();

  // 7. Forward Punching Superhero Fist (overlapping in front, reaching toward top-right!)
  ctx.save();
  const punchExtend = Math.sin(tau * 2) * 2.5 * intensity;
  ctx.translate(98 + punchExtend, 58 - punchExtend);
  ctx.rotate(0.55);

  // Arm segment
  ctx.fillStyle = botColor;
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 4.5;
  drawRoundedRect(ctx, -8, 0, 16, 22, 6);
  ctx.fill();
  ctx.stroke();

  // Heroic Raised Fist (large & bold for 22px legibility)
  ctx.fillStyle = capeColor;
  ctx.lineWidth = 5;
  drawRoundedRect(ctx, -11, -14, 22, 18, 7);
  ctx.fill();
  ctx.stroke();

  // Knuckle highlight
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-5, -9);
  ctx.lineTo(5, -9);
  ctx.stroke();
  ctx.restore();

  ctx.restore();
};

export default render;
