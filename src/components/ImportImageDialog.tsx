import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ImagePlus, Loader2, TriangleAlert, X } from 'lucide-react';
import type { LoadedEmoji, ParamValues, UniversalModifiers } from '../types/emoji';
import { evictRasterImage, loadRasterImage, type RasterImage } from '../lib/renderer';
import { apiPost } from '../lib/api';
import { EmojiCanvas } from './EmojiCanvas';

interface ImportImageDialogProps {
  file: File;
  onClose: () => void;
  onImported: (slug: string) => void;
}

const DOWNSCALE_SIZE = 512;
// The dev-server body limit is 10 MB and base64 adds about a third
const MAX_UPLOAD_BYTES = 7 * 1024 * 1024;
const LARGE_ANIMATED_BYTES = 1024 * 1024;
const SLACK_MAX_FRAMES = 36;

const formatMb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

function readDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('could not read the file'));
    reader.readAsDataURL(blob);
  });
}

/** True when all four corners are opaque and roughly the same colour, i.e. a solid background. */
function hasSolidBackground(raster: RasterImage): boolean {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;
  ctx.drawImage(raster.frames[0], 0, 0, size, size);
  const corners = [
    [0, 0],
    [size - 1, 0],
    [0, size - 1],
    [size - 1, size - 1],
  ].map(([x, y]) => ctx.getImageData(x, y, 1, 1).data);
  if (corners.some((c) => c[3] < 250)) return false;
  return corners.every((c) =>
    [0, 1, 2].every((i) => Math.abs(c[i] - corners[0][i]) <= 24)
  );
}

