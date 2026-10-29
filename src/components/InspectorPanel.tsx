import React, { useId, useState } from 'react';
import {
  Sliders,
  Wand2,
  Download,
  RotateCcw,
  Save,
  CopyPlus,
  CheckCircle2,
  AlertTriangle,
  FlipHorizontal,
  FlipVertical,
  Sparkles,
  FileCheck,
  Loader2,
  Undo2,
  Redo2,
} from 'lucide-react';
import {
  type LoadedEmoji,
  type ParamDefinition,
  type ParamValues,
  type UniversalModifiers,
  type UniversalMotionType,
} from '../types/emoji';
import type { ExportResult } from '../lib/exporter';
import { API_AVAILABLE } from '../lib/api';
import { slugify } from '../lib/slug';
import { savedModifiers } from '../lib/edits';

interface InspectorPanelProps {
  emoji: LoadedEmoji;
  params: ParamValues;
  modifiers: UniversalModifiers;
  onChangeParam: (key: string, value: any) => void;
  onResetParam: (key: string) => void;
  onResetParams: () => void;
  onChangeModifier: <K extends keyof UniversalModifiers>(
    key: K,
    value: UniversalModifiers[K]
  ) => void;
  onResetModifier: (key: keyof UniversalModifiers) => void;
  onResetModifiers: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onSaveToDisk: () => Promise<void>;
  onDuplicateVariant: (newSlug: string, newName: string) => Promise<string>;
  onExportGif: () => Promise<void>;
  onExportPng: () => Promise<void>;
  isSaving: boolean;
  isExporting: boolean;
  lastExport: ExportResult | null;
  lastSavedPath: string | null;
}

const MOTION_PRESETS: Array<{ id: UniversalMotionType; label: string; badge: string }> = [
  { id: 'none', label: 'None', badge: 'Default' },
  { id: 'shake', label: 'Intensifies', badge: 'Shake' },
  { id: 'party', label: 'Party Mode', badge: 'Rainbow' },
  { id: 'bounce', label: 'Bounce', badge: 'Jump' },
  { id: 'spin', label: 'Spin', badge: '360°' },
  { id: 'pulse', label: 'Pulse', badge: 'Beat' },
  { id: 'wobble', label: 'Wobble', badge: 'Jelly' },
  { id: 'glitch', label: 'Glitch', badge: 'Cyber' },
];

const QUICK_BADGES = ['', 'LGTM', 'SHIP IT', 'WIP', 'HOTFIX', 'PR', 'YES', 'NOPE', 'RIP'];

// Rendered only when a reset handler is given, i.e. the setting differs from its default
const ResetButton: React.FC<{ label: string; onReset?: () => void }> = ({ label, onReset }) =>
  onReset ? (
    <button
      type="button"
      onClick={onReset}
      title={`Reset ${label} to default`}
      aria-label={`Reset ${label} to default`}
      className="p-0.5 rounded text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer shrink-0"
    >
      <RotateCcw className="w-3 h-3" />
    </button>
  ) : null;

interface FxSliderProps {
  label: string;
  display: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  onReset?: () => void;
}

