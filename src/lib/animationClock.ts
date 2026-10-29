type FrameCallback = (now: number, dtMs: number) => void;

const clockUpdaters = new Set<FrameCallback>();
const frameSubscribers = new Set<FrameCallback>();

let rafId: number | null = null;
let lastFrameTime: number | null = null;

function runFrameLoop(now: number) {
  const dtMs =
    lastFrameTime === null ? 0 : Math.max(0, Math.min(100, now - lastFrameTime));
  lastFrameTime = now;

  // 1. Advance shared playback clocks first so all canvases read the same t
  for (const updateClock of clockUpdaters) {
    updateClock(now, dtMs);
  }

  // 2. Render all subscribed canvases and UI scrubbers
  for (const subscriber of frameSubscribers) {
    subscriber(now, dtMs);
  }

  if (clockUpdaters.size > 0 || frameSubscribers.size > 0) {
    rafId = requestAnimationFrame(runFrameLoop);
  } else {
    rafId = null;
    lastFrameTime = null;
  }
}

function ensureLoopRunning() {
  if (rafId === null && (clockUpdaters.size > 0 || frameSubscribers.size > 0)) {
    lastFrameTime = null;
    rafId = requestAnimationFrame(runFrameLoop);
  }
}

/**
 * Subscribe a canvas or listener to the single shared requestAnimationFrame loop.
 */
export function subscribeAnimationFrame(callback: FrameCallback): () => void {
  frameSubscribers.add(callback);
  ensureLoopRunning();

  return () => {
    frameSubscribers.delete(callback);
    if (clockUpdaters.size === 0 && frameSubscribers.size === 0 && rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
      lastFrameTime = null;
    }
  };
}

export function getEffectiveDurationMs(duration = 1.2, speed = 1): number {
  return (
    Math.max(0.4, (duration || 1.2) / Math.max(0.25, speed || 1)) * 1000
  );
}

/**
 * Shared normalized [0, 1) playback clock that starts from the current scrub position
 * and keeps all stage, preview, and scrubber components synchronized.
 */
export class PlaybackClock {
  private t = 0;
  private playing = true;
  private durationMs = getEffectiveDurationMs(1.2, 1);
  private listeners = new Set<(t: number) => void>();
  private unsubscribeLoop: (() => void) | null = null;

  constructor(initialT = 0) {
    this.t = this.normalizeT(initialT);
  }

  private normalizeT(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return ((value % 1) + 1) % 1;
  }

  getT(): number {
    return this.t;
  }

  setT(nextT: number): void {
    this.t = this.normalizeT(nextT);
    this.notifyListeners();
  }

  setTiming(duration = 1.2, speed = 1): void {
    this.durationMs = getEffectiveDurationMs(duration, speed);
  }

  setPlaying(playing: boolean): void {
    if (this.playing === playing) return;
    this.playing = playing;
    this.updateLoopRegistration();
  }

  subscribe(listener: (t: number) => void): () => void {
    this.listeners.add(listener);
    this.updateLoopRegistration();
    return () => {
      this.listeners.delete(listener);
      this.updateLoopRegistration();
    };
  }

  attach(): () => void {
    this.updateLoopRegistration();
    return () => {
      this.stopLoop();
    };
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener(this.t);
    }
  }

  private handleTick = (_now: number, dtMs: number) => {
    if (!this.playing || dtMs <= 0) return;
    this.t = this.normalizeT(this.t + dtMs / this.durationMs);
    this.notifyListeners();
  };

  private updateLoopRegistration(): void {
    if (this.playing && !this.unsubscribeLoop) {
      clockUpdaters.add(this.handleTick);
      ensureLoopRunning();
      this.unsubscribeLoop = () => {
        clockUpdaters.delete(this.handleTick);
      };
    } else if (!this.playing && this.unsubscribeLoop) {
      this.stopLoop();
    }
  }

  private stopLoop(): void {
    if (this.unsubscribeLoop) {
      this.unsubscribeLoop();
      this.unsubscribeLoop = null;
    }
  }
}
