import type { EmojiManifest, EmojiRenderFn, LoadedEmoji } from '../types/emoji';

const manifestModules = import.meta.glob<{ default: EmojiManifest }>(
  '/emojis/*/emoji.json',
  { eager: true }
);

const rendererModules = import.meta.glob<{ render: EmojiRenderFn; default?: EmojiRenderFn }>(
  '/emojis/*/renderer.{ts,tsx}',
  { eager: true }
);

const rasterModules = import.meta.glob<{ default: string }>(
  '/emojis/*/asset.{png,gif,webp,svg,jpg,jpeg}',
  { eager: true, query: '?url' }
);

export function loadAllEmojis(): LoadedEmoji[] {
  const emojis: LoadedEmoji[] = [];

  for (const [manifestPath, mod] of Object.entries(manifestModules)) {
    const match = manifestPath.match(/\/emojis\/([^/]+)\/emoji\.json$/);
    if (!match) continue;
    const slug = match[1];
    const manifest: EmojiManifest = mod.default || (mod as unknown as EmojiManifest);

    // Find matching renderer if present
    const rendererTsPath = `/emojis/${slug}/renderer.ts`;
    const rendererTsxPath = `/emojis/${slug}/renderer.tsx`;
    const rendererMod = rendererModules[rendererTsPath] || rendererModules[rendererTsxPath];
    const renderFn = rendererMod?.render || rendererMod?.default;

    // Find matching raster asset if present
    let rasterUrl: string | undefined;
    for (const [assetPath, assetMod] of Object.entries(rasterModules)) {
      if (assetPath.startsWith(`/emojis/${slug}/`)) {
        rasterUrl = assetMod.default || (assetMod as unknown as string);
        break;
      }
    }

    emojis.push({
      slug,
      manifest: {
        ...manifest,
        id: manifest.id || slug,
        shortcode: manifest.shortcode || slug,
      },
      render: renderFn,
      rasterUrl,
    });
  }

  return emojis.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name));
}
