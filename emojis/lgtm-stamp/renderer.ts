import type { EmojiRenderFn } from '../../src/types/emoji';
import { drawRoundedRect } from '../../src/lib/renderer';

export const render: EmojiRenderFn = (ctx, { t, params }) => {
  const stampText = String(params.stampText || 'LGTM').slice(0, 8);
  const subText = String(params.subText || '★ APPROVED ★').slice(0, 16);
  const inkColor = String(params.inkColor || '#22c55e');
  const fillColor = String(params.fillColor || '#052e16');
  const tiltAngle = Number(params.tiltAngle ?? -10);
  const animateShine = Boolean(params.animateShine ?? true);

  ctx.save();
  ctx.translate(64, 64);
  ctx.rotate((tiltAngle * Math.PI) / 180);

  // Subtle stamp impact pulse if animated
  if (animateShine) {
    const pulse = 1 + Math.sin(t * Math.PI * 2) * 0.04;
    ctx.scale(pulse, pulse);
  }

  const w = 114;
  const h = 82;

  // Outer Stamp Box
  ctx.fillStyle = fillColor;
  ctx.strokeStyle = inkColor;
  ctx.lineWidth = 6;
  drawRoundedRect(ctx, -w / 2, -h / 2, w, h, 14);
  ctx.fill();
  ctx.stroke();

  // Inner Dashed / Double Border
  ctx.lineWidth = 2.5;
  drawRoundedRect(ctx, -w / 2 + 7, -h / 2 + 7, w - 14, h - 14, 9);
  ctx.stroke();

  // Top & Bottom SubText
  if (subText.trim()) {
    ctx.fillStyle = inkColor;
    ctx.font = `800 10px 'Inter', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(subText, 0, -24, w - 22);
    ctx.fillText(subText, 0, 25, w - 22);
  }

  // Main Bold Stamp Text (Readable even at 22x22px!)
  const fontSize = stampText.length <= 4 ? 32 : stampText.length <= 6 ? 24 : 19;
  ctx.font = `900 ${fontSize}px 'Inter', Impact, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Dark text shadow for pop
  ctx.fillStyle = '#000000';
  ctx.fillText(stampText, 2, 3, w - 18);

  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = inkColor;
  ctx.lineWidth = 2;
  ctx.strokeText(stampText, 0, 1, w - 18);
  ctx.fillText(stampText, 0, 1, w - 18);

  // Diagonal Shine Sweep
  if (animateShine) {
    ctx.save();
    drawRoundedRect(ctx, -w / 2 + 3, -h / 2 + 3, w - 6, h - 6, 12);
    ctx.clip();

    const shineX = -90 + t * 180;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.beginPath();
    ctx.moveTo(shineX - 16, -h);
    ctx.lineTo(shineX + 10, -h);
    ctx.lineTo(shineX - 10, h);
    ctx.lineTo(shineX - 36, h);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();
};

export default render;
