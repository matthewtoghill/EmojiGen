# EmojiGen Studio — Slack Emoji Creator & Inspector

A local-LLM-friendly web studio for generating, customizing, previewing, and exporting static & animated Slack emojis (`128×128` PNG and `<128 KB` Animated GIF).

## Quick Start

```bash
npm install
npm run dev
```

Then open `http://localhost:5173`.

## Checks

```bash
npm run lint       # ESLint (TypeScript + React hooks rules)
npm run typecheck  # tsc -b
npm test           # Vitest: every emoji renders deterministically, loops seamlessly, and exports a GIF <= 128 KB
```

## How It Works

1. **Generate in Local LLM Chat Thread**:
   Ask any local LLM thread in this repository:
   > *"Create a new animated Slack emoji for a celebrating robot in `emojis/`"*
   or click **"Prompt Local LLM"** in the top-right of the web app to copy a structured creation/modification prompt.
   The LLM follows [AGENTS.md](file:///C:/Repos/EmojiGen/AGENTS.md) and [.agents/skills/emoji-generator/SKILL.md](file:///C:/Repos/EmojiGen/.agents/skills/emoji-generator/SKILL.md) to create `emojis/<slug>/emoji.json` and `emojis/<slug>/renderer.ts`.
2. **Instant Live Reload Gallery**:
   Vite watches `emojis/*/emoji.json` and `emojis/*/renderer.ts`, so newly generated emojis appear immediately in the left sidebar.
3. **Modify in the Web App**:
   - **Controls Tab**: Dynamically renders sliders, color pickers, text inputs, dropdowns, and toggles defined in the emoji's `paramsSchema`.
   - **Studio FX Tab**: Apply universal motion presets (`Intensifies Shake`, `Party Rainbow`, `Bounce`, `Spin`, `Pulse`, `Wobble`, `Glitch`), bold Slack badge overlays (`LGTM`, `SHIP IT`, `WIP`, `HOTFIX`), speed/FPS adjustments, transforms, and color grading—even on imported raster images!
4. **Live Slack Context Simulator**:
   Preview how your emoji reads at `16px` (reaction pill), `22px` (inline chat text), and `32px` (jumbo standalone emoji) on both **Slack Dark (`#1A1D21`)** and **Slack Light (`#FFFFFF`)** backgrounds.
5. **One-Click Slack Export & Disk Persistence**:
   - **Save**: Writes your customized default parameters and FX straight back to `emojis/<slug>/emoji.json` (or saves as a new variant folder `emojis/<new-slug>/`).
   - **Export GIF / PNG**: Encodes a `128×128` transparent Animated GIF (automatically optimized under Slack's `128 KB` limit) or static PNG, downloads it in your browser, and saves a copy to `emojis/<slug>/exports/`.
