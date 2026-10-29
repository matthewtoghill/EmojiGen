# EmojiGen Studio: App Review

**Scope:** every file in `src/`, `vite-plugin-emoji-fs.ts`, the config files, and sample emojis. `tsc -b --force` passes with no errors, and `npm audit` finds 0 vulnerabilities. Every issue below came from reading the code. I did not reproduce any of them in a running browser.

---

## Part 1: Improvement Ideas

| # | Idea | User benefit | Effort |
|---|------|--------------|--------|
| 1 | **Generate with an LLM inside the app** | Removes the copy-paste step between app and chat | M–L |
| 2 | **Preview that matches the export, plus a legibility check** | You see in the app exactly what Slack will show | M |
| 3 | **Undo/redo, saved sessions, and shareable links** | Tweaks survive a refresh, and you can send a design to a teammate | S–M |
| 4 | **Quick text-emoji maker** | Covers the most common custom Slack emoji (word art) in seconds | S–M |
| 5 | **Batch export and emoji packs** | Ship a whole set at once | M |
| 6 | **Better image import** | Imported images look as good as generated emojis | M |
| 7 | **Layer and combine emojis, chain motions** | Remixes without writing new renderers | L |
| 8 | **Gallery management** | Keeps a growing library under control | S–M |

### 1. Generate with an LLM inside the app
Today [LlmPromptModal.tsx](file:///C:/Repos/EmojiGen/src/components/LlmPromptModal.tsx) only builds a prompt for you to paste into a chat. Instead:
- Add a **Generate** button that calls a local OpenAI-compatible endpoint (Ollama or LM Studio, configured in settings).
- Send AGENTS.md as the system prompt.
- Write the resulting `emoji.json` and `renderer.ts` through the dev-server plugin.
- Validate the result before saving:
  - Check the JSON shape and type-check the renderer.
  - Render a test frame inside a try/catch.
  - Confirm that `paramsSchema` keys match `defaultParams`.
- Keep a short chat in the app for follow-up edits ("make the eyes bigger"). Each request becomes a modify call with the current files attached.
- Show a diff and offer one-click revert. LLM output can break a renderer, so this matters.

### 2. Preview that matches the export, plus a legibility check
The Slack simulator draws the vector artwork live. The real GIF looks different: it has hard on/off transparency, a reduced color palette, and a fixed frame rate.
- Add a **"Show exported result"** toggle. When on, the simulator plays the actual encoded GIF (in the background, debounced).
- Run automatic checks and show them as warnings:
  - **Canvas fill:** how much of the 128×128 canvas has content (target 80–90%).
  - **Edge margin:** content too close to the edges.
  - **Contrast:** the outline against both Slack backgrounds, #1A1D21 and #FFFFFF.
  - **Loop seam:** pixel difference between the frame at t=0 and the frame at t≈1.
  - **File size:** a live estimate against the 128 KB limit.
- These checks put the rules in AGENTS.md into the app, so human users get them too, not only the LLM.

### ✅ 3. Undo/redo, saved sessions, and shareable links *(Completed except shareable links: `src/lib/edits.ts`)*
- All tweaks live in React state, so a refresh loses unsaved work. Store `customParamsBySlug` and `modifiersBySlug` in `localStorage`.
- Add an undo/redo stack (Ctrl+Z / Ctrl+Shift+Z).
- Put the selected emoji, params, and modifiers in the URL hash so a link reproduces the exact variant.
- Add a "modified" dot in the sidebar and a "Compare with saved" toggle.

### ✅ 4. Quick text-emoji maker *(Completed: built-in `emojis/text-emoji/`)*
Text emojis ("LGTM", "+1", "nope") are the most common custom Slack emojis. Add one built-in parametric text renderer with:
- Font, weight, gradient fill, outline, and a drop shadow that still works with GIF transparency.
- Automatic fitting for one or two lines.
- Optional motions (wave, typewriter, rainbow).

This needs no LLM round trip and reuses the existing Studio FX.

### 5. Batch export and emoji packs
- Multi-select in the sidebar, then export a ZIP containing the GIF or PNG for each emoji plus a CSV/JSON of shortcodes.
- Add a "variant matrix": pick one parameter (for example, color) and export every option as a separate emoji (`party-blob-red`, `party-blob-blue`, …).
- Optionally add a Slack upload helper. Note that `admin.emoji.add` only works on Enterprise Grid. For other workspaces, link to the `/customize/emoji` page.

### 6. Better image import
- **Animated GIF import:** decode the frames (gifenc's sibling `gifuct-js` can do this) and map them to `t`. Today only the first frame is drawn.
- **Auto-crop:** trim transparent borders and remove a solid background with a color-key tolerance slider.
- **Image FX:** add an outline/sticker stroke around the shape, not just around the bounding box. A die-cut outline greatly improves legibility at 22 px.
- **Size checks:** warn on very large uploads and downscale them on the client before sending.

### 7. Layer and combine emojis, chain motions
- Stack multiple emojis or images with per-layer position, scale, and FX (for example, the party blob holding the LGTM stamp).
- Chain or combine motion presets (bounce + glitch) and add easing curves.
- Add a simple keyframe track for scale, rotation, and opacity across `t`.

### 8. Gallery management
- Rename or delete an emoji, edit tags, mark favourites, and sort by name, newest, or recently edited.
- Add a compact grid view for large libraries.
- Show a "Last exported (size)" badge on each emoji.

---

## Part 2: Issues

### 🔴 High

#### ✅ H1. Sidebar thumbnails are frozen while playback runs, and the whole app re-renders every frame *(Completed)*
- The main canvas passes `onTimeUpdate={setLiveT}` ([App.tsx:575](file:///C:/Repos/EmojiGen/src/App.tsx#L575)). That makes `App`, and with it `InspectorPanel`, `SlackPreview`, and every sidebar item, re-render on every animation frame.
- On each render, the sidebar builds new `itemParams` and `itemModifiers` objects ([App.tsx:414-423](file:///C:/Repos/EmojiGen/src/App.tsx#L414-L423)).
- `params` is in the effect's dependency list in [EmojiCanvas.tsx](file:///C:/Repos/EmojiGen/src/components/EmojiCanvas.tsx#L89-L118), so every thumbnail cancels its animation loop and restarts it with a new `startTime` ([L74](file:///C:/Repos/EmojiGen/src/components/EmojiCanvas.tsx#L74)) on every frame.
- Result: thumbnails stay stuck near t≈0. They only animate while playback is **paused**.
- **Fix:**
  - Keep live time in a ref, or in a small component that owns the scrubber, instead of App state.
  - Memoize the sidebar params and modifiers (or compare them by value).
  - Replace about 17 separate animation loops with one shared loop and clock.
- **Status:** Fixed in [animationClock.ts](file:///C:/Repos/EmojiGen/src/lib/animationClock.ts), [EmojiCanvas.tsx](file:///C:/Repos/EmojiGen/src/components/EmojiCanvas.tsx), and [App.tsx](file:///C:/Repos/EmojiGen/src/App.tsx) (`TimelineScrubber` owns scrubber state, `SidebarEmojiItem` and per-slug `params`/`modifiers` are memoized, and all canvases share a single `requestAnimationFrame` loop).

#### ✅ H2. Save as Variant and Import Image can silently overwrite existing emojis *(Completed)*
- Neither `/duplicate` nor `/import-raster` ([vite-plugin-emoji-fs.ts:59-93](file:///C:/Repos/EmojiGen/vite-plugin-emoji-fs.ts#L59-L93), [L121-L183](file:///C:/Repos/EmojiGen/vite-plugin-emoji-fs.ts#L121-L183)) checks whether the target folder already exists.
  - A variant named "Party Blob" overwrites `emojis/party-blob/renderer.ts` and `emoji.json` with the source emoji's files.
  - Importing `ship-it-rocket.png` replaces that emoji's manifest with the image-import schema, and its `renderer.ts` still takes priority, so the emoji is left broken.
  - Duplicating an emoji onto its own slug copies each file onto itself.
- The project is not a git repository, so there is no way to recover.
- **Fix:** return `409 Conflict` when the target exists (or add a numeric suffix), and reject `newSlug === sourceSlug`.
- **Status:** Confirmed fixed in [vite-plugin-emoji-fs.ts](file:///C:/Repos/EmojiGen/vite-plugin-emoji-fs.ts#L125-L147) and [L194-L209](file:///C:/Repos/EmojiGen/vite-plugin-emoji-fs.ts#L194-L209).

#### ✅ H3. Any website can write files through the dev-server API *(Completed)*
- The middleware ([vite-plugin-emoji-fs.ts:20-38](file:///C:/Repos/EmojiGen/vite-plugin-emoji-fs.ts#L20-L38)) parses any POST body as JSON, whatever its `Content-Type`, and never checks `Origin`.
- A malicious page open in your browser can send a "simple" cross-origin `text/plain` POST, which skips the browser's preflight check. That lets it create or overwrite manifests and write arbitrary bytes into `emojis/*`.
- CORS only stops the attacker reading the response. The write still happens.
- There is also no request-size limit, so a large body can exhaust memory.
- **Fix:**
  - Require `Content-Type: application/json`.
  - Reject requests whose `Origin`/`Host` is not the dev server's.
  - Cap the body size (for example, 10 MB).
- **Status:** Confirmed fixed in [vite-plugin-emoji-fs.ts](file:///C:/Repos/EmojiGen/vite-plugin-emoji-fs.ts#L27-L116) (`isAllowedOriginAndHost`, `Content-Type: application/json` check, and 10 MB `MAX_BODY_BYTES` limit).

#### ✅ H4. Exported GIFs play faster than the preview *(Completed)*
- The exporter clamps the frame count to 36 ([exporter.ts:160](file:///C:/Repos/EmojiGen/src/lib/exporter.ts#L160)), and size-reduction passes 2 and 3 cut it to 20 or 16. But the frame delay is always `1000 / fps` ([L80](file:///C:/Repos/EmojiGen/src/lib/exporter.ts#L80)), so the loop gets shorter.
  - Example: 30 FPS × 2.0 s gives 60 frames, clamped to 36 at 33 ms = a **1.2 s loop instead of 2.0 s** (1.7× too fast).
  - Example: Speed 0.5× with the defaults gives a 2.4 s preview but a 1.8 s GIF.
- GIF delays are stored in 1/100 s, so 30 FPS (33 ms) becomes 30 ms and drifts further.
- **Fix:** compute `delay = effectiveDuration * 1000 / frames`, round it to 10 ms, and pick a frame count that divides evenly.
- **Status:** Fixed in [`computeGifTiming`](file:///C:/Repos/EmojiGen/src/lib/exporter.ts#L49-L98), [`getEffectiveDurationSeconds`](file:///C:/Repos/EmojiGen/src/lib/exporter.ts#L37-L42), [`getEffectiveDurationMs`](file:///C:/Repos/EmojiGen/src/lib/animationClock.ts#L56-L60), and [`App.tsx`](file:///C:/Repos/EmojiGen/src/App.tsx#L586-L593) (selects a frame count that evenly divides the total centiseconds when possible, computes a 10 ms-aligned frame delay from `effectiveDuration`, and shares the helper with the timeline scrubber).

### 🟠 Medium

#### ✅ M1. Saving, importing, and exporting fail silently, and "Saved" shows even on failure *(Completed)*
- `handleSaveToDisk` never checks `res.ok` ([App.tsx:168](file:///C:/Repos/EmojiGen/src/App.tsx#L168)).
- `InspectorPanel.handleSave` shows "Saved to emoji.json!" unconditionally ([InspectorPanel.tsx:86](file:///C:/Repos/EmojiGen/src/components/InspectorPanel.tsx#L86)). The same happens under `vite preview` or a static build, where the API does not exist.
- The variant toast also ignores failures.
- The import path calls `res.json()` with no try/catch.
- Export errors become unhandled promise rejections with no message to the user.
- **Fix:** add a central `apiPost` helper and error toasts, and hide the save buttons when the API is unavailable.
- **Status:** Fixed in [api.ts](file:///C:/Repos/EmojiGen/src/lib/api.ts), [App.tsx](file:///C:/Repos/EmojiGen/src/App.tsx), and [InspectorPanel.tsx](file:///C:/Repos/EmojiGen/src/components/InspectorPanel.tsx). All four endpoints go through `apiPost`, which checks `res.ok`, parses JSON safely, and throws the server's error message. Export, import, and export-copy failures appear in the dismissible error banner under the header. Save and variant results now show from every inspector tab, so a failed Save from the bottom bar is no longer hidden. `API_AVAILABLE` (`import.meta.env.DEV`) hides Save, Save as Variant, and Import Image, and skips the disk copy of exports, under `vite preview` or a static build.

#### ✅ M2. The GIF encoder wastes much of the 128 KB budget *(Completed)*
- **Palette per frame:** each frame gets its own color table (padded to 256 colors = 768 bytes). At 36 frames that is about **27 KB of palettes alone**, and colors can flicker between frames. Fix: build one global palette from sampled frames.
- **Transparent pixels skew the palette:** they are zeroed to black and still included in the color analysis ([L96-L116](file:///C:/Repos/EmojiGen/src/lib/exporter.ts#L96-L116)). On a transparent emoji they are usually most of the image, so they push the palette toward black. Fix: analyze only opaque pixels.
- **No frame diffing:** unchanged pixels between frames are not made transparent, and frames are not cropped to the changed area, so files are larger than needed.
- **Misleading message:** if the last pass is still over 128 KB, the note still says "to fit under Slack 128 KB limit" ([L175](file:///C:/Repos/EmojiGen/src/lib/exporter.ts#L175)). There is also no further fallback (fewer frames or 32 colors).
- **Edge smoothing not implemented:** the comment at [L104](file:///C:/Repos/EmojiGen/src/lib/exporter.ts#L104) says semi-transparent edge pixels are blended against a dark background, but that code does not exist. Edges get a hard alpha<110 cutoff, which leaves jagged edges.
- **Status:** Fixed in [`encodeGifPass`](file:///C:/Repos/EmojiGen/src/lib/exporter.ts#L218-L398), [`exportEmojiToGif`](file:///C:/Repos/EmojiGen/src/lib/exporter.ts#L400-L491), and [`InspectorPanel.tsx`](file:///C:/Repos/EmojiGen/src/components/InspectorPanel.tsx#L824-L836) (single global color table built from opaque pixels sampled across frames, semi-transparent edge smoothing against `#1A1D21`, inter-frame transparency diffing and sub-frame bounding-box cropping, a 4th fallback pass at 12 frames / 32 colors, and honest over-limit warnings).

#### ✅ M3. The preview does not match the exported file *(Completed)*
- Anything semi-transparent appears in the preview but disappears in the GIF because of the alpha<110 cutoff. This includes the glitch scanlines (alpha 0.28), glows, shadows, and soft anti-aliasing.
- The Slack simulator shows vector artwork rather than the real 128 px GIF scaled down, so small-size legibility looks better than it really is (see Idea 2).
- **Status:** Fixed in [SlackPreview.tsx](file:///C:/Repos/EmojiGen/src/components/SlackPreview.tsx). A **Show exported result** toggle encodes the real GIF with `exportEmojiToGif` (debounced 600 ms after each edit) and shows it at 16, 22, 32, and 48 px in both Slack themes, with its size in KB. The exported GIF plays at its own frame rate rather than following the timeline scrubber. The automatic legibility checks from Idea 2 are not done.

#### M4. Image-loading race conditions
- The image-loading effects in [App.tsx:66-75](file:///C:/Repos/EmojiGen/src/App.tsx#L66-L75) and [EmojiCanvas.tsx:35-44](file:///C:/Repos/EmojiGen/src/components/EmojiCanvas.tsx#L35-L44) have no cleanup.
  - If you switch quickly between two imported images, a slow `onload` can set the wrong image.
  - Exporting right after switching can render the previous emoji's image.
- Each of the roughly 11 canvases loads its own copy of the image. Load it once and pass it down.
- An SVG without width and height has `naturalWidth === 0` and renders nothing.

#### ✅ M5. Play restarts from the beginning *(Completed)*
Each canvas sets `startTime = performance.now()` when the effect starts, so pressing Play after scrubbing jumps back to t=0. The canvases also each keep their own clock, so they drift slightly out of sync. Use a shared clock that starts from the scrub position.
- **Status:** Fixed via `PlaybackClock` in [animationClock.ts](file:///C:/Repos/EmojiGen/src/lib/animationClock.ts), shared across the 240px stage canvas, 128px export canvas, `SlackPreview` canvases, and `TimelineScrubber`.

#### ✅ M6. Client and server create slugs differently *(Completed)*
- The client's slugify ([InspectorPanel.tsx](file:///C:/Repos/EmojiGen/src/components/InspectorPanel.tsx#L92-L101)) does not truncate to 64 characters and can produce `''` (for a name like "!!!"). The server then falls back to `custom-emoji`.
- `handleDuplicateVariant` selects the slug the client computed and ignores the one the server returns ([App.tsx:202](file:///C:/Repos/EmojiGen/src/App.tsx#L202)), so the new variant can fail to get selected.
- **Status:** Fixed. [slug.ts](file:///C:/Repos/EmojiGen/src/lib/slug.ts) holds one `slugify` that both [InspectorPanel.tsx](file:///C:/Repos/EmojiGen/src/components/InspectorPanel.tsx) and [vite-plugin-emoji-fs.ts](file:///C:/Repos/EmojiGen/vite-plugin-emoji-fs.ts) use. It truncates to 64 characters, strips a trailing hyphen left by truncation, and returns `''` for names like "!!!", which the client rejects. Only the server applies the `custom-emoji` fallback. `handleDuplicateVariant` and the import handler select the slug the server returns, and the success toast shows that slug too.

#### M7. Color FX don't work in Safari
`CanvasRenderingContext2D.filter` ([renderer.ts:169](file:///C:/Repos/EmojiGen/src/lib/renderer.ts#L169)) is not supported in Safari. Hue shift, saturation, and the Party Mode rainbow therefore do nothing there, in both the preview and the export. Either do the color adjustment per pixel with a fallback, or detect the missing feature and warn.

### 🟡 Low / Polish

1. ~~**Settings with no UI:** `duration`, `brightness`, `contrast`, `backgroundRadius`, and `badgeScale` exist in [UniversalModifiers](file:///C:/Repos/EmojiGen/src/types/emoji.ts#L27-L50) and the renderer, but there are no controls for them. Loop length in particular can't be changed in the app.~~ ✅ *Completed* (Studio FX tab in [InspectorPanel.tsx](file:///C:/Repos/EmojiGen/src/components/InspectorPanel.tsx) now has Loop Length 0.4–4.0 s, Brightness and Contrast 50–150%, Corner Radius 0–64 px when a solid background is on, and Badge Size 60–150%)
2. **Save writes every setting:** all 22 modifier keys, defaults included, go into `emoji.json`. This fixes today's defaults into the file and makes diffs noisy. Save only the keys that differ from `DEFAULT_UNIVERSAL_MODIFIERS`.
3. **Frame counter is wrong:** the "Frame X / N" display ignores the exporter's 0.4 s minimum and the size-reduction passes, so it can disagree with the exported frame count. Share one helper for both.
4. ~~**Search with colons fails:** the placeholder suggests `:shortcode:`, but typing the colons stops anything matching. Strip `:` from the query.~~ ✅ *Completed* (the sidebar search in [App.tsx](file:///C:/Repos/EmojiGen/src/App.tsx) strips `:` before matching)
5. ~~**Stale export info:** `lastExport` is cleared when you click an emoji in the sidebar, but not when a duplicate or import changes the selection, so stale export details stay visible.~~ ✅ *Completed with M1* (duplicate and import now clear `lastExport`, and each export clears `lastSavedPath`)
6. ~~**GIF export for static emojis:** "Quick Export GIF" on a static emoji with no motion produces 8 identical frames. Default to PNG, or show a hint.~~ ✅ *Completed* (when `animated` is false and motion is None, the header button becomes "Quick Export PNG" and the bottom bar swaps to "Export PNG" with a secondary "GIF" button. The Export tab keeps both buttons and adds a hint)
7. ~~**Accessibility:**~~ ✅ *Completed*
   - ~~The modal has no `role="dialog"`, no Escape-to-close, and no focus trap.~~ [LlmPromptModal.tsx](file:///C:/Repos/EmojiGen/src/components/LlmPromptModal.tsx) is now a native `<dialog>` opened with `showModal()`, which provides the dialog role, Escape-to-close, and focus containment. It is labelled by its heading, and clicking the backdrop closes it.
   - ~~Icon-only buttons have no `aria-label`.~~ Play/Pause, the modal close button, the timeline slider, the search box, colour pickers, and the reaction pill now have accessible names.
   - ~~Toggle buttons are missing `role="switch"`/`aria-checked`.~~ Boolean emoji parameters use `role="switch"` with `aria-checked`. Segmented and toggle buttons (tabs, filters, backgrounds, motion presets, badge position, flips, theme modes, Safe Zone, Show exported result) use `aria-pressed`. The selected sidebar emoji has `aria-current`.
   - ~~`<label>`s are not linked to their inputs.~~ Parameter inputs and badge inputs are linked with `htmlFor`/`id` via `useId`. All Studio FX sliders now go through `FxSlider`, which links its label. Labels that headed a whole group became `<h4>`.
8. **Fonts:**
   - Inter is loaded from Google Fonts, which is odd for a "local" tool and fails offline.
   - The badge text can be drawn in a fallback font before the web font loads. Wait for `document.fonts.ready` before exporting.
9. ~~**Repository hygiene:**~~ ✅ *Completed*
   - ~~The project has no git repository, even though the app writes to source files.~~ The project is now a git repository.
   - ~~`tsconfig.tsbuildinfo` sits in the project root.~~ `tsBuildInfoFile` now points to `node_modules/.tmp/`.
   - ~~There are no lint or test scripts.~~ Added `npm run lint` (ESLint flat config in [eslint.config.js](file:///C:/Repos/EmojiGen/eslint.config.js): typescript-eslint, react-hooks, react-refresh), `npm run typecheck`, and `npm test` (Vitest). [emojis.test.ts](file:///C:/Repos/EmojiGen/src/lib/emojis.test.ts) uses `@napi-rs/canvas` to check that every emoji renders deterministically, that the wrap from last frame to first is no bigger than any step inside the loop, and that the default GIF export is at or under 128 KB. Existing `no-explicit-any`, `react-hooks/refs` (EmojiCanvas's deliberate latest-ref pattern), and `react-hooks/set-state-in-effect` findings are set to warnings (30 remain) so lint passes.
10. **Layout:** the fixed three-column layout plus `w-full` on the inspector squeezes the center stage on narrow screens.

---

## Suggested Fix Order
1. ~~**H2, H3:** stop data loss and cross-site writes (small changes, all in the plugin).~~ ✅ *Completed*
2. ~~**H1, M5:** shared animation clock; stop re-rendering the app every frame.~~ ✅ *Completed*
3. ~~**H4, M2:** accurate GIF timing, one global palette, honest size messages.~~ ✅ *Completed*
4. ~~**M1, M6:** error handling and slugs from the server.~~ ✅ *Completed* (M3 also done, via the exported-GIF toggle)
5. Then Ideas 2 and 3 (cheap, high value), followed by Idea 1.
