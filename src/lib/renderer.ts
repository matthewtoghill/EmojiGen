import {
  DEFAULT_UNIVERSAL_MODIFIERS,
  type LoadedEmoji,
  type ParamValues,
  type UniversalModifiers,
} from '../types/emoji';

const VIRTUAL_SIZE = 128;

export function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/**
 * Deterministic pseudo-random in [0, 1) for a seed so frame rendering is 100% repeatable
 */
export function seededRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Renders a single frame of an emoji at normalized progress `t` in [0, 1)
 * onto the target canvas context.
 */
export function renderEmojiFrame(
  targetCtx: CanvasRenderingContext2D,
  emoji: LoadedEmoji,
  customParams: ParamValues,
  partialModifiers?: Partial<UniversalModifiers>,
  tRaw: number = 0,
  rasterImage?: HTMLImageElement | null
) {
  const modifiers: UniversalModifiers = {
    ...DEFAULT_UNIVERSAL_MODIFIERS,
    ...(emoji.manifest.modifiers || {}),
    ...(partialModifiers || {}),
  };

  const params: ParamValues = {
    ...emoji.manifest.defaultParams,
    ...customParams,
  };

  // Normalize time t in [0, 1)
  const t = ((tRaw % 1) + 1) % 1;
  const tau = t * Math.PI * 2;

  const canvasW = targetCtx.canvas.width;
  const canvasH = targetCtx.canvas.height;
  const scaleFactorX = canvasW / VIRTUAL_SIZE;
  const scaleFactorY = canvasH / VIRTUAL_SIZE;

  targetCtx.save();
  targetCtx.clearRect(0, 0, canvasW, canvasH);
  targetCtx.scale(scaleFactorX, scaleFactorY);

  // 1. Optional Background Layer
  if (!modifiers.backgroundTransparent) {
    targetCtx.save();
    targetCtx.fillStyle = modifiers.backgroundColor || '#1e1b4b';
    drawRoundedRect(
      targetCtx,
      2,
      2,
      VIRTUAL_SIZE - 4,
      VIRTUAL_SIZE - 4,
      modifiers.backgroundRadius ?? 24
    );
    targetCtx.fill();
    targetCtx.restore();
  }

  // 2. Compute Universal Motion Transform
  let offsetX = 0;
  let offsetY = 0;
  let extraRotationRad = 0;
  let extraScaleX = 1;
  let extraScaleY = 1;
  const intensity = modifiers.motionIntensity ?? 1.0;

  switch (modifiers.motion) {
    case 'shake': {
      // Deterministic shake ("intensifies")
      const step = Math.floor(t * 12);
      offsetX = (seededRandom(step * 17 + 1) * 2 - 1) * 4.5 * intensity;
      offsetY = (seededRandom(step * 31 + 2) * 2 - 1) * 4.5 * intensity;
      extraRotationRad = (seededRandom(step * 47 + 3) * 2 - 1) * 0.08 * intensity;
      break;
    }
    case 'bounce': {
      const bounceWave = Math.abs(Math.sin(tau));
      offsetY = (0.35 - bounceWave) * 20 * intensity;
      // Squash and stretch at bottom of bounce
      const squash = Math.max(0, 1 - bounceWave * 2.5) * 0.16 * intensity;
      extraScaleX = 1 + squash;
      extraScaleY = 1 - squash;
      break;
    }
    case 'spin': {
      extraRotationRad = tau * (intensity >= 1.5 ? 2 : 1);
      break;
    }
    case 'pulse': {
      const pulse = Math.sin(tau);
      const s = 1 + pulse * 0.15 * intensity;
      extraScaleX = s;
      extraScaleY = s;
      break;
    }
    case 'wobble': {
      extraRotationRad = Math.sin(tau) * 0.25 * intensity;
      offsetX = Math.sin(tau) * 5 * intensity;
      extraScaleX = 1 + Math.cos(tau * 2) * 0.06 * intensity;
      extraScaleY = 1 - Math.cos(tau * 2) * 0.06 * intensity;
      break;
    }
    case 'party': {
      // Party combines a lively dance bounce + rainbow hue rotation
      const bounce = Math.abs(Math.sin(tau));
      offsetY = (0.4 - bounce) * 10 * intensity;
      offsetX = Math.sin(tau) * 5 * intensity;
      extraRotationRad = Math.sin(tau) * 0.14 * intensity;
      break;
    }
    case 'glitch': {
      const step = Math.floor(t * 16);
      if (seededRandom(step * 19) > 0.45) {
        offsetX = (seededRandom(step * 23) * 2 - 1) * 9 * intensity;
      }
      break;
    }
    default:
      break;
  }

  // 3. Apply Color Filters (Hue, Saturation, Brightness, Contrast, Party Rainbow)
  let totalHue = modifiers.hueRotate || 0;
  if (modifiers.motion === 'party') {
    totalHue = (totalHue + t * 360) % 360;
  }
  const hasFilter =
    totalHue !== 0 ||
    modifiers.saturate !== 100 ||
    modifiers.brightness !== 100 ||
    modifiers.contrast !== 100;

  targetCtx.save();
  if (hasFilter) {
    const filterParts: string[] = [];
    if (totalHue !== 0) filterParts.push(`hue-rotate(${totalHue.toFixed(1)}deg)`);
    if (modifiers.saturate !== 100) filterParts.push(`saturate(${modifiers.saturate}%)`);
    if (modifiers.brightness !== 100) filterParts.push(`brightness(${modifiers.brightness}%)`);
    if (modifiers.contrast !== 100) filterParts.push(`contrast(${modifiers.contrast}%)`);
    targetCtx.filter = filterParts.join(' ');
  }

  // 4. Apply Spatial Transforms around center (64, 64)
  targetCtx.translate(VIRTUAL_SIZE / 2 + offsetX, VIRTUAL_SIZE / 2 + offsetY);
  const baseRotRad = ((modifiers.rotation || 0) * Math.PI) / 180;
  targetCtx.rotate(baseRotRad + extraRotationRad);

  const flipSignX = modifiers.flipX ? -1 : 1;
  const flipSignY = modifiers.flipY ? -1 : 1;
  const baseScale = modifiers.scale || 1;
  targetCtx.scale(
    baseScale * extraScaleX * flipSignX,
    baseScale * extraScaleY * flipSignY
  );
  targetCtx.translate(-VIRTUAL_SIZE / 2, -VIRTUAL_SIZE / 2);

  // 5. Render the Emoji Content (Parametric or Raster)
  if (emoji.render) {
    emoji.render(targetCtx, {
      t,
      width: VIRTUAL_SIZE,
      height: VIRTUAL_SIZE,
      params,
    });
  } else if (rasterImage && rasterImage.complete && rasterImage.naturalWidth > 0) {
    const pad = Number(params.padding ?? 4);
    const radius = Number(params.cornerRadius ?? 0);
    const borderW = Number(params.borderWidth ?? 0);
    const borderColor = String(params.borderColor ?? '#ffffff');

    const drawBox = VIRTUAL_SIZE - pad * 2;
    const imgAspect = rasterImage.naturalWidth / rasterImage.naturalHeight;
    let drawW = drawBox;
    let drawH = drawBox;
    if (imgAspect > 1) {
      drawH = drawBox / imgAspect;
    } else {
      drawW = drawBox * imgAspect;
    }
    const drawX = (VIRTUAL_SIZE - drawW) / 2;
    const drawY = (VIRTUAL_SIZE - drawH) / 2;

    targetCtx.save();
    if (radius > 0) {
      drawRoundedRect(targetCtx, drawX, drawY, drawW, drawH, radius);
      targetCtx.clip();
    }
    targetCtx.drawImage(rasterImage, drawX, drawY, drawW, drawH);
    targetCtx.restore();

    if (borderW > 0) {
      targetCtx.save();
      targetCtx.strokeStyle = borderColor;
      targetCtx.lineWidth = borderW;
      drawRoundedRect(targetCtx, drawX, drawY, drawW, drawH, radius);
      targetCtx.stroke();
      targetCtx.restore();
    }
  }

  targetCtx.restore(); // Restore spatial + filter transforms

  // 6. Optional Glitch Scanline Overlay
  if (modifiers.motion === 'glitch') {
    const step = Math.floor(t * 16);
    if (seededRandom(step * 41) > 0.35) {
      const sliceY = Math.floor(seededRandom(step * 53) * 100) + 10;
      const sliceH = Math.floor(seededRandom(step * 61) * 18) + 6;
      const shiftX = (seededRandom(step * 73) * 2 - 1) * 14 * intensity;
      targetCtx.save();
      targetCtx.fillStyle = seededRandom(step * 83) > 0.5 ? 'rgba(0, 255, 255, 0.28)' : 'rgba(255, 0, 128, 0.28)';
      targetCtx.fillRect(Math.max(0, shiftX), sliceY, VIRTUAL_SIZE, sliceH);
      targetCtx.restore();
    }
  }

  // 7. Universal Slack Badge / Text Overlay
  const badgeText = (modifiers.badgeText || '').trim();
  if (badgeText.length > 0) {
    renderBadgeOverlay(targetCtx, badgeText, modifiers);
  }

  targetCtx.restore();
}

