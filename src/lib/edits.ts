// Unsaved per-emoji tweaks plus a per-emoji undo/redo history.
// Edits store only the values that differ from the emoji's saved emoji.json.
import {
  DEFAULT_UNIVERSAL_MODIFIERS,
  type LoadedEmoji,
  type ParamValues,
  type UniversalModifiers,
} from '../types/emoji';

export interface EmojiEdits {
  params?: ParamValues;
  modifiers?: Partial<UniversalModifiers>;
}

export interface EditHistory {
  past: Array<EmojiEdits | undefined>;
  future: Array<EmojiEdits | undefined>;
  lastKey?: string;
  lastAt: number;
}

export interface StudioEdits {
  edits: Record<string, EmojiEdits>;
  history: Record<string, EditHistory>;
}

// Consecutive changes to the same setting within this window are one undo step
export const MERGE_WINDOW_MS = 500;
const MAX_HISTORY = 100;

export const savedModifiers = (emoji: LoadedEmoji): UniversalModifiers => ({
  ...DEFAULT_UNIVERSAL_MODIFIERS,
  ...(emoji.manifest.modifiers || {}),
});

const withPart = (
  cur: EmojiEdits | undefined,
  part: keyof EmojiEdits,
  overrides: Record<string, unknown>
): EmojiEdits | undefined => {
  const next: EmojiEdits = { ...cur };
  if (Object.keys(overrides).length) next[part] = overrides;
  else delete next[part];
  return next.params || next.modifiers ? next : undefined;
};

/** Sets one override, or drops it when the value matches the saved default. */
export const setOverride = (
  cur: EmojiEdits | undefined,
  part: keyof EmojiEdits,
  key: string,
  value: unknown,
  savedValue: unknown
): EmojiEdits | undefined => {
  const overrides: Record<string, unknown> = { ...(cur?.[part] || {}) };
  if (value === savedValue) delete overrides[key];
  else overrides[key] = value;
  return withPart(cur, part, overrides);
};

export const clearOverrides = (cur: EmojiEdits | undefined, part: keyof EmojiEdits) =>
  withPart(cur, part, {});

/** True when any edit differs from the emoji's current saved emoji.json. */
export const isModified = (emoji: LoadedEmoji, edits: EmojiEdits | undefined): boolean => {
  if (!edits) return false;
  const saved = savedModifiers(emoji);
  return (
    Object.entries(edits.params || {}).some(([k, v]) => v !== emoji.manifest.defaultParams[k]) ||
    Object.entries(edits.modifiers || {}).some(
      ([k, v]) => v !== saved[k as keyof UniversalModifiers]
    )
  );
};

/** Applies an edit to one emoji and records the previous state as an undo step. */
export const applyEdit = (
  state: StudioEdits,
  slug: string,
  update: (cur: EmojiEdits | undefined) => EmojiEdits | undefined,
  mergeKey: string | undefined,
  now: number
): StudioEdits => {
  const cur = state.edits[slug];
  const next = update(cur);
  if (JSON.stringify(next) === JSON.stringify(cur)) return state;

  const h = state.history[slug];
  const merge =
    h && mergeKey && h.lastKey === mergeKey && now - h.lastAt < MERGE_WINDOW_MS;
  const edits = { ...state.edits };
  if (next) edits[slug] = next;
  else delete edits[slug];
  return {
    edits,
    history: {
      ...state.history,
      [slug]: {
        past: merge ? h.past : [...(h?.past || []), cur].slice(-MAX_HISTORY),
        future: [],
        lastKey: mergeKey,
        lastAt: now,
      },
    },
  };
};

export const canStep = (state: StudioEdits, slug: string, dir: 'undo' | 'redo') =>
  Boolean(state.history[slug]?.[dir === 'undo' ? 'past' : 'future'].length);

export const stepEdit = (state: StudioEdits, slug: string, dir: 'undo' | 'redo'): StudioEdits => {
  const h = state.history[slug];
  if (!canStep(state, slug, dir)) return state;
  const cur = state.edits[slug];
  const from = dir === 'undo' ? h.past : h.future;
  const target = from[from.length - 1];
  const rest = from.slice(0, -1);
  const edits = { ...state.edits };
  if (target) edits[slug] = target;
  else delete edits[slug];
  return {
    edits,
    history: {
      ...state.history,
      [slug]:
        dir === 'undo'
          ? { past: rest, future: [...h.future, cur], lastAt: 0 }
          : { past: [...h.past, cur], future: rest, lastAt: 0 },
    },
  };
};

const STORAGE_KEY = 'emojigen-edits';

export const loadStoredEdits = (): Record<string, EmojiEdits> => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

export const storeEdits = (edits: Record<string, EmojiEdits>) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(edits));
  } catch {
    // Ignore storage errors
  }
};
