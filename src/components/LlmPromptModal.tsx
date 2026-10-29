import React, { useEffect, useId, useRef, useState } from 'react';
import { Sparkles, Copy, Check, Terminal, Wand2, X } from 'lucide-react';
import type { LoadedEmoji } from '../types/emoji';

interface LlmPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentEmoji: LoadedEmoji;
}

export const LlmPromptModal: React.FC<LlmPromptModalProps> = ({
  isOpen,
  onClose,
  currentEmoji,
}) => {
  const [mode, setMode] = useState<'create' | 'modify'>('create');
  const [idea, setIdea] = useState('');
  const [animated, setAnimated] = useState(true);
  const [copied, setCopied] = useState(false);
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const titleId = useId();
  const ideaId = useId();

  // Native modal <dialog>: gives role="dialog", Escape-to-close, and keeps focus inside
  useEffect(() => {
    const dialog = dialogRef.current;
    if (isOpen && dialog && !dialog.open) dialog.showModal();
  }, [isOpen]);

  if (!isOpen) return null;

  const generatedPrompt =
    mode === 'create'
      ? `Create a new ${animated ? 'animated' : 'static'} Slack emoji in \`emojis/\` based on this prompt:\n"${
          idea.trim() || 'A caffeinated cat frantically typing on a glowing mechanical keyboard'
        }"\n\nFollow the project conventions in AGENTS.md:\n- Create \`emojis/<slug>/emoji.json\` and \`emojis/<slug>/renderer.ts\`.\n- Expose 4-6 meaningful customizable parameters in \`paramsSchema\` (colors, speed/intensity, text/expression, toggles) so I can tweak it in the EmojiGen web app.\n- Ensure bold silhouettes and high contrast so it reads clearly at 22x22px and 32x32px on both Slack Dark and Light themes.`
      : `Modify the existing emoji \`emojis/${currentEmoji.slug}/\` (${currentEmoji.manifest.name}):\n"${
          idea.trim() || 'Add an extra animation toggle or new visual detail and expose a slider/toggle for it in emoji.json'
        }"\n\nUpdate both \`emojis/${currentEmoji.slug}/renderer.ts\` and \`emojis/${currentEmoji.slug}/emoji.json\` while keeping existing controls working.`;

  const copyPrompt = async () => {
    await navigator.clipboard.writeText(generatedPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="m-auto max-w-xl w-[calc(100%-2rem)] bg-transparent p-0 backdrop:bg-black/50 dark:backdrop:bg-black/75 backdrop:backdrop-blur-sm"
    >
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl transition-colors">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 dark:bg-indigo-500/15 border border-indigo-500/25 dark:border-indigo-500/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <h2 id={titleId} className="text-base font-bold text-zinc-900 dark:text-white">
                Local LLM Thread Prompt Builder
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Paste into your local LLM chat thread — Vite HMR will hot-load the result automatically!
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-zinc-100 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 mb-4">
          <button
            type="button"
            onClick={() => setMode('create')}
            aria-pressed={mode === 'create'}
            className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
              mode === 'create'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Create New Emoji
          </button>
          <button
            type="button"
            onClick={() => setMode('modify')}
            aria-pressed={mode === 'modify'}
            className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
              mode === 'modify'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            <Wand2 className="w-3.5 h-3.5" />
            Modify :{currentEmoji.manifest.shortcode}:
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label htmlFor={ideaId} className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              {mode === 'create'
                ? 'What emoji do you want the LLM to generate?'
                : `What changes should the LLM make to :${currentEmoji.manifest.shortcode}:?`}
            </label>
            <textarea
              id={ideaId}
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              rows={2}
              placeholder={
                mode === 'create'
                  ? 'e.g., A flaming rubber duck with sunglasses floating on lava...'
                  : 'e.g., Add laser eyes toggle and a slider for laser beam width...'
              }
              className="w-full rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {mode === 'create' && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-600 dark:text-zinc-400">Type:</span>
              <button
                type="button"
                onClick={() => setAnimated(true)}
                aria-pressed={animated}
                className={`px-3 py-1 rounded-lg text-xs font-medium border cursor-pointer ${
                  animated
                    ? 'bg-indigo-500/15 dark:bg-indigo-500/20 border-indigo-500 text-indigo-700 dark:text-indigo-300'
                    : 'bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400'
                }`}
              >
                Animated (GIF)
              </button>
              <button
                type="button"
                onClick={() => setAnimated(false)}
                aria-pressed={!animated}
                className={`px-3 py-1 rounded-lg text-xs font-medium border cursor-pointer ${
                  !animated
                    ? 'bg-indigo-500/15 dark:bg-indigo-500/20 border-indigo-500 text-indigo-700 dark:text-indigo-300'
                    : 'bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400'
                }`}
              >
                Static (PNG)
              </button>
            </div>
          )}

          <div className="relative">
            <pre className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-700 dark:text-zinc-300 font-mono whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
              {generatedPrompt}
            </pre>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
            >
              Close
            </button>
            <button
              type="button"
              onClick={copyPrompt}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 shadow-lg shadow-indigo-600/20 cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-300" />
                  Copied to Clipboard!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Copy Prompt for LLM Thread
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
};
