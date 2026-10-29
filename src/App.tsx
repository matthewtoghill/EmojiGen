import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  Sparkles,
  Play,
  Pause,
  Grid,
  Upload,
  Terminal,
  FolderCode,
  Film,
  Image as ImageIcon,
  Download,
  Sun,
  Moon,
  AlertTriangle,
  X,
} from 'lucide-react';
import { loadAllEmojis } from './lib/emojiRegistry';
import {
  DEFAULT_UNIVERSAL_MODIFIERS,
  type LoadedEmoji,
  type ParamValues,
  type UniversalModifiers,
} from './types/emoji';
import { EmojiCanvas } from './components/EmojiCanvas';
import { SlackPreview } from './components/SlackPreview';
import { InspectorPanel } from './components/InspectorPanel';
import { LlmPromptModal } from './components/LlmPromptModal';
import {
  computeGifTiming,
  exportEmojiToGif,
  exportEmojiToPng,
  getEffectiveDurationSeconds,
  type ExportResult,
} from './lib/exporter';
import { PlaybackClock } from './lib/animationClock';
import { API_AVAILABLE, apiPost } from './lib/api';

interface SidebarEmojiItemProps {
  emoji: LoadedEmoji;
  isSelected: boolean;
  params: ParamValues;
  modifiers: UniversalModifiers;
  onSelect: (slug: string) => void;
}

