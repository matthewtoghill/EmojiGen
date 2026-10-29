import React, { useEffect, useState } from 'react';
import { Moon, Sun, Columns, Plus, Film, Loader2 } from 'lucide-react';
import type { LoadedEmoji, ParamValues, UniversalModifiers } from '../types/emoji';
import type { PlaybackClock } from '../lib/animationClock';
import { exportEmojiToGif } from '../lib/exporter';
import { EmojiCanvas } from './EmojiCanvas';

const EXPORT_PREVIEW_DEBOUNCE_MS = 600;

interface SlackPreviewProps {
  emoji: LoadedEmoji;
  params: ParamValues;
  modifiers: Partial<UniversalModifiers>;
  playing: boolean;
  scrubT: number;
  clock?: PlaybackClock;
  rasterImage?: HTMLImageElement | null;
}

export const SlackPreview: React.FC<SlackPreviewProps> = ({
  emoji,
  params,
  modifiers,
  playing,
  scrubT,
  clock,
  rasterImage,
}) => {
  const [themeMode, setThemeMode] = useState<'both' | 'dark' | 'light'>('both');
  const [showExported, setShowExported] = useState(false);
  const [exported, setExported] = useState<{ url: string; sizeKb: string } | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [isEncoding, setIsEncoding] = useState(false);

  // Encode the real GIF (debounced) so the simulator shows exactly what Slack will get:
  // hard alpha cutoff, reduced palette, and the exported frame timing.
  useEffect(() => {
    if (!showExported) {
      setExported(null);
      setExportError(null);
      setIsEncoding(false);
      return;
    }
    let cancelled = false;
    setIsEncoding(true);
    const timer = setTimeout(async () => {
      try {
        const result = await exportEmojiToGif(emoji, params, modifiers, rasterImage);
        if (cancelled) return;
        setExported({ url: result.dataUrl, sizeKb: (result.sizeBytes / 1024).toFixed(1) });
        setExportError(null);
      } catch (err: any) {
        if (cancelled) return;
        setExported(null);
        setExportError(err?.message || String(err));
      } finally {
        if (!cancelled) setIsEncoding(false);
      }
    }, EXPORT_PREVIEW_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [showExported, emoji, params, modifiers, rasterImage]);

  const renderEmoji = (size: number) =>
    showExported ? (
      exported ? (
        <img src={exported.url} width={size} height={size} alt={`:${emoji.manifest.shortcode}:`} />
      ) : (
        <span style={{ width: size, height: size }} className="inline-block" />
      )
    ) : (
      <EmojiCanvas
        emoji={emoji}
        params={params}
        modifiers={modifiers}
        size={size}
        playing={playing}
        scrubT={scrubT}
        clock={clock}
      />
    );
  const [reactionCount, setReactionCount] = useState(5);
  const [reacted, setReacted] = useState(true);

  const toggleReaction = () => {
    if (reacted) {
      setReacted(false);
      setReactionCount((c) => Math.max(1, c - 1));
    } else {
      setReacted(true);
      setReactionCount((c) => c + 1);
    }
  };

  const renderCard = (isDark: boolean) => {
    const bg = isDark ? 'bg-[#1A1D21] text-[#D1D2D3] border-zinc-800' : 'bg-white text-[#1D1C1D] border-zinc-200';
    const muted = isDark ? 'text-[#ABABAD]' : 'text-[#616061]';
    const codeBg = isDark ? 'bg-[#222529] text-[#E8912D] border-[#35373B]' : 'bg-[#F8F8F8] text-[#E01E5A] border-[#DDDDDD]';
    const reactionActive = isDark
      ? 'bg-[#1D2A3A] border-[#1D9BD1] text-[#1D9BD1]'
      : 'bg-[#E8F5FA] border-[#1D9BD1] text-[#1264A3]';
    const reactionIdle = isDark
      ? 'bg-[#222529] border-transparent text-[#D1D2D3] hover:border-zinc-600'
      : 'bg-[#F2F2F2] border-transparent text-[#1D1C1D] hover:border-zinc-300';

    return (
      <div className={`rounded-xl border p-3.5 transition-colors ${bg}`}>
        <div className="flex items-center justify-between mb-2.5 pb-1.5 border-b border-current/10">
          <span className="text-[11px] font-semibold uppercase tracking-wider opacity-70 flex items-center gap-1.5">
            {isDark ? <Moon className="w-3 h-3 text-indigo-400" /> : <Sun className="w-3 h-3 text-amber-500" />}
            Slack {isDark ? 'Dark (#1A1D21)' : 'Light (#FFFFFF)'}
          </span>
          <span className={`text-[11px] font-mono px-1.5 py-0.5 rounded border ${codeBg}`}>
            :{emoji.manifest.shortcode}:
          </span>
        </div>

        {/* Message 1: Inline 22px + Reaction Pill 16px */}
        <div className="flex gap-2.5 items-start">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-xs shrink-0 mt-0.5">
            MT
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="font-bold text-[13px]">Alex Rivera</span>
              <span className={`text-[11px] ${muted}`}>2:41 PM</span>
            </div>
            <p className="text-[13.5px] leading-relaxed mt-0.5 flex flex-wrap items-center gap-1">
              <span>Status update on the release</span>
              <span className="inline-flex items-center align-middle mx-0.5" title="22x22px Inline Slack Emoji">
                {renderEmoji(22)}
              </span>
              <span>— what do we think?</span>
            </p>

            {/* Reaction Bar + Jumbo Preview Row */}
            <div className="flex flex-wrap items-center justify-between gap-2 mt-2.5 pt-2 border-t border-current/5">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={toggleReaction}
                  aria-pressed={reacted}
                  aria-label={`${reacted ? 'Remove' : 'Add'} :${emoji.manifest.shortcode}: reaction (${reactionCount})`}
                  title="Click to test 16x16px Slack reaction pill"
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-medium transition cursor-pointer ${
                    reacted ? reactionActive : reactionIdle
                  }`}
                >
                  {renderEmoji(16)}
                  <span>{reactionCount}</span>
                </button>
                <span
                  className={`inline-flex items-center justify-center w-6 h-5 rounded-full border border-dashed border-current/20 opacity-60`}
                >
                  <Plus className="w-3 h-3" />
                </span>
              </div>

              {/* Jumbo Standalone 32px & 48px */}
              <div className="flex items-center gap-2.5">
                <div className="flex items-center gap-1.5" title="32x32px Jumbo Slack Emoji">
                  <span className={`text-[10px] font-mono ${muted}`}>32px</span>
                  {renderEmoji(32)}
                </div>
                <div className="flex items-center gap-1.5" title="48x48px Big Preview">
                  <span className={`text-[10px] font-mono ${muted}`}>48px</span>
                  {renderEmoji(48)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white dark:bg-zinc-900/70 border border-zinc-200 dark:border-zinc-800/80 rounded-2xl p-4 shadow-2xs dark:shadow-none transition-colors">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-400">
            Live Slack Context Simulator
          </h3>
          <p className="text-[11px] text-zinc-500">
            Verify legibility at 16px (reaction), 22px (inline text), and 32px (jumbo)
          </p>
          {showExported && (
            <p className="text-[11px] mt-0.5 flex items-center gap-1 text-zinc-500">
              {isEncoding && <Loader2 className="w-3 h-3 animate-spin" />}
              {exportError ? (
                <span className="text-red-600 dark:text-red-400">Encoding failed: {exportError}</span>
              ) : isEncoding ? (
                'Encoding GIF...'
              ) : exported ? (
                `Showing exported GIF (${exported.sizeKb} KB). It plays at its own frame rate, not the timeline.`
              ) : null}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowExported((v) => !v)}
            aria-pressed={showExported}
            title="Show the actual encoded GIF instead of the live vector preview"
            className={`px-2.5 py-1 rounded-lg border text-xs flex items-center gap-1.5 transition cursor-pointer ${
              showExported
                ? 'bg-indigo-600 border-indigo-600 text-white font-medium'
                : 'bg-zinc-100 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            <Film className="w-3.5 h-3.5" />
            Show exported result
          </button>

          <div className="flex items-center bg-zinc-100 dark:bg-zinc-950 p-1 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs">
            <button
              type="button"
              onClick={() => setThemeMode('both')}
              aria-pressed={themeMode === 'both'}
              className={`px-2.5 py-1 rounded-md flex items-center gap-1.5 transition cursor-pointer ${
                themeMode === 'both'
                  ? 'bg-indigo-600 text-white font-medium'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              <Columns className="w-3.5 h-3.5" />
              Both
            </button>
            <button
              type="button"
              onClick={() => setThemeMode('dark')}
              aria-pressed={themeMode === 'dark'}
              className={`px-2.5 py-1 rounded-md flex items-center gap-1.5 transition cursor-pointer ${
                themeMode === 'dark'
                  ? 'bg-indigo-600 text-white font-medium'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              <Moon className="w-3.5 h-3.5" />
              Dark
            </button>
            <button
              type="button"
              onClick={() => setThemeMode('light')}
              aria-pressed={themeMode === 'light'}
              className={`px-2.5 py-1 rounded-md flex items-center gap-1.5 transition cursor-pointer ${
                themeMode === 'light'
                  ? 'bg-indigo-600 text-white font-medium'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              <Sun className="w-3.5 h-3.5" />
              Light
            </button>
          </div>
        </div>
      </div>

      <div
        className={`grid gap-3 ${
          themeMode === 'both' ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-1'
        }`}
      >
        {(themeMode === 'both' || themeMode === 'dark') && renderCard(true)}
        {(themeMode === 'both' || themeMode === 'light') && renderCard(false)}
      </div>
    </div>
  );
};