function downscaleToPng(raster: RasterImage): string {
  const scale = DOWNSCALE_SIZE / Math.max(raster.width, raster.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(raster.width * scale);
  canvas.height = Math.round(raster.height * scale);
  canvas.getContext('2d')!.drawImage(raster.frames[0], 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

export const ImportImageDialog: React.FC<ImportImageDialogProps> = ({
  file,
  onClose,
  onImported,
}) => {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const titleId = useId();
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [raster, setRaster] = useState<RasterImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState(() => file.name.replace(/\.[^.]+$/, ''));
  const [autoCrop, setAutoCrop] = useState(true);
  const [removeBg, setRemoveBg] = useState(false);
  const [bgTolerance, setBgTolerance] = useState(15);
  const [borderWidth, setBorderWidth] = useState(0);
  const [borderColor, setBorderColor] = useState('#ffffff');
  const [downscale, setDownscale] = useState(true);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  // Created inside the effect so StrictMode's mount/unmount/mount never reuses a revoked URL
  useEffect(() => {
    let cancelled = false;
    const url = URL.createObjectURL(file);
    loadRasterImage(url).then(
      (decoded) => {
        if (cancelled) return;
        setObjectUrl(url);
        setRaster(decoded);
        setRemoveBg(hasSolidBackground(decoded));
      },
      () => !cancelled && setError('Could not read this image.')
    );
    return () => {
      cancelled = true;
      evictRasterImage(url);
      URL.revokeObjectURL(url);
    };
  }, [file]);

  const frameCount = raster?.frames.length ?? 1;
  const animated = frameCount > 1;
  const durationSec = raster ? raster.ends[raster.ends.length - 1] / 1000 : 1;
  const isSvg = file.type === 'image/svg+xml';
  const canDownscale =
    !!raster && !animated && !isSvg && Math.max(raster.width, raster.height) > DOWNSCALE_SIZE;
  const willDownscale = canDownscale && downscale;
  const tooLarge = file.size > MAX_UPLOAD_BYTES && !willDownscale;

  const params: ParamValues = useMemo(
    () => ({
      padding: 4,
      cornerRadius: 0,
      borderWidth,
      borderColor,
      outlineStyle: 'shape',
      autoCrop,
      removeBg,
      bgTolerance,
    }),
    [borderWidth, borderColor, autoCrop, removeBg, bgTolerance]
  );

  const modifiers: Partial<UniversalModifiers> | undefined = useMemo(
    () =>
      animated
        ? {
            duration: Math.round(durationSec * 100) / 100,
            fps: Math.max(8, Math.min(30, Math.round(frameCount / durationSec))),
          }
        : undefined,
    [animated, durationSec, frameCount]
  );

  const previewEmoji: LoadedEmoji = useMemo(
    () => ({
      slug: '__import-preview',
      rasterUrl: objectUrl ?? undefined,
      manifest: {
        id: '__import-preview',
        name,
        shortcode: '__import-preview',
        description: '',
        tags: [],
        animated,
        paramsSchema: {},
        defaultParams: {},
        modifiers,
      },
    }),
    [objectUrl, name, animated, modifiers]
  );

  const handleImport = async () => {
    if (!raster) return;
    setBusy(true);
    setError(null);
    try {
      const dataUrl = willDownscale ? downscaleToPng(raster) : await readDataUrl(file);
      const ext = willDownscale ? 'png' : file.name.split('.').pop() || 'png';
      const trimmedName = name.trim() || 'Imported Emoji';
      const data = await apiPost<{ slug: string }>('/api/emojis/import-raster', {
        name: trimmedName,
        slug: trimmedName,
        ext,
        dataUrl,
        animated,
        modifiers,
        defaultParams: params,
      });
      onImported(data.slug);
      dialogRef.current?.close();
    } catch (err: any) {
      setError(`Import failed: ${err?.message || err}`);
      setBusy(false);
    }
  };

  const warnings: string[] = [];
  if (raster && animated && file.size > LARGE_ANIMATED_BYTES) {
    warnings.push(
      `Large animated file (${formatMb(file.size)}). It is stored as-is; only the exported Slack GIF is resized.`
    );
  }
  if (frameCount > SLACK_MAX_FRAMES) {
    warnings.push(
      `${frameCount} frames: the Slack export keeps at most ${SLACK_MAX_FRAMES}, so motion will be choppier.`
    );
  }
  if (tooLarge) {
    warnings.push(
      `File is ${formatMb(file.size)}; the import limit is about ${formatMb(MAX_UPLOAD_BYTES)}.`
    );
  }

  const labelClass = 'text-xs font-medium text-zinc-700 dark:text-zinc-300';
  const checkboxRow = 'flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer';

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) dialogRef.current?.close();
      }}
      className="m-auto max-w-2xl w-[calc(100%-2rem)] bg-transparent p-0 backdrop:bg-black/50 dark:backdrop:bg-black/75 backdrop:backdrop-blur-sm"
    >
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full p-6 shadow-2xl transition-colors">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 dark:bg-indigo-500/15 border border-indigo-500/25 dark:border-indigo-500/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <ImagePlus className="w-5 h-5" />
            </div>
            <div>
              <h2 id={titleId} className="text-base font-bold text-zinc-900 dark:text-white">
                Import Image
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {file.name}
                {raster &&
                  ` · ${raster.width}×${raster.height} · ${formatMb(file.size)}${
                    animated ? ` · ${frameCount} frames, ${durationSec.toFixed(2)}s` : ''
                  }`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            disabled={busy}
            aria-label="Close"
            className="p-1.5 rounded-lg text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!raster && !error && (
          <div className="flex items-center justify-center gap-2 py-16 text-xs text-zinc-500">
            <Loader2 className="w-4 h-4 animate-spin" /> Decoding image…
          </div>
        )}

        {raster && (
          <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-6">
            <div className="flex flex-col items-center gap-3">
              <div className="bg-checkerboard-dark rounded-xl p-2 border border-zinc-200 dark:border-zinc-800">
                <EmojiCanvas emoji={previewEmoji} params={params} modifiers={modifiers} size={160} />
              </div>
              <div className="flex gap-2">
                {['bg-[#1A1D21]', 'bg-white'].map((bg) => (
                  <div
                    key={bg}
                    className={`${bg} rounded-lg p-2 flex items-end gap-2 border border-zinc-200 dark:border-zinc-800`}
                  >
                    <EmojiCanvas emoji={previewEmoji} params={params} modifiers={modifiers} size={32} />
                    <EmojiCanvas emoji={previewEmoji} params={params} modifiers={modifiers} size={22} />
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <label className="block space-y-1">
                <span className={labelClass}>Name</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-sm text-zinc-900 dark:text-zinc-100"
                />
              </label>

              <div className="space-y-2">
                <label className={checkboxRow}>
                  <input type="checkbox" checked={autoCrop} onChange={(e) => setAutoCrop(e.target.checked)} />
                  Trim empty borders
                </label>
                <label className={checkboxRow}>
                  <input type="checkbox" checked={removeBg} onChange={(e) => setRemoveBg(e.target.checked)} />
                  Remove background (colour from the top-left corner)
                </label>
                {removeBg && (
                  <label className="block space-y-1 pl-6">
                    <span className={labelClass}>Tolerance: {bgTolerance}</span>
                    <input
                      type="range"
                      min={0}
                      max={60}
                      step={1}
                      value={bgTolerance}
                      onChange={(e) => setBgTolerance(Number(e.target.value))}
                      className="w-full accent-indigo-600"
                    />
                  </label>
                )}
              </div>

              <div className="space-y-1">
                <span className={labelClass}>Sticker outline: {borderWidth}px</span>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={10}
                    step={1}
                    value={borderWidth}
                    onChange={(e) => setBorderWidth(Number(e.target.value))}
                    aria-label="Sticker outline width"
                    className="flex-1 accent-indigo-600"
                  />
                  <input
                    type="color"
                    value={borderColor}
                    onChange={(e) => setBorderColor(e.target.value)}
                    aria-label="Sticker outline colour"
                    className="w-8 h-8 rounded cursor-pointer bg-transparent"
                  />
                </div>
              </div>

              {canDownscale && (
                <label className={checkboxRow}>
                  <input type="checkbox" checked={downscale} onChange={(e) => setDownscale(e.target.checked)} />
                  Shrink to {DOWNSCALE_SIZE}px PNG before saving (original is {raster.width}×{raster.height})
                </label>
              )}

              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                The original file is kept. All of these can be changed later in the Inspector.
              </p>
            </div>
          </div>
        )}

        {(warnings.length > 0 || error) && (
          <ul className="mt-4 space-y-1">
            {warnings.map((w) => (
              <li key={w} className="flex gap-2 text-xs text-amber-700 dark:text-amber-400">
                <TriangleAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {w}
              </li>
            ))}
            {error && (
              <li role="alert" className="flex gap-2 text-xs text-red-600 dark:text-red-400">
                <TriangleAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {error}
              </li>
            )}
          </ul>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            disabled={busy}
            className="px-3.5 py-1.5 rounded-xl bg-zinc-100 hover:bg-zinc-200/80 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-200 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={!raster || busy || tooLarge}
            className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-semibold text-white flex items-center gap-1.5 cursor-pointer"
          >
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Import
          </button>
        </div>
      </div>
    </dialog>
  );
};
