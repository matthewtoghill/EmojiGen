// Shared by the client and vite-plugin-emoji-fs so both derive identical slugs.
// Returns '' when nothing usable remains (e.g. "!!!").
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/, '');
}
