// The /api/emojis/* endpoints only exist on the Vite dev server (vite-plugin-emoji-fs).
// Under `vite preview` or a static build there is nothing to write to.
export const API_AVAILABLE = import.meta.env.DEV;

export async function apiPost<T = Record<string, any>>(
  path: string,
  body: unknown
): Promise<T> {
  if (!API_AVAILABLE) {
    throw new Error('Saving to disk needs the dev server (npm run dev)');
  }
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request to ${path} failed (${res.status})`);
  }
  return data as T;
}
