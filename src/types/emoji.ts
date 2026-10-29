export type ParamControlType = 'color' | 'number' | 'text' | 'boolean' | 'select';

export interface ParamDefinition {
  type: ParamControlType;
  label: string;
  description?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ label: string; value: string }>;
}

export type ParamsSchema = Record<string, ParamDefinition>;
export type ParamValues = Record<string, any>;

export type UniversalMotionType =
  | 'none'
  | 'shake'
  | 'party'
  | 'bounce'
  | 'spin'
  | 'pulse'
  | 'wobble'
  | 'glitch';

export type BadgePosition = 'bottom' | 'center' | 'top';

export interface UniversalModifiers {
  motion: UniversalMotionType;
  motionIntensity: number; // 0.1 to 2.0
  speed: number; // 0.25 to 3.0 multiplier
  fps: number; // 8 to 30
  duration: number; // loop duration in seconds (e.g. 1.2)
  scale: number; // 0.5 to 1.5
  rotation: number; // -180 to 180 deg
  flipX: boolean;
  flipY: boolean;
  hueRotate: number; // -180 to 180 deg
  saturate: number; // 0 to 250%
  brightness: number; // 50 to 150%
  contrast: number; // 50 to 150%
  backgroundTransparent: boolean;
  backgroundColor: string;
  backgroundRadius: number; // 0 to 64
  badgeText: string;
  badgeColor: string;
  badgeBgColor: string;
  badgeShowPill: boolean;
  badgePosition: BadgePosition;
  badgeScale: number; // 0.6 to 1.5
}

export const DEFAULT_UNIVERSAL_MODIFIERS: UniversalModifiers = {
  motion: 'none',
  motionIntensity: 1.0,
  speed: 1.0,
  fps: 20,
  duration: 1.2,
  scale: 1.0,
  rotation: 0,
  flipX: false,
  flipY: false,
  hueRotate: 0,
  saturate: 100,
  brightness: 100,
  contrast: 100,
  backgroundTransparent: true,
  backgroundColor: '#1e1b4b',
  backgroundRadius: 24,
  badgeText: '',
  badgeColor: '#ffffff',
  badgeBgColor: '#111827',
  badgeShowPill: true,
  badgePosition: 'bottom',
  badgeScale: 1.0,
};

export interface EmojiManifest {
  id: string;
  name: string;
  shortcode: string;
  description: string;
  tags: string[];
  animated: boolean;
  author?: string;
  createdAt?: string;
  prompt?: string;
  rasterAsset?: string;
  paramsSchema: ParamsSchema;
  defaultParams: ParamValues;
  modifiers?: Partial<UniversalModifiers>;
}

export interface EmojiRenderContext {
  /** Normalized loop time in [0, 1) */
  t: number;
  /** Width of canvas (always 128 in virtual coordinates) */
  width: number;
  /** Height of canvas (always 128 in virtual coordinates) */
  height: number;
  /** Current custom parameter values */
  params: ParamValues;
}

export type EmojiRenderFn = (
  ctx: CanvasRenderingContext2D,
  state: EmojiRenderContext
) => void;

export interface LoadedEmoji {
  slug: string;
  manifest: EmojiManifest;
  render?: EmojiRenderFn;
  rasterUrl?: string;
}