const SidebarEmojiItem: React.FC<SidebarEmojiItemProps> = React.memo(
  ({ emoji, isSelected, params, modifiers, onSelect }) => (
    <button
      type="button"
      onClick={() => onSelect(emoji.slug)}
      aria-current={isSelected ? 'true' : undefined}
      className={`w-full p-2.5 rounded-xl border text-left transition flex items-center gap-3 cursor-pointer ${
        isSelected
          ? 'bg-indigo-50/90 dark:bg-indigo-600/15 border-indigo-500/70 shadow-xs'
          : 'bg-zinc-50/70 dark:bg-zinc-950/60 border-zinc-200/80 dark:border-zinc-800/70 hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-zinc-100/70 dark:hover:bg-zinc-900'
      }`}
    >
      <div className="w-12 h-12 rounded-xl bg-checkerboard-light dark:bg-checkerboard-dark border border-zinc-200 dark:border-zinc-800 flex items-center justify-center shrink-0 overflow-hidden">
        <EmojiCanvas
          emoji={emoji}
          params={params}
          modifiers={modifiers}
          size={44}
          playing={true}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-1">
          <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">
            {emoji.manifest.name}
          </span>
          {emoji.manifest.animated ? (
            <Film className="w-3 h-3 text-indigo-500 dark:text-indigo-400 shrink-0" />
          ) : (
            <ImageIcon className="w-3 h-3 text-emerald-500 dark:text-emerald-400 shrink-0" />
          )}
        </div>
        <div className="text-[11px] font-mono text-indigo-600 dark:text-indigo-400 truncate mt-0.5">
          :{emoji.manifest.shortcode}:
        </div>
        <div className="flex flex-wrap gap-1 mt-1">
          {emoji.manifest.tags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className="text-[9px] px-1.5 py-0.2 rounded bg-zinc-200/70 dark:bg-zinc-800/90 text-zinc-600 dark:text-zinc-400"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </button>
  )
);

interface TimelineScrubberProps {
  clock: PlaybackClock;
  playing: boolean;
  scrubT: number;
  totalFrames: number;
  onTogglePlay: () => void;
  onScrub: (nextT: number) => void;
}

const TimelineScrubber: React.FC<TimelineScrubberProps> = ({
  clock,
  playing,
  scrubT,
  totalFrames,
  onTogglePlay,
  onScrub,
}) => {
  const [displayT, setDisplayT] = useState<number>(() =>
    playing ? clock.getT() : scrubT
  );

  useEffect(() => {
    if (!playing) {
      setDisplayT(scrubT);
      return;
    }
    setDisplayT(clock.getT());
    return clock.subscribe((t) => {
      setDisplayT(t);
    });
  }, [clock, playing, scrubT]);

  const effectiveT = playing ? displayT : scrubT;
  const currentFrameNumber = Math.floor((effectiveT % 1) * totalFrames) + 1;

  return (
    <div className="w-full max-w-xl mt-4 pt-3 border-t border-zinc-200 dark:border-zinc-800/80 flex items-center gap-3">
      <button
        type="button"
        onClick={onTogglePlay}
        aria-label={playing ? 'Pause' : 'Play'}
        className="w-9 h-9 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center shrink-0 cursor-pointer"
      >
        {playing ? (
          <Pause className="w-4 h-4" />
        ) : (
          <Play className="w-4 h-4 ml-0.5" />
        )}
      </button>

      <div className="flex-1">
        <div className="flex items-center justify-between text-[11px] font-mono text-zinc-500 dark:text-zinc-400 mb-1">
          <span>
            Frame {currentFrameNumber} / {totalFrames}
          </span>
          <span>Progress: {Math.round((effectiveT % 1) * 100)}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={0.99}
          step={0.01}
          value={Math.min(0.99, Math.max(0, effectiveT))}
          onChange={(e) => onScrub(parseFloat(e.target.value))}
          aria-label="Timeline position"
          className="w-full accent-indigo-500 cursor-pointer"
        />
      </div>
    </div>
  );
};

export const App: React.FC = () => {
  const emojis = useMemo(() => loadAllEmojis(), []);
  const [selectedSlug, setSelectedSlug] = useState<string>(
    emojis[0]?.slug || 'ship-it-rocket'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'animated' | 'static'>('all');

  // App-wide Light / Dark theme state
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem('emojigen-theme');
      if (saved === 'light' || saved === 'dark') return saved;
    }
    return 'dark';
  });

  // Studio Canvas state & shared playback clock
  const [playing, setPlaying] = useState(true);
  const [scrubT, setScrubT] = useState(0);
  const [playbackClock] = useState(() => new PlaybackClock(0));
  const [canvasBg, setCanvasBg] = useState<'checker-dark' | 'checker-light' | 'slack-dark' | 'slack-light'>(() =>
    theme === 'light' ? 'checker-light' : 'checker-dark'
  );
  const [showGuides, setShowGuides] = useState(false);

  useEffect(() => {
    return playbackClock.attach();
  }, [playbackClock]);

  useEffect(() => {
    playbackClock.setPlaying(playing);
  }, [playbackClock, playing]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.style.colorScheme = theme;
    try {
      window.localStorage.setItem('emojigen-theme', theme);
    } catch {
      // Ignore storage errors
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      setCanvasBg((bg) => {
        if (next === 'light' && bg === 'checker-dark') return 'checker-light';
        if (next === 'dark' && bg === 'checker-light') return 'checker-dark';
        return bg;
      });
      return next;
    });
  };

  // Per-emoji active parameter & modifier edits
  const [customParamsBySlug, setCustomParamsBySlug] = useState<Record<string, ParamValues>>({});
  const [modifiersBySlug, setModifiersBySlug] = useState<Record<string, UniversalModifiers>>({});

  // Memoize per-emoji resolved params & modifiers by value so sidebar items
  // keep stable references unless their specific slug's settings change
  const resolvedParamsCacheRef = useRef<Record<string, { customRef: ParamValues | undefined; value: ParamValues }>>({});
  const resolvedParamsBySlug = useMemo(() => {
    const nextCache: Record<string, { customRef: ParamValues | undefined; value: ParamValues }> = {};
    const result: Record<string, ParamValues> = {};
    for (const item of emojis) {
      const customRef = customParamsBySlug[item.slug];
      const prev = resolvedParamsCacheRef.current[item.slug];
      if (prev && prev.customRef === customRef) {
        nextCache[item.slug] = prev;
        result[item.slug] = prev.value;
      } else {
        const value: ParamValues = customRef
          ? { ...item.manifest.defaultParams, ...customRef }
          : item.manifest.defaultParams;
        nextCache[item.slug] = { customRef, value };
        result[item.slug] = value;
      }
    }
    resolvedParamsCacheRef.current = nextCache;
    return result;
  }, [emojis, customParamsBySlug]);

  const resolvedModifiersCacheRef = useRef<
    Record<string, { customRef: UniversalModifiers | undefined; value: UniversalModifiers }>
  >({});
  const resolvedModifiersBySlug = useMemo(() => {
    const nextCache: Record<
      string,
      { customRef: UniversalModifiers | undefined; value: UniversalModifiers }
    > = {};
    const result: Record<string, UniversalModifiers> = {};
    for (const item of emojis) {
      const customRef = modifiersBySlug[item.slug];
      const prev = resolvedModifiersCacheRef.current[item.slug];
      if (prev && prev.customRef === customRef) {
        nextCache[item.slug] = prev;
        result[item.slug] = prev.value;
      } else {
        const value: UniversalModifiers = {
          ...DEFAULT_UNIVERSAL_MODIFIERS,
          ...(item.manifest.modifiers || {}),
          ...(customRef || {}),
        };
        nextCache[item.slug] = { customRef, value };
        result[item.slug] = value;
      }
    }
    resolvedModifiersCacheRef.current = nextCache;
    return result;
  }, [emojis, modifiersBySlug]);

  // Export & Save status
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [lastExport, setLastExport] = useState<ExportResult | null>(null);
  const [lastSavedPath, setLastSavedPath] = useState<string | null>(null);
  const [appError, setAppError] = useState<string | null>(null);
  const [isLlmModalOpen, setIsLlmModalOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [rasterImgElement, setRasterImgElement] = useState<HTMLImageElement | null>(null);

  const currentEmoji: LoadedEmoji | undefined = useMemo(
    () => emojis.find((e) => e.slug === selectedSlug) || emojis[0],
    [emojis, selectedSlug]
  );

  useEffect(() => {
    if (!currentEmoji?.rasterUrl) {
      setRasterImgElement(null);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!cancelled) {
        setRasterImgElement(img);
      }
    };
    img.src = currentEmoji.rasterUrl;
    return () => {
      cancelled = true;
    };
  }, [currentEmoji?.rasterUrl]);

  const activeParams: ParamValues = useMemo(() => {
    if (!currentEmoji) return {};
    return resolvedParamsBySlug[currentEmoji.slug] || currentEmoji.manifest.defaultParams;
  }, [currentEmoji, resolvedParamsBySlug]);

  const activeModifiers: UniversalModifiers = useMemo(() => {
    if (!currentEmoji) return DEFAULT_UNIVERSAL_MODIFIERS;
    return resolvedModifiersBySlug[currentEmoji.slug] || DEFAULT_UNIVERSAL_MODIFIERS;
  }, [currentEmoji, resolvedModifiersBySlug]);

  useEffect(() => {
    playbackClock.setTiming(activeModifiers.duration, activeModifiers.speed);
  }, [playbackClock, activeModifiers.duration, activeModifiers.speed]);

  const handleSelectEmoji = React.useCallback((slug: string) => {
    setSelectedSlug(slug);
    setLastExport(null);
  }, []);

  const handleTogglePlay = React.useCallback(() => {
    setPlaying((wasPlaying) => {
      if (wasPlaying) {
        setScrubT(playbackClock.getT());
        return false;
      }
      return true;
    });
  }, [playbackClock]);

  const handleScrub = React.useCallback(
    (nextT: number) => {
      playbackClock.setT(nextT);
      setPlaying(false);
      setScrubT(nextT);
    },
    [playbackClock]
  );

  const filteredEmojis = useMemo(() => {
    return emojis.filter((item) => {
      const q = searchQuery.toLowerCase().replace(/:/g, '').trim();
      const matchesSearch =
        !q ||
        item.manifest.name.toLowerCase().includes(q) ||
        item.manifest.shortcode.toLowerCase().includes(q) ||
        item.manifest.tags.some((t) => t.toLowerCase().includes(q));
      if (!matchesSearch) return false;

      const isAnim =
        item.manifest.animated ||
        (item.manifest.modifiers?.motion && item.manifest.modifiers.motion !== 'none');
      if (filterMode === 'animated') return Boolean(isAnim);
      if (filterMode === 'static') return !isAnim;
      return true;
    });
  }, [emojis, searchQuery, filterMode]);

  if (!currentEmoji) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200 flex items-center justify-center p-8">
        No emojis found in <code className="mx-1 text-indigo-600 dark:text-indigo-400">emojis/</code> directory.
      </div>
    );
  }

  const handleParamChange = (key: string, value: any) => {
    setCustomParamsBySlug((prev) => ({
      ...prev,
      [currentEmoji.slug]: {
        ...(prev[currentEmoji.slug] || {}),
        [key]: value,
      },
    }));
  };

  const handleResetParams = () => {
    setCustomParamsBySlug((prev) => {
      const next = { ...prev };
      delete next[currentEmoji.slug];
      return next;
    });
  };

  const handleModifierChange = <K extends keyof UniversalModifiers>(
    key: K,
    value: UniversalModifiers[K]
  ) => {
    setModifiersBySlug((prev) => ({
      ...prev,
      [currentEmoji.slug]: {
        ...activeModifiers,
        [key]: value,
      },
    }));
  };

  const handleResetModifiers = () => {
    setModifiersBySlug((prev) => {
      const next = { ...prev };
      delete next[currentEmoji.slug];
      return next;
    });
  };

  const handleSaveToDisk = async () => {
    setIsSaving(true);
    try {
      const updatedManifest = {
        ...currentEmoji.manifest,
        defaultParams: activeParams,
        modifiers: activeModifiers,
      };
      await apiPost('/api/emojis/save', {
        slug: currentEmoji.slug,
        manifest: updatedManifest,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDuplicateVariant = async (newSlug: string, newName: string): Promise<string> => {
    setIsSaving(true);
    try {
      const updatedManifest = {
        ...currentEmoji.manifest,
        id: newSlug,
        name: newName,
        shortcode: newSlug,
        defaultParams: activeParams,
        modifiers: activeModifiers,
      };
      const data = await apiPost<{ slug: string }>('/api/emojis/duplicate', {
        sourceSlug: currentEmoji.slug,
        newSlug,
        manifest: updatedManifest,
      });
      setSelectedSlug(data.slug);
      setLastExport(null);
      return data.slug;
    } finally {
      setIsSaving(false);
    }
  };

  const triggerDownloadAndDiskSave = async (
    result: ExportResult,
    ext: 'gif' | 'png'
  ) => {
    setLastExport(result);
    setLastSavedPath(null);
    const filename = `${currentEmoji.manifest.shortcode}.${ext}`;

    // 1. Trigger browser file download
    const a = document.createElement('a');
    a.href = result.dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // 2. Also save to emojis/<slug>/exports/<filename> on disk via Vite plugin
    if (!API_AVAILABLE) return;
    try {
      const data = await apiPost<{ path: string }>('/api/emojis/export', {
        slug: currentEmoji.slug,
        filename,
        dataUrl: result.dataUrl,
      });
      setLastSavedPath(data.path);
    } catch (err: any) {
      setAppError(`Downloaded ${filename}, but saving a copy to emojis/${currentEmoji.slug}/exports/ failed: ${err?.message || err}`);
    }
  };

  const handleExportGif = async () => {
    setIsExporting(true);
    try {
      const result = await exportEmojiToGif(
        currentEmoji,
        activeParams,
        activeModifiers,
        rasterImgElement
      );
      await triggerDownloadAndDiskSave(result, 'gif');
    } catch (err: any) {
      setAppError(`GIF export failed: ${err?.message || err}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPng = async () => {
    setIsExporting(true);
    try {
      const tToCapture = playing ? playbackClock.getT() : scrubT;
      const result = await exportEmojiToPng(
        currentEmoji,
        activeParams,
        activeModifiers,
        tToCapture,
        rasterImgElement
      );
      await triggerDownloadAndDiskSave(result, 'png');
    } catch (err: any) {
      setAppError(`PNG export failed: ${err?.message || err}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleRasterUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAppError(null);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const dataUrl = String(reader.result || '');
        const baseName = file.name.replace(/\.[^.]+$/, '');
        const ext = file.name.split('.').pop() || 'png';
        const data = await apiPost<{ slug: string }>('/api/emojis/import-raster', {
          name: baseName,
          slug: baseName,
          ext,
          dataUrl,
        });
        setSelectedSlug(data.slug);
        setLastExport(null);
      } catch (err: any) {
        setAppError(`Image import failed: ${err?.message || err}`);
      }
    };
    reader.onerror = () => setAppError('Image import failed: could not read the file');
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const canvasBgClass =
    canvasBg === 'checker-dark'
      ? 'bg-checkerboard-dark'
      : canvasBg === 'checker-light'
      ? 'bg-checkerboard-light'
      : canvasBg === 'slack-dark'
      ? 'bg-[#1A1D21]'
      : 'bg-white';

  // Static artwork with no motion wrapper: a GIF would just repeat one frame
  const isStaticEmoji = !currentEmoji.manifest.animated && activeModifiers.motion === 'none';

  const totalFrames = computeGifTiming(
    getEffectiveDurationSeconds(
      activeModifiers.duration,
      activeModifiers.speed
    ),
    activeModifiers.fps,
    36
  ).frames;

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 transition-colors duration-200">
      {/* Top App Header */}
      <header className="h-14 shrink-0 border-b border-zinc-200 dark:border-zinc-800/80 bg-white/85 dark:bg-zinc-900/80 backdrop-blur px-4 flex items-center justify-between transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-extrabold text-sm tracking-tight text-zinc-900 dark:text-white">
                EmojiGen Studio
              </h1>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/10 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 border border-indigo-500/25 dark:border-indigo-500/30">
                Slack 128×128 Ready
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Local LLM Parametric Emoji Engine & Interactive Inspector
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={toggleTheme}
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
            aria-label={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
            className="px-3 py-1.5 rounded-xl bg-zinc-100 hover:bg-zinc-200/80 dark:bg-zinc-800/90 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/80 text-xs font-medium text-zinc-700 dark:text-zinc-200 flex items-center gap-1.5 transition cursor-pointer"
          >
            {theme === 'dark' ? (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-400" />
                <span>Light</span>
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5 text-indigo-600" />
                <span>Dark</span>
              </>
            )}
          </button>

          {API_AVAILABLE && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/gif,image/webp,image/svg+xml,image/jpeg"
                onChange={handleRasterUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 rounded-xl bg-zinc-100 hover:bg-zinc-200/80 dark:bg-zinc-800/90 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/80 text-xs font-medium text-zinc-700 dark:text-zinc-200 flex items-center gap-1.5 transition cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                Import Image
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => setIsLlmModalOpen(true)}
            className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white flex items-center gap-1.5 shadow-lg shadow-indigo-600/25 transition cursor-pointer"
          >
            <Terminal className="w-3.5 h-3.5" />
            Prompt Local LLM
          </button>
        </div>
      </header>

      {appError && (
        <div className="shrink-0 bg-red-500/10 border-b border-red-500/30 px-4 py-2 flex items-center justify-between gap-3 text-xs text-red-600 dark:text-red-400">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{appError}</span>
          </div>
          <button
            type="button"
            onClick={() => setAppError(null)}
            aria-label="Dismiss error"
            className="p-1 rounded-lg hover:bg-red-500/15 transition cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main 3-Column Studio Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT SIDEBAR: EMOJI GALLERY */}
        <aside className="w-72 shrink-0 bg-white/80 dark:bg-zinc-900/70 border-r border-zinc-200 dark:border-zinc-800/80 flex flex-col h-full transition-colors">
          <div className="p-3 space-y-2.5 border-b border-zinc-200 dark:border-zinc-800/80">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search :shortcode: or tag..."
                aria-label="Search emojis"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-zinc-100/80 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            <div className="grid grid-cols-3 gap-1 p-1 bg-zinc-100 dark:bg-zinc-950 rounded-lg border border-zinc-200 dark:border-zinc-800 text-[11px]">
              {(['all', 'animated', 'static'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setFilterMode(mode)}
                  aria-pressed={filterMode === mode}
                  className={`py-1 rounded-md capitalize font-medium transition cursor-pointer ${
                    filterMode === mode
                      ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs'
                      : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          {/* Emoji List */}
          <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
            {filteredEmojis.map((item) => (
              <SidebarEmojiItem
                key={item.slug}
                emoji={item}
                isSelected={item.slug === currentEmoji.slug}
                params={resolvedParamsBySlug[item.slug] || item.manifest.defaultParams}
                modifiers={resolvedModifiersBySlug[item.slug] || DEFAULT_UNIVERSAL_MODIFIERS}
                onSelect={handleSelectEmoji}
              />
            ))}
          </div>

          {/* Sidebar Footer */}
          <div className="p-3 border-t border-zinc-200 dark:border-zinc-800/80 bg-zinc-100/60 dark:bg-zinc-950/50 text-[11px] text-zinc-500 dark:text-zinc-400 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <FolderCode className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
              <code>emojis/*</code> auto-watched
            </span>
            <span className="font-mono text-zinc-500">{emojis.length} total</span>
          </div>
        </aside>

        {/* CENTER WORKSPACE: STUDIO STAGE + SLACK CONTEXT SIMULATOR */}
        <main className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Emoji Info Header Card */}
          <div className="flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-zinc-900/70 border border-zinc-200 dark:border-zinc-800/80 rounded-2xl p-4 shadow-2xs dark:shadow-none transition-colors">
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-lg font-extrabold text-zinc-900 dark:text-white">
                  {currentEmoji.manifest.name}
                </h2>
                <span className="text-xs font-mono px-2.5 py-0.5 rounded-lg bg-indigo-500/10 dark:bg-indigo-500/15 border border-indigo-500/25 dark:border-indigo-500/30 text-indigo-600 dark:text-indigo-300">
                  :{currentEmoji.manifest.shortcode}:
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                {currentEmoji.manifest.description}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-950 px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800">
                emojis/{currentEmoji.slug}/
              </span>
              <button
                type="button"
                onClick={isStaticEmoji ? handleExportPng : handleExportGif}
                disabled={isExporting}
                className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-indigo-600/20 transition cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                {isExporting ? 'Encoding...' : isStaticEmoji ? 'Quick Export PNG' : 'Quick Export GIF'}
              </button>
            </div>
          </div>

          {/* Interactive Canvas Stage */}
          <div className="bg-white dark:bg-zinc-900/70 border border-zinc-200 dark:border-zinc-800/80 rounded-2xl p-5 flex flex-col items-center shadow-2xs dark:shadow-none transition-colors">
            {/* Stage Toolbar */}
            <div className="w-full flex flex-wrap items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-950 p-1 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs">
                {(
                  [
                    { id: 'checker-dark', label: 'Dark Grid' },
                    { id: 'checker-light', label: 'Light Grid' },
                    { id: 'slack-dark', label: 'Slack Dark' },
                    { id: 'slack-light', label: 'Slack Light' },
                  ] as const
                ).map((bg) => (
                  <button
                    key={bg.id}
                    type="button"
                    onClick={() => setCanvasBg(bg.id)}
                    aria-pressed={canvasBg === bg.id}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition cursor-pointer ${
                      canvasBg === bg.id
                        ? 'bg-indigo-600 text-white'
                        : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                    }`}
                  >
                    {bg.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setShowGuides((g) => !g)}
                aria-pressed={showGuides}
                className={`px-3 py-1.5 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition cursor-pointer ${
                  showGuides
                    ? 'bg-indigo-600/15 dark:bg-indigo-600/20 border-indigo-500 text-indigo-600 dark:text-indigo-300'
                    : 'bg-zinc-100 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                <Grid className="w-3.5 h-3.5" />
                128×128 Safe Zone
              </button>
            </div>

            {/* Main 240x240 Stage Preview + Actual 128x128 Side-by-Side */}
            <div className="flex flex-wrap items-center justify-center gap-8 my-2">
              <div className="flex flex-col items-center gap-2">
                <div
                  className={`relative w-60 h-60 rounded-2xl border-2 border-zinc-300 dark:border-zinc-700/80 shadow-xl dark:shadow-2xl flex items-center justify-center overflow-hidden ${canvasBgClass}`}
                >
                  <EmojiCanvas
                    emoji={currentEmoji}
                    params={activeParams}
                    modifiers={activeModifiers}
                    size={240}
                    playing={playing}
                    scrubT={scrubT}
                    clock={playbackClock}
                  />

                  {showGuides && (
                    <div className="absolute inset-0 pointer-events-none">
                      <div className="w-full h-full border border-dashed border-indigo-400/50" />
                      <div className="absolute inset-3 border border-indigo-400/40 rounded-lg" />
                      <div className="absolute left-1/2 top-0 bottom-0 w-px bg-indigo-400/30" />
                      <div className="absolute top-1/2 left-0 right-0 h-px bg-indigo-400/30" />
                    </div>
                  )}
                </div>
                <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
                  Studio Canvas (240px Zoom)
                </span>
              </div>

              {/* Actual 128x128 Export Resolution Preview */}
              <div className="flex flex-col items-center gap-2">
                <div
                  className={`w-32 h-32 rounded-xl border border-zinc-300 dark:border-zinc-700/80 shadow-md dark:shadow-lg flex items-center justify-center overflow-hidden ${canvasBgClass}`}
                >
                  <EmojiCanvas
                    emoji={currentEmoji}
                    params={activeParams}
                    modifiers={activeModifiers}
                    size={128}
                    playing={playing}
                    scrubT={scrubT}
                    clock={playbackClock}
                  />
                </div>
                <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
                  Actual Slack Export (128×128)
                </span>
              </div>
            </div>

            {/* Timeline Scrubber Bar */}
            <TimelineScrubber
              clock={playbackClock}
              playing={playing}
              scrubT={scrubT}
              totalFrames={totalFrames}
              onTogglePlay={handleTogglePlay}
              onScrub={handleScrub}
            />
          </div>

          {/* Live Slack Context Simulator */}
          <SlackPreview
            emoji={currentEmoji}
            params={activeParams}
            modifiers={activeModifiers}
            playing={playing}
            scrubT={scrubT}
            clock={playbackClock}
            rasterImage={rasterImgElement}
          />
        </main>

        {/* RIGHT INSPECTOR PANEL */}
        <InspectorPanel
          emoji={currentEmoji}
          params={activeParams}
          modifiers={activeModifiers}
          onChangeParam={handleParamChange}
          onResetParams={handleResetParams}
          onChangeModifier={handleModifierChange}
          onResetModifiers={handleResetModifiers}
          onSaveToDisk={handleSaveToDisk}
          onDuplicateVariant={handleDuplicateVariant}
          onExportGif={handleExportGif}
          onExportPng={handleExportPng}
          isSaving={isSaving}
          isExporting={isExporting}
          lastExport={lastExport}
          lastSavedPath={lastSavedPath}
        />
      </div>

      {/* Local LLM Prompt Assistant Modal */}
      <LlmPromptModal
        isOpen={isLlmModalOpen}
        onClose={() => setIsLlmModalOpen(false)}
        currentEmoji={currentEmoji}
      />
    </div>
  );
};

export default App;
