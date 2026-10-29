# EmojiGen Studio — LLM Agent Instructions

This repository powers **EmojiGen Studio**, a web application for viewing, tweaking, previewing, and exporting static & animated Slack emojis (`128×128` PNG & `<128 KB` Animated GIF).

Whenever the user asks you in a chat thread to **create a new emoji** or **modify an existing emoji**, follow the instructions below.

---

## 1. How Emojis Are Structured

Every emoji lives in its own directory under `emojis/<slug>/`:

```text
emojis/<slug>/
  emoji.json     # Metadata, customizable parameter schema, default values, and Studio FX defaults
  renderer.ts    # Deterministic 128x128 Canvas 2D render function: (ctx, { t, width, height, params }) => void
```

Vite automatically hot-reloads `emojis/*/emoji.json` and `emojis/*/renderer.ts` via `import.meta.glob`, so the moment you write or edit those files, the emoji appears live in the web app.

---

## 2. Slack Emoji Design Rules (Crucial!)

1. **Virtual Canvas Coordinate System**: Always draw in `128×128` coordinates (`width = 128`, `height = 128`, center at `(64, 64)`).
2. **Legibility at 22×22px and 32×32px**:
   - Fill 80–90% of the `128×128` canvas (leave ~6–10px margin from the edges).
   - Use bold silhouettes and thick outlines (`lineWidth: 4` to `5`, `#09090b` or `#18181b`) so the emoji pops on both **Slack Dark (`#1A1D21`)** and **Slack Light (`#FFFFFF`)** backgrounds.
   - Avoid tiny, thin details (`lineWidth < 2`) that vanish when shrunk to `22px`.
3. **Deterministic Seamless Loops (`t ∈ [0, 1)`)**:
   - Animation progress `t` goes from `0` to `1` per loop.
   - Use `const tau = t * Math.PI * 2;` with `Math.sin(tau)` / `Math.cos(tau)` or `seededRandom` from `../../src/lib/renderer` so every frame is 100% deterministic and loops seamlessly!
   - Never use `Date.now()`, `performance.now()`, or `Math.random()` inside `renderer.ts`.
4. **Expose Meaningful Controls in `paramsSchema`**:
   - Give every generated emoji **4 to 6 customizable controls** (`color`, `number`, `text`, `boolean`, `select`) so the user can interactively customize colors, speeds, expressions, labels, or effects in the web app UI.

---

## 3. Template for Creating a New Emoji

### `emojis/<slug>/emoji.json`
```json
{
  "id": "my-emoji",
  "name": "My Awesome Emoji",
  "shortcode": "my-emoji",
  "description": "Short description of the emoji",
  "tags": ["animated", "custom", "fun"],
  "animated": true,
  "author": "local-llm",
  "createdAt": "2026-10-29T16:00:00Z",
  "paramsSchema": {
    "primaryColor": {
      "type": "color",
      "label": "Primary Color"
    },
    "intensity": {
      "type": "number",
      "label": "Animation Intensity",
      "min": 0.2,
      "max": 2.0,
      "step": 0.1
    },
    "showSparkles": {
      "type": "boolean",
      "label": "Show Sparkles"
    },
    "mood": {
      "type": "select",
      "label": "Expression",
      "options": [
        { "label": "Happy", "value": "happy" },
        { "label": "Hype", "value": "hype" }
      ]
    }
  },
  "defaultParams": {
    "primaryColor": "#6366f1",
    "intensity": 1.0,
    "showSparkles": true,
    "mood": "happy"
  },
  "modifiers": {
    "motion": "none",
    "fps": 20,
    "duration": 1.1,
    "badgeText": ""
  }
}
```

### `emojis/<slug>/renderer.ts`
```ts
import type { EmojiRenderFn } from '../../src/types/emoji';
import { drawRoundedRect, seededRandom } from '../../src/lib/renderer';

export const render: EmojiRenderFn = (ctx, { t, width, height, params }) => {
  const primaryColor = String(params.primaryColor || '#6366f1');
  const intensity = Number(params.intensity ?? 1.0);
  const tau = t * Math.PI * 2;

  ctx.save();
  // Draw bold, high-contrast 128x128 artwork here...
  ctx.restore();
};

export default render;
```