const FxSlider: React.FC<FxSliderProps> = ({ label, display, min, max, step, value, onChange, onReset }) => {
  const id = useId();
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <label htmlFor={id} className="text-zinc-600 dark:text-zinc-400">{label}</label>
        <span className="flex items-center gap-1">
          <span className="font-mono text-indigo-600 dark:text-indigo-400">{display}</span>
          <ResetButton label={label} onReset={onReset} />
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-indigo-500 cursor-pointer"
      />
    </div>
  );
};

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  emoji,
  params,
  modifiers,
  onChangeParam,
  onResetParam,
  onResetParams,
  onChangeModifier,
  onResetModifier,
  onResetModifiers,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onSaveToDisk,
  onDuplicateVariant,
  onExportGif,
  onExportPng,
  isSaving,
  isExporting,
  lastExport,
  lastSavedPath,
}) => {
  const [activeTab, setActiveTab] = useState<'params' | 'fx' | 'export'>('params');
  const [variantName, setVariantName] = useState('');
  const [showVariantForm, setShowVariantForm] = useState(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const idPrefix = useId();
  const schemaEntries = Object.entries(emoji.manifest.paramsSchema || {});
  // Static artwork with no motion wrapper: a GIF would just repeat one frame
  const isStatic = !emoji.manifest.animated && modifiers.motion === 'none';

  // Reset handlers, defined only for settings that differ from the saved emoji.json
  const savedMods = savedModifiers(emoji);
  const paramReset = (key: string) =>
    params[key] !== emoji.manifest.defaultParams[key] ? () => onResetParam(key) : undefined;
  const modReset = (key: keyof UniversalModifiers) =>
    modifiers[key] !== savedMods[key] ? () => onResetModifier(key) : undefined;

  const handleSave = async () => {
    setSaveError(null);
    try {
      await onSaveToDisk();
      setSaveToast('Saved to emoji.json!');
      setTimeout(() => setSaveToast(null), 2500);
    } catch (err: any) {
      setSaveError(err?.message || 'Failed to save emoji.json');
    }
  };

  const handleCreateVariant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!variantName.trim()) return;
    const slug = slugify(variantName);
    if (!slug) {
      setSaveError('Please enter a valid variant name.');
      return;
    }
    setSaveError(null);
    try {
      const createdSlug = await onDuplicateVariant(slug, variantName.trim());
      setVariantName('');
      setShowVariantForm(false);
      setSaveToast(`Created emojis/${createdSlug}/`);
      setTimeout(() => setSaveToast(null), 3000);
    } catch (err: any) {
      setSaveError(err?.message || 'Failed to create variant');
    }
  };

  const renderParamInput = (key: string, def: ParamDefinition) => {
    const val = params[key] ?? emoji.manifest.defaultParams[key];
    const inputId = `${idPrefix}-param-${key}`;

    switch (def.type) {
      case 'color':
        return (
          <div className="flex items-center justify-between gap-2">
            <label htmlFor={inputId} className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{def.label}</label>
            <div className="flex items-center gap-2">
              <input
                id={inputId}
                type="color"
                value={String(val || '#ffffff')}
                onChange={(e) => onChangeParam(key, e.target.value)}
                className="w-7 h-7 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 cursor-pointer"
              />
              <input
                type="text"
                aria-label={`${def.label} hex value`}
                value={String(val || '#ffffff')}
                onChange={(e) => onChangeParam(key, e.target.value)}
                className="w-20 px-2 py-1 text-xs font-mono rounded-lg bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200"
              />
            </div>
          </div>
        );

      case 'number':
        return (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor={inputId} className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{def.label}</label>
              <span className="text-xs font-mono text-indigo-600 dark:text-indigo-400">
                {typeof val === 'number' ? Number(val.toFixed(2)) : val}
              </span>
            </div>
            <input
              id={inputId}
              type="range"
              min={def.min ?? 0}
              max={def.max ?? 100}
              step={def.step ?? 1}
              value={Number(val ?? 0)}
              onChange={(e) => onChangeParam(key, parseFloat(e.target.value))}
              className="w-full accent-indigo-500 cursor-pointer"
            />
          </div>
        );

      case 'boolean':
        return (
          <div className="flex items-center justify-between">
            <span id={`${inputId}-label`} className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{def.label}</span>
            <button
              type="button"
              role="switch"
              aria-checked={Boolean(val)}
              aria-labelledby={`${inputId}-label`}
              onClick={() => onChangeParam(key, !val)}
              className={`w-10 h-5.5 rounded-full transition relative cursor-pointer ${
                val ? 'bg-indigo-600' : 'bg-zinc-300 dark:bg-zinc-800'
              }`}
            >
              <span
                className={`block w-4 h-4 rounded-full bg-white transition-transform absolute top-0.5 ${
                  val ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        );

      case 'select':
        return (
          <div>
            <label htmlFor={inputId} className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              {def.label}
            </label>
            <select
              id={inputId}
              value={String(val ?? '')}
              onChange={(e) => onChangeParam(key, e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-800 dark:text-zinc-200 focus:outline-none focus:border-indigo-500"
            >
              {(def.options || []).map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        );

      case 'text':
      default:
        return (
          <div>
            <label htmlFor={inputId} className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              {def.label}
            </label>
            <input
              id={inputId}
              type="text"
              value={String(val ?? '')}
              onChange={(e) => onChangeParam(key, e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-800 dark:text-zinc-200 focus:outline-none focus:border-indigo-500"
            />
          </div>
        );
    }
  };

  const sizeKb = lastExport ? (lastExport.sizeBytes / 1024).toFixed(1) : null;
  const isUnderSlackLimit = lastExport ? lastExport.sizeBytes <= 128 * 1024 : true;

  return (
    <aside className="w-full lg:w-96 shrink-0 bg-white/90 dark:bg-zinc-900/90 border-l border-zinc-200 dark:border-zinc-800/80 flex flex-col h-full overflow-hidden transition-colors">
      {/* Top Tabs */}
      <div className="p-3 border-b border-zinc-200 dark:border-zinc-800">
        <div className="grid grid-cols-3 gap-1 p-1 bg-zinc-100 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800/90">
          <button
            type="button"
            onClick={() => setActiveTab('params')}
            aria-pressed={activeTab === 'params'}
            className={`py-2 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
              activeTab === 'params'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            Controls
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('fx')}
            aria-pressed={activeTab === 'fx'}
            className={`py-2 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
              activeTab === 'fx'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            <Wand2 className="w-3.5 h-3.5" />
            Studio FX
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('export')}
            aria-pressed={activeTab === 'export'}
            className={`py-2 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
              activeTab === 'export'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            Export
          </button>
        </div>
      </div>

      {/* Scrollable Inspector Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* TAB 1: EMOJI SPECIFIC PARAMETERS */}
        {activeTab === 'params' && (
          <>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                  Emoji Parameters
                </h3>
                <p className="text-[11px] text-zinc-500">
                  Custom controls exposed by :{emoji.manifest.shortcode}:
                </p>
              </div>
              <button
                type="button"
                onClick={onResetParams}
                className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                Reset
              </button>
            </div>

            {schemaEntries.length === 0 ? (
              <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-600 dark:text-zinc-400">
                This emoji has no custom schema parameters. Switch to the{' '}
                <strong className="text-indigo-600 dark:text-indigo-400">Studio FX</strong> tab to apply motion, text badges, and color grading!
              </div>
            ) : (
              <div className="space-y-4 bg-zinc-50/80 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-800/80 rounded-xl p-3.5">
                {schemaEntries.map(([key, def]) => (
                  <div key={key} className="pb-3 last:pb-0 border-b last:border-b-0 border-zinc-200/80 dark:border-zinc-800/60">
                    <div className="flex items-center gap-1.5">
                      <div className="flex-1 min-w-0">{renderParamInput(key, def)}</div>
                      <ResetButton label={def.label} onReset={paramReset(key)} />
                    </div>
                    {def.description && (
                      <p className="text-[10px] text-zinc-500 mt-1">{def.description}</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Quick Badge Shortcut right inside Controls tab too */}
            <div className="bg-zinc-50/80 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-800/80 rounded-xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <label htmlFor={`${idPrefix}-badge`} className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Slack Badge Text Overlay
                </label>
                {modifiers.badgeText && (
                  <button
                    type="button"
                    onClick={() => onChangeModifier('badgeText', '')}
                    className="text-[10px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>
              <input
                type="text"
                id={`${idPrefix}-badge`}
                placeholder="Optional overlay text (e.g. LGTM, WIP, +1)"
                value={modifiers.badgeText}
                onChange={(e) => onChangeModifier('badgeText', e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500"
              />
              <div className="flex flex-wrap gap-1">
                {QUICK_BADGES.filter(Boolean).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    aria-pressed={modifiers.badgeText === preset}
                    onClick={() =>
                      onChangeModifier(
                        'badgeText',
                        modifiers.badgeText === preset ? '' : preset
                      )
                    }
                    className={`px-2 py-0.5 rounded text-[10px] font-bold border transition cursor-pointer ${
                      modifiers.badgeText === preset
                        ? 'bg-indigo-600 border-indigo-500 text-white'
                        : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* TAB 2: UNIVERSAL STUDIO FX */}
        {activeTab === 'fx' && (
          <>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                  Universal Studio FX
                </h3>
                <p className="text-[11px] text-zinc-500">
                  Works on any static, animated, or imported emoji
                </p>
              </div>
              <button
                type="button"
                onClick={onResetModifiers}
                className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                Reset FX
              </button>
            </div>

            {/* Motion Wrapper */}
            <div className="bg-zinc-50/80 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-800/80 rounded-xl p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Motion Wrapper Preset
                </h4>
                <ResetButton label="Motion Wrapper Preset" onReset={modReset('motion')} />
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {MOTION_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => onChangeModifier('motion', preset.id)}
                    aria-pressed={modifiers.motion === preset.id}
                    className={`px-2.5 py-2 rounded-lg border text-left transition flex items-center justify-between cursor-pointer ${
                      modifiers.motion === preset.id
                        ? 'bg-indigo-600/15 dark:bg-indigo-600/20 border-indigo-500 text-indigo-900 dark:text-white'
                        : 'bg-white dark:bg-zinc-900/70 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                    }`}
                  >
                    <span className="text-xs font-medium">{preset.label}</span>
                    <span className="text-[10px] font-mono opacity-60">
                      {preset.badge}
                    </span>
                  </button>
                ))}
              </div>

              {modifiers.motion !== 'none' && (
                <div className="pt-2">
                  <FxSlider
                    label="Motion Intensity"
                    display={`${modifiers.motionIntensity.toFixed(1)}x`}
                    min={0.2}
                    max={2.0}
                    step={0.1}
                    value={modifiers.motionIntensity}
                    onChange={(v) => onChangeModifier('motionIntensity', v)}
                    onReset={modReset('motionIntensity')}
                  />
                </div>
              )}
            </div>

            {/* Badge Overlay Styling */}
            <div className="bg-zinc-50/80 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-800/80 rounded-xl p-3.5 space-y-3">
              <label htmlFor={`${idPrefix}-badge-fx`} className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Badge Text & Styling
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  id={`${idPrefix}-badge-fx`}
                  type="text"
                  placeholder="Overlay text (e.g. LGTM, SHIP IT)"
                  value={modifiers.badgeText}
                  onChange={(e) => onChangeModifier('badgeText', e.target.value)}
                  className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-900 dark:text-zinc-100"
                />
                <ResetButton label="Badge Text" onReset={modReset('badgeText')} />
              </div>
              <div className="flex items-center gap-1.5">
                <div className="flex-1 grid grid-cols-3 gap-1.5">
                  {(['top', 'center', 'bottom'] as const).map((pos) => (
                    <button
                      key={pos}
                      type="button"
                      onClick={() => onChangeModifier('badgePosition', pos)}
                      aria-pressed={modifiers.badgePosition === pos}
                      className={`py-1 rounded-lg text-xs capitalize border cursor-pointer ${
                        modifiers.badgePosition === pos
                          ? 'bg-indigo-600/15 dark:bg-indigo-600/20 border-indigo-500 text-indigo-700 dark:text-indigo-300'
                          : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400'
                      }`}
                    >
                      {pos}
                    </button>
                  ))}
                </div>
                <ResetButton label="Badge Position" onReset={modReset('badgePosition')} />
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-600 dark:text-zinc-400">Text</span>
                  <input
                    type="color"
                    value={modifiers.badgeColor}
                    aria-label="Badge text color"
                    onChange={(e) => onChangeModifier('badgeColor', e.target.value)}
                    className="w-6 h-6 rounded border border-zinc-300 dark:border-zinc-700 cursor-pointer"
                  />
                  <ResetButton label="Badge Text Color" onReset={modReset('badgeColor')} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-600 dark:text-zinc-400">Pill/Stroke</span>
                  <input
                    type="color"
                    value={modifiers.badgeBgColor}
                    aria-label="Badge pill and stroke color"
                    onChange={(e) => onChangeModifier('badgeBgColor', e.target.value)}
                    className="w-6 h-6 rounded border border-zinc-300 dark:border-zinc-700 cursor-pointer"
                  />
                  <ResetButton label="Badge Pill/Stroke Color" onReset={modReset('badgeBgColor')} />
                </div>
                <div className="flex items-center gap-1">
                  <label className="flex items-center gap-1.5 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={modifiers.badgeShowPill}
                      onChange={(e) =>
                        onChangeModifier('badgeShowPill', e.target.checked)
                      }
                      className="accent-indigo-500"
                    />
                    Pill BG
                  </label>
                  <ResetButton label="Pill BG" onReset={modReset('badgeShowPill')} />
                </div>
              </div>
              <FxSlider
                label="Badge Size"
                display={`${Math.round(modifiers.badgeScale * 100)}%`}
                min={0.6}
                max={1.5}
                step={0.05}
                value={modifiers.badgeScale}
                onChange={(v) => onChangeModifier('badgeScale', v)}
                onReset={modReset('badgeScale')}
              />
            </div>

            {/* Timing & Spatial Transform */}
            <div className="bg-zinc-50/80 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-800/80 rounded-xl p-3.5 space-y-3">
              <h4 className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Timing & Transform
              </h4>

              <FxSlider
                label="Loop Length"
                display={`${modifiers.duration.toFixed(1)}s`}
                min={0.4}
                max={4.0}
                step={0.1}
                value={modifiers.duration}
                onChange={(v) => onChangeModifier('duration', v)}
                onReset={modReset('duration')}
              />

              <FxSlider
                label="Animation Speed"
                display={`${modifiers.speed.toFixed(2)}x`}
                min={0.25}
                max={3.0}
                step={0.05}
                value={modifiers.speed}
                onChange={(v) => onChangeModifier('speed', v)}
                onReset={modReset('speed')}
              />

              <FxSlider
                label="Frame Rate (FPS)"
                display={`${modifiers.fps} FPS`}
                min={8}
                max={30}
                step={2}
                value={modifiers.fps}
                onChange={(v) => onChangeModifier('fps', v)}
                onReset={modReset('fps')}
              />

              <FxSlider
                label="Zoom / Scale"
                display={`${Math.round(modifiers.scale * 100)}%`}
                min={0.5}
                max={1.4}
                step={0.05}
                value={modifiers.scale}
                onChange={(v) => onChangeModifier('scale', v)}
                onReset={modReset('scale')}
              />

              <FxSlider
                label="Rotation"
                display={`${modifiers.rotation}°`}
                min={-180}
                max={180}
                step={5}
                value={modifiers.rotation}
                onChange={(v) => onChangeModifier('rotation', v)}
                onReset={modReset('rotation')}
              />

              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onChangeModifier('flipX', !modifiers.flipX)}
                    aria-pressed={modifiers.flipX}
                    className={`flex-1 py-1.5 px-2.5 rounded-lg border text-xs flex items-center justify-center gap-1.5 cursor-pointer ${
                      modifiers.flipX
                        ? 'bg-indigo-600/15 dark:bg-indigo-600/20 border-indigo-500 text-indigo-700 dark:text-indigo-300'
                        : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400'
                    }`}
                  >
                    <FlipHorizontal className="w-3.5 h-3.5" />
                    Flip Horizontal
                  </button>
                  <ResetButton label="Flip Horizontal" onReset={modReset('flipX')} />
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onChangeModifier('flipY', !modifiers.flipY)}
                    aria-pressed={modifiers.flipY}
                    className={`flex-1 py-1.5 px-2.5 rounded-lg border text-xs flex items-center justify-center gap-1.5 cursor-pointer ${
                      modifiers.flipY
                        ? 'bg-indigo-600/15 dark:bg-indigo-600/20 border-indigo-500 text-indigo-700 dark:text-indigo-300'
                        : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400'
                    }`}
                  >
                    <FlipVertical className="w-3.5 h-3.5" />
                    Flip Vertical
                  </button>
                  <ResetButton label="Flip Vertical" onReset={modReset('flipY')} />
                </div>
              </div>
            </div>

            {/* Color Grading & Background */}
            <div className="bg-zinc-50/80 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-800/80 rounded-xl p-3.5 space-y-3">
              <h4 className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Color Shift & Background
              </h4>

              <FxSlider
                label="Hue Shift"
                display={`${modifiers.hueRotate}°`}
                min={-180}
                max={180}
                step={5}
                value={modifiers.hueRotate}
                onChange={(v) => onChangeModifier('hueRotate', v)}
                onReset={modReset('hueRotate')}
              />

              <FxSlider
                label="Saturation"
                display={`${modifiers.saturate}%`}
                min={0}
                max={220}
                step={5}
                value={modifiers.saturate}
                onChange={(v) => onChangeModifier('saturate', v)}
                onReset={modReset('saturate')}
              />

              <FxSlider
                label="Brightness"
                display={`${modifiers.brightness}%`}
                min={50}
                max={150}
                step={5}
                value={modifiers.brightness}
                onChange={(v) => onChangeModifier('brightness', v)}
                onReset={modReset('brightness')}
              />

              <FxSlider
                label="Contrast"
                display={`${modifiers.contrast}%`}
                min={50}
                max={150}
                step={5}
                value={modifiers.contrast}
                onChange={(v) => onChangeModifier('contrast', v)}
                onReset={modReset('contrast')}
              />

              <div className="flex items-center gap-1.5 pt-1">
                <label className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!modifiers.backgroundTransparent}
                    onChange={(e) =>
                      onChangeModifier('backgroundTransparent', !e.target.checked)
                    }
                    className="accent-indigo-500"
                  />
                  Solid Background Tile
                </label>
                <ResetButton label="Solid Background Tile" onReset={modReset('backgroundTransparent')} />
                {!modifiers.backgroundTransparent && (
                  <div className="flex items-center gap-1 ml-auto">
                    <input
                      type="color"
                      value={modifiers.backgroundColor}
                      aria-label="Background color"
                      onChange={(e) =>
                        onChangeModifier('backgroundColor', e.target.value)
                      }
                      className="w-6 h-6 rounded border border-zinc-300 dark:border-zinc-700 cursor-pointer"
                    />
                    <ResetButton label="Background Color" onReset={modReset('backgroundColor')} />
                  </div>
                )}
              </div>

              {!modifiers.backgroundTransparent && (
                <FxSlider
                  label="Corner Radius"
                  display={`${modifiers.backgroundRadius}px`}
                  min={0}
                  max={64}
                  step={2}
                  value={modifiers.backgroundRadius}
                  onChange={(v) => onChangeModifier('backgroundRadius', v)}
                  onReset={modReset('backgroundRadius')}
                />
              )}
            </div>
          </>
        )}

        {/* TAB 3: EXPORT & SAVE TO REPO */}
        {activeTab === 'export' && (
          <div className="space-y-4">
            {/* Save back to repo section */}
            {API_AVAILABLE && (
              <div className="bg-zinc-50/90 dark:bg-zinc-950/70 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                  Persist Tweaks to Repository
                </h3>
                <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  Save your customized parameter values and Studio FX directly to{' '}
                  <code className="text-indigo-600 dark:text-indigo-300">emojis/{emoji.slug}/emoji.json</code>{' '}
                  or spin off a new emoji variant.
                </p>

                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={handleSave}
                    className="w-full py-2 px-3 rounded-xl bg-zinc-200/80 hover:bg-zinc-300/80 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-100 text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    {isSaving ? 'Saving...' : `Save Defaults to emojis/${emoji.slug}`}
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowVariantForm((v) => !v)}
                    className="w-full py-2 px-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/80 hover:border-zinc-300 dark:hover:border-zinc-600 text-zinc-700 dark:text-zinc-300 text-xs font-medium flex items-center justify-center gap-2 transition cursor-pointer"
                  >
                    <CopyPlus className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                    Save as New Emoji Variant...
                  </button>
                </div>

                {showVariantForm && (
                  <form onSubmit={handleCreateVariant} className="pt-2 space-y-2 border-t border-zinc-200 dark:border-zinc-800">
                    <input
                      type="text"
                      placeholder="New emoji name (e.g. Party Rocket)"
                    aria-label="New variant name"
                      value={variantName}
                      onChange={(e) => setVariantName(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-xs text-zinc-900 dark:text-white"
                    />
                    <button
                      type="submit"
                      className="w-full py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold cursor-pointer"
                    >
                      Create Variant Folder
                    </button>
                  </form>
                )}
              </div>
            )}

            {/* Slack Export Section */}
            <div className="bg-zinc-50/90 dark:bg-zinc-950/70 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                  Slack 128×128 Export
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 border border-indigo-500/20">
                  Max 128 KB
                </span>
              </div>

              <div className="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  disabled={isExporting}
                  onClick={onExportGif}
                  className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/25 transition cursor-pointer disabled:opacity-50"
                >
                  {isExporting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Encoding 128×128 GIF...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Export Animated GIF (128×128)
                    </>
                  )}
                </button>

                <button
                  type="button"
                  disabled={isExporting}
                  onClick={onExportPng}
                  className="w-full py-2 px-4 rounded-xl bg-zinc-200/80 hover:bg-zinc-300/80 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-100 text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export Static PNG (Current Frame)
                </button>
              </div>

              {isStatic && (
                <p className="text-[11px] text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-2">
                  This emoji is static, so a GIF would repeat one frame. Use PNG, or pick a motion preset in Studio FX to animate it.
                </p>
              )}

              {/* Export Output Summary */}
              {lastExport && (
                <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-800 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-600 dark:text-zinc-400">Encoded File Size:</span>
                    <span
                      className={`text-xs font-mono font-bold flex items-center gap-1 ${
                        isUnderSlackLimit ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      {isUnderSlackLimit ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5" />
                      )}
                      {sizeKb} KB / 128 KB
                    </span>
                  </div>

                  {/* Size Progress Bar */}
                  <div className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        isUnderSlackLimit ? 'bg-emerald-500' : 'bg-amber-500'
                      }`}
                      style={{
                        width: `${Math.min(100, (lastExport.sizeBytes / (128 * 1024)) * 100)}%`,
                      }}
                    />
                  </div>

                  {lastExport.optimizedNote && (
                    <p className="text-[11px] text-amber-800 dark:text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2">
                      {lastExport.optimizedNote}
                    </p>
                  )}

                  <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                    <img
                      src={lastExport.dataUrl}
                      alt="Exported preview"
                      className="w-14 h-14 rounded-lg bg-checkerboard-light dark:bg-checkerboard-dark border border-zinc-200 dark:border-zinc-700 shrink-0"
                    />
                    <div className="min-w-0 flex-1 text-[11px] text-zinc-600 dark:text-zinc-400 space-y-0.5">
                      <div className="font-semibold text-zinc-900 dark:text-zinc-200 flex items-center gap-1">
                        {isUnderSlackLimit ? (
                          <>
                            <FileCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            Ready for Slack Upload
                          </>
                        ) : (
                          <>
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                            Exceeds 128 KB Slack Limit
                          </>
                        )}
                      </div>
                      <div>
                        {lastExport.width}×{lastExport.height}px •{' '}
                        {lastExport.frameCount === 1
                          ? 'Static PNG'
                          : `${lastExport.frameCount} frames @ ${lastExport.fps} FPS`}
                      </div>
                      {lastSavedPath && (
                        <div className="font-mono text-[10px] text-indigo-600 dark:text-indigo-300 truncate" title={lastSavedPath}>
                          Saved: emojis/{emoji.slug}/exports/
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Save status, visible from every tab (the bottom-bar Save works from any tab) */}
      {(saveToast || saveError) && (
        <div className="px-3 pt-2 border-t border-zinc-200 dark:border-zinc-800">
          {saveToast && (
            <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              {saveToast}
            </div>
          )}
          {saveError && (
            <div className="flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400 font-medium">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{saveError}</span>
            </div>
          )}
        </div>
      )}

      {/* Persistent Bottom Quick-Action Bar */}
      <div className="p-3 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/90 dark:bg-zinc-950/90 flex items-center gap-2">
        {(
          [
            { label: 'Undo (Ctrl+Z)', Icon: Undo2, onClick: onUndo, enabled: canUndo },
            { label: 'Redo (Ctrl+Shift+Z)', Icon: Redo2, onClick: onRedo, enabled: canRedo },
          ] as const
        ).map(({ label, Icon, onClick, enabled }) => (
          <button
            key={label}
            type="button"
            onClick={onClick}
            disabled={!enabled}
            title={label}
            aria-label={label}
            className="p-2 rounded-xl bg-zinc-200/80 hover:bg-zinc-300/80 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Icon className="w-3.5 h-3.5" />
          </button>
        ))}
        {API_AVAILABLE && (
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            title="Save current parameter & FX tweaks to emoji.json"
            className="px-3 py-2 rounded-xl bg-zinc-200/80 hover:bg-zinc-300/80 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
          >
            <Save className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            Save
          </button>
        )}
        <button
          type="button"
          onClick={isStatic ? onExportPng : onExportGif}
          disabled={isExporting}
          className="flex-1 py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-lg shadow-indigo-600/20 transition cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          {isExporting ? 'Exporting...' : isStatic ? 'Export PNG' : 'Export GIF'}
        </button>
        <button
          type="button"
          onClick={isStatic ? onExportGif : onExportPng}
          disabled={isExporting}
          className="px-3 py-2 rounded-xl bg-zinc-200/80 hover:bg-zinc-300/80 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-semibold transition cursor-pointer"
        >
          {isStatic ? 'GIF' : 'PNG'}
        </button>
      </div>
    </aside>
  );
};
