import { describe, expect, it } from 'vitest';
import {
  MERGE_WINDOW_MS,
  applyEdit,
  canStep,
  clearOverrides,
  isModified,
  setOverride,
  stepEdit,
  type StudioEdits,
} from './edits';
import type { LoadedEmoji } from '../types/emoji';

const emoji = {
  slug: 'demo',
  manifest: { defaultParams: { color: '#fff', size: 1 }, modifiers: { fps: 12 } },
} as unknown as LoadedEmoji;

const empty: StudioEdits = { edits: {}, history: {} };
const setParam = (s: StudioEdits, key: string, value: unknown, now: number) =>
  applyEdit(
    s,
    'demo',
    (cur) => setOverride(cur, 'params', key, value, emoji.manifest.defaultParams[key]),
    `params.${key}`,
    now
  );

describe('edits', () => {
  it('drops overrides that match the saved default', () => {
    const edited = setOverride(undefined, 'params', 'size', 2, 1);
    expect(edited).toEqual({ params: { size: 2 } });
    expect(setOverride(edited, 'params', 'size', 1, 1)).toBeUndefined();
    expect(clearOverrides({ params: { size: 2 }, modifiers: { fps: 8 } }, 'params')).toEqual({
      modifiers: { fps: 8 },
    });
  });

  it('detects modified state against the saved manifest', () => {
    expect(isModified(emoji, undefined)).toBe(false);
    expect(isModified(emoji, { params: { size: 1 }, modifiers: { fps: 12 } })).toBe(false);
    expect(isModified(emoji, { modifiers: { fps: 20 } })).toBe(true);
  });

  it('merges rapid changes to one setting into a single undo step', () => {
    let s = setParam(empty, 'size', 2, 1000);
    s = setParam(s, 'size', 3, 1000 + MERGE_WINDOW_MS - 1);
    s = setParam(s, 'color', '#000', 1100);
    s = setParam(s, 'size', 4, 5000);
    expect(s.history.demo.past).toHaveLength(3);

    s = stepEdit(s, 'demo', 'undo');
    expect(s.edits.demo).toEqual({ params: { size: 3, color: '#000' } });
    s = stepEdit(stepEdit(s, 'demo', 'undo'), 'demo', 'undo');
    expect(s.edits.demo).toBeUndefined();
    expect(canStep(s, 'demo', 'undo')).toBe(false);

    s = stepEdit(s, 'demo', 'redo');
    expect(s.edits.demo).toEqual({ params: { size: 3 } });
    // A new edit after undo clears the redo stack
    s = setParam(s, 'size', 9, 9000);
    expect(canStep(s, 'demo', 'redo')).toBe(false);
  });

  it('ignores no-op edits', () => {
    expect(setParam(empty, 'size', 1, 0)).toBe(empty);
  });
});
