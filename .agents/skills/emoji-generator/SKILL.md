---
name: emoji-generator
description: Create or modify parametric static and animated Slack emojis in the emojis/ directory for EmojiGen Studio.
---

# Emoji Generator Skill

Use this skill whenever the user asks to generate a new Slack emoji or modify an existing emoji in `C:\Repos\EmojiGen`.

## Steps to Create a New Emoji

1. Choose a kebab-case `<slug>` (e.g. `deploy-parrot`, `laser-cat`, `merged-party`).
2. Create `emojis/<slug>/emoji.json` defining:
   - `id`, `name`, `shortcode`, `description`, `tags`, `animated` (`true` or `false`)
   - `paramsSchema` with 4–6 customizable controls (`color`, `number`, `text`, `boolean`, `select`)
   - `defaultParams` matching the keys in `paramsSchema`
   - `modifiers` (optional default `badgeText`, `fps`, `duration`, `motion`)
3. Create `emojis/<slug>/renderer.ts` exporting `render: EmojiRenderFn`:
   - Draw inside the `128×128` virtual canvas (`width = 128`, `height = 128`).
   - Use bold shapes (fill 80–90% of the canvas) and thick outlines (`4px–5px`) so the emoji is legible at Slack's `22×22px` inline size and `16×16px` reaction pill size.
   - Drive all animations deterministically from `t` (`0 <= t < 1`, e.g. `const tau = t * Math.PI * 2;`). Never use `Math.random()` or `Date.now()`; use `seededRandom(seed)` from `../../src/lib/renderer` if randomness is needed.
4. Run `npm run build` (or `npx tsc --noEmit`) to verify there are no TypeScript errors.