function renderBadgeOverlay(
  ctx: CanvasRenderingContext2D,
  text: string,
  modifiers: UniversalModifiers
) {
  ctx.save();
  const badgeScale = modifiers.badgeScale || 1.0;

  // Dynamic font size so short texts like "LGTM" or "WIP" are bold & huge at 22px Slack size
  const baseFontSize =
    text.length <= 4 ? 28 : text.length <= 7 ? 22 : text.length <= 10 ? 17 : 14;
  const fontSize = Math.round(baseFontSize * badgeScale);

  ctx.font = `900 ${fontSize}px 'Inter', Impact, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const metrics = ctx.measureText(text);
  const textWidth = Math.min(VIRTUAL_SIZE - 8, metrics.width);
  const pillWidth = Math.min(VIRTUAL_SIZE - 4, textWidth + 16);
  const pillHeight = Math.min(VIRTUAL_SIZE - 4, fontSize + 10);

  let centerY = VIRTUAL_SIZE - pillHeight / 2 - 4;
  if (modifiers.badgePosition === 'top') {
    centerY = pillHeight / 2 + 4;
  } else if (modifiers.badgePosition === 'center') {
    centerY = VIRTUAL_SIZE / 2;
  }

  if (modifiers.badgeShowPill) {
    ctx.fillStyle = modifiers.badgeBgColor || '#111827';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 2;
    drawRoundedRect(
      ctx,
      (VIRTUAL_SIZE - pillWidth) / 2,
      centerY - pillHeight / 2,
      pillWidth,
      pillHeight,
      8
    );
    ctx.fill();
    ctx.stroke();
  }

  // Heavy dark outline for maximum legibility on any background
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  ctx.lineWidth = Math.max(4, Math.round(fontSize * 0.22));
  ctx.strokeStyle = modifiers.badgeBgColor || '#09090b';
  ctx.strokeText(text, VIRTUAL_SIZE / 2, centerY + 1, VIRTUAL_SIZE - 10);

  ctx.fillStyle = modifiers.badgeColor || '#ffffff';
  ctx.fillText(text, VIRTUAL_SIZE / 2, centerY + 1, VIRTUAL_SIZE - 10);
  ctx.restore();
}
