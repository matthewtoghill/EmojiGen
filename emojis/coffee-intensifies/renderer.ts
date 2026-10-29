import type { EmojiRenderFn } from '../../src/types/emoji';
import { drawRoundedRect, seededRandom } from '../../src/lib/renderer';

export const render: EmojiRenderFn = (ctx, { t, params }) => {
  const mugColor = String(params.mugColor || '#f43f5e');
  const mugText = String(params.mugText ?? '10X').slice(0, 6);
  const jitterLevel = Number(params.jitterLevel ?? 1.2);
  const showLightning = Boolean(params.showLightning ?? true);
  const showSteam = Boolean(params.showSteam ?? true);
  const sparkColor = String(params.sparkColor || '#facc15');

  const tau = t * Math.PI * 2;
  const jitterStep = Math.floor(t * 10);
  const boltPhase = Math.floor(t * 4);
  const jx = (seededRandom(jitterStep * 13 + 1) * 2 - 1) * 2.8 * jitterLevel;
  const jy = (seededRandom(jitterStep * 29 + 2) * 2 - 1) * 2.8 * jitterLevel;

  ctx.save();

  // 1. Rising Steam Waves
  if (showSteam) {
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.85)';
    ctx.lineWidth = 4.5;
    ctx.lineCap = 'round';
    const steamCols = [42, 58, 74];
    for (let i = 0; i < steamCols.length; i++) {
      const baseX = steamCols[i];
      const wave = Math.sin(tau + i * 1.4) * 5;
      ctx.beginPath();
      ctx.moveTo(baseX, 40);
      ctx.quadraticCurveTo(baseX - wave, 26, baseX + wave * 0.6, 12);
      ctx.stroke();
    }
  }

  // 2. Electric Caffeine Lightning Bolts
  if (showLightning) {
    const drawBolt = (x: number, y: number, flip: number) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(flip, 1);
      ctx.fillStyle = sparkColor;
      ctx.strokeStyle = '#09090b';
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(0, -14);
      ctx.lineTo(-10, 2);
      ctx.lineTo(-2, 2);
      ctx.lineTo(-6, 15);
      ctx.lineTo(10, -2);
      ctx.lineTo(1, -2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    };

    if (boltPhase % 2 === 0) {
      drawBolt(16, 46, 1);
      drawBolt(112, 38, -1);
    } else {
      drawBolt(18, 86, 1);
      drawBolt(112, 78, -1);
    }
  }

  // 3. Vibrating Mug Group
  ctx.translate(jx, jy);

  // Mug Handle (on right)
  ctx.strokeStyle = '#09090b';
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.arc(88, 78, 18, -Math.PI * 0.48, Math.PI * 0.48);
  ctx.stroke();

  ctx.strokeStyle = mugColor;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(88, 78, 18, -Math.PI * 0.48, Math.PI * 0.48);
  ctx.stroke();

  // Mug Body
  ctx.fillStyle = mugColor;
  ctx.strokeStyle = '#09090b';
  ctx.lineWidth = 5;
  drawRoundedRect(ctx, 24, 46, 66, 68, 12);
  ctx.fill();
  ctx.stroke();

  // Dark Espresso Rim at top
  ctx.fillStyle = '#3f2314';
  ctx.strokeStyle = '#09090b';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(57, 48, 32, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Mug Front Text
  if (mugText.trim()) {
    ctx.font = `900 22px 'Inter', Impact, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 4.5;
    ctx.strokeStyle = '#09090b';
    ctx.strokeText(mugText, 57, 83, 56);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(mugText, 57, 83, 56);
  }

  ctx.restore();
};

export default render;
