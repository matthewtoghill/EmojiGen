import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_UNIVERSAL_MODIFIERS,
  type LoadedEmoji,
  type ParamValues,
  type UniversalModifiers,
} from '../types/emoji';
import { renderEmojiFrame } from '../lib/renderer';
import {
  getEffectiveDurationMs,
  subscribeAnimationFrame,
  type PlaybackClock,
} from '../lib/animationClock';
import {
  computeGifTiming,
  getEffectiveDurationSeconds,
} from '../lib/exporter';

const EMPTY_PARAMS: ParamValues = {};
const EMPTY_MODIFIERS: Partial<UniversalModifiers> = {};

interface EmojiCanvasProps {
  emoji: LoadedEmoji;
  params?: ParamValues;
  modifiers?: Partial<UniversalModifiers>;
  size?: number;
  playing?: boolean;
  /** Manual normalized time in [0, 1) when paused or scrubbing */
  scrubT?: number;
  /** Optional shared playback clock for synchronized multi-canvas playback */
  clock?: PlaybackClock;
  onTimeUpdate?: (t: number) => void;
  className?: string;
}

export const EmojiCanvas: React.FC<EmojiCanvasProps> = ({
  emoji,
  params = EMPTY_PARAMS,
  modifiers = EMPTY_MODIFIERS,
  size = 128,
  playing = true,
  scrubT = 0,
  clock,
  onTimeUpdate,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [rasterImg, setRasterImg] = useState<HTMLImageElement | null>(null);
  const localTRef = useRef<number>(((scrubT % 1) + 1) % 1);
  const lastFrameIdxRef = useRef<number>(-1);

  useEffect(() => {
    if (!emoji.rasterUrl) {
      setRasterImg(null);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!cancelled) {
        setRasterImg(img);
      }
    };
    img.src = emoji.rasterUrl;
    return () => {
      cancelled = true;
    };
  }, [emoji.rasterUrl]);

  const effectiveModifiers: UniversalModifiers = useMemo(
    () => ({
      ...DEFAULT_UNIVERSAL_MODIFIERS,
      ...(emoji.manifest.modifiers || {}),
      ...modifiers,
    }),
    [emoji.manifest.modifiers, modifiers]
  );

  const totalFrames = useMemo(
    () =>
      computeGifTiming(
        getEffectiveDurationSeconds(
          effectiveModifiers.duration,
          effectiveModifiers.speed
        ),
        effectiveModifiers.fps,
        36
      ).frames,
    [
      effectiveModifiers.duration,
      effectiveModifiers.speed,
      effectiveModifiers.fps,
    ]
  );

  const isAnimated =
    emoji.manifest.animated || effectiveModifiers.motion !== 'none';

  // Keep latest render inputs in a ref so the shared RAF subscriber never needs
  // to tear down and restart when parameters or modifiers are tweaked.
  const renderStateRef = useRef({
    emoji,
    params,
    effectiveModifiers,
    totalFrames,
    rasterImg,
    onTimeUpdate,
  });
  renderStateRef.current = {
    emoji,
    params,
    effectiveModifiers,
    totalFrames,
    rasterImg,
    onTimeUpdate,
  };

  // Sync local phase when scrubT changes
  useEffect(() => {
    localTRef.current = ((scrubT % 1) + 1) % 1;
  }, [scrubT]);

  // Reset local phase when switching to a different emoji on standalone canvases
  useEffect(() => {
    if (!clock) {
      localTRef.current = ((scrubT % 1) + 1) % 1;
    }
  }, [emoji.slug, clock, scrubT]);

  // Draw immediately when static, paused, scrubbed, resized, or when params/modifiers change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rawT = !isAnimated
      ? 0
      : playing
      ? clock
        ? clock.getT()
        : localTRef.current
      : ((scrubT % 1) + 1) % 1;

    const frameIdx =
      isAnimated && playing
        ? Math.floor(rawT * totalFrames) % totalFrames
        : -1;
    lastFrameIdxRef.current = frameIdx;
    const renderT =
      isAnimated && playing ? frameIdx / totalFrames : rawT;

    renderEmojiFrame(
      ctx,
      emoji,
      params,
      effectiveModifiers,
      renderT,
      rasterImg
    );
  }, [
    emoji,
    params,
    effectiveModifiers,
    totalFrames,
    playing,
    isAnimated,
    scrubT,
    clock,
    rasterImg,
    size,
  ]);

  // Subscribe to the single shared animation loop while playing an animated emoji
  useEffect(() => {
    if (!playing || !isAnimated) return;

    return subscribeAnimationFrame((_now, dtMs) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const {
        emoji: currentEmoji,
        params: currentParams,
        effectiveModifiers: currentModifiers,
        totalFrames: currentTotalFrames,
        rasterImg: currentRasterImg,
        onTimeUpdate: currentOnTimeUpdate,
      } = renderStateRef.current;

      let rawT: number;
      if (clock) {
        rawT = clock.getT();
        localTRef.current = rawT;
      } else {
        const durationMs = getEffectiveDurationMs(
          currentModifiers.duration,
          currentModifiers.speed
        );
        localTRef.current =
          (((localTRef.current + dtMs / durationMs) % 1) + 1) % 1;
        rawT = localTRef.current;
      }

      // Quantize playback time to the active frame count so the FPS slider
      // visually steps the preview at the exact exported frame rate.
      const frameIdx =
        Math.floor(rawT * currentTotalFrames) % currentTotalFrames;
      if (frameIdx === lastFrameIdxRef.current) {
        return;
      }
      lastFrameIdxRef.current = frameIdx;
      const quantizedT = frameIdx / currentTotalFrames;

      renderEmojiFrame(
        ctx,
        currentEmoji,
        currentParams,
        currentModifiers,
        quantizedT,
        currentRasterImg
      );
      if (currentOnTimeUpdate) {
        currentOnTimeUpdate(quantizedT);
      }
    });
  }, [playing, isAnimated, clock]);

  // Render at 2x resolution for crisp display on HiDPI screens
  const pixelResolution = Math.max(128, Math.min(512, size * 2));

  return (
    <canvas
      ref={canvasRef}
      width={pixelResolution}
      height={pixelResolution}
      style={{ width: `${size}px`, height: `${size}px` }}
      className={`select-none ${className}`}
    />
  );
};
