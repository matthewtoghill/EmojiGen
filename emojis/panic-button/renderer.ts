import type { EmojiRenderFn } from '../../src/types/emoji';
import { drawRoundedRect } from '../../src/lib/renderer';

export const render: EmojiRenderFn = (ctx, { t, params }) => {
  const buttonLabel = String(params.buttonLabel || 'PANIC').slice(0, 7);
  const buttonColor = String(params.buttonColor || '#ef4444');
  const baseColor = String(params.baseColor || '#facc15');
  const rayColor = String(params.rayColor || '#fbbf24');
  const showAlarmRays = Boolean(params.showAlarmRays ?? true);
  const pressDepth = Number(params.pressDepth ?? 1.0);

  const tau = t * Math.PI * 2;
  const pressWave = Math.max(0, Math.sin(tau));
  const yOffset = pressWave * 13 * pressDepth;

  ctx.save();

  // 1. Flashing Siren Rays when button is pressed
  if (showAlarmRays && pressWave > 0.15) {
    ctx.save();
    ctx.translate(64, 48);
    ctx.strokeStyle = rayColor;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';

    const angles = [-145, -118, -90, -62, -35];
    for (const deg of angles) {
      const rad = (deg * Math.PI) / 180;
      const r1 = 36;
      const r2 = 46 + pressWave * 8;
      ctx.beginPath();
      ctx.moveTo(Math.cos(rad) * r1, Math.sin(rad) * r1);
      ctx.lineTo(Math.cos(rad) * r2, Math.sin(rad) * r2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 2. Heavy Hazard Pedestal Base
  ctx.fillStyle = baseColor;
  ctx.strokeStyle = '#09090b';
  ctx.lineWidth = 5;
  ctx.lineJoin = 'round';

  drawRoundedRect(ctx, 14, 82, 100, 32, 10);
  ctx.fill();
  ctx.stroke();

  // Dark hazard stripes on pedestal
  ctx.save();
  drawRoundedRect(ctx, 16, 84, 96, 28, 8);
  ctx.clip();
  ctx.fillStyle = '#18181b';
  for (let x = -10; x < 130; x += 28) {
    ctx.beginPath();
    ctx.moveTo(x, 82);
    ctx.lineTo(x + 14, 82);
    ctx.lineTo(x + 2, 116);
    ctx.lineTo(x - 12, 116);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Collar Ring
  ctx.fillStyle = '#3f3f46';
  ctx.strokeStyle = '#09090b';
  ctx.lineWidth = 4.5;
  drawRoundedRect(ctx, 26, 73, 76, 13, 5);
  ctx.fill();
  ctx.stroke();

  // 3. Big Red Button Dome (moves down by yOffset)
  ctx.save();
  ctx.translate(0, yOffset);

  ctx.fillStyle = buttonColor;
  ctx.strokeStyle = '#09090b';
  ctx.lineWidth = 5;

  ctx.beginPath();
  ctx.moveTo(30, 74 - yOffset * 0.4);
  ctx.lineTo(30, 50);
  ctx.bezierCurveTo(30, 32, 98, 32, 98, 50);
  ctx.lineTo(98, 74 - yOffset * 0.4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Button Top Highlight
  ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.beginPath();
  ctx.ellipse(64, 43, 24, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Button Cap Label
  if (buttonLabel.trim()) {
    const fontSize = buttonLabel.length <= 5 ? 19 : 15;
    ctx.font = `900 ${fontSize}px 'Inter', Impact, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#09090b';
    ctx.strokeText(buttonLabel, 64, 59, 60);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(buttonLabel, 64, 59, 60);
  }

  ctx.restore();
  ctx.restore();
};

export default render;
