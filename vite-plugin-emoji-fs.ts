import type { Plugin } from 'vite';
import type { IncomingMessage } from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { slugify } from './src/lib/slug';

const MAX_BODY_BYTES = 10 * 1024 * 1024; // 10 MB

class HttpError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

function sanitizeSlug(input: string): string {
  return slugify(input) || 'custom-emoji';
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function isAllowedOriginAndHost(req: IncomingMessage, configuredHost?: string | boolean): boolean {
  const hostHeader = req.headers.host;
  const originHeader = req.headers.origin;
  if (!hostHeader || !originHeader || originHeader === 'null') {
    return false;
  }

  const secFetchSite = req.headers['sec-fetch-site'];
  if (
    typeof secFetchSite === 'string' &&
    secFetchSite !== 'same-origin' &&
    secFetchSite !== 'none'
  ) {
    return false;
  }

  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(originHeader);
  } catch {
    return false;
  }

  if (parsedOrigin.host !== hostHeader) {
    return false;
  }

  const allowedHostnames = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
  if (typeof configuredHost === 'string' && configuredHost.trim()) {
    allowedHostnames.add(configuredHost.trim().toLowerCase());
  }

  return allowedHostnames.has(parsedOrigin.hostname.toLowerCase());
}

async function readJsonBody(req: IncomingMessage, maxBytes: number): Promise<Record<string, any>> {
  const contentLength = req.headers['content-length'];
  if (contentLength !== undefined) {
    const declaredLength = Number(contentLength);
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      throw new HttpError(413, 'Request body exceeds 10 MB limit');
    }
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buf.byteLength;
    if (totalBytes > maxBytes) {
      req.destroy();
      throw new HttpError(413, 'Request body exceeds 10 MB limit');
    }
    chunks.push(buf);
  }

  const rawBody = Buffer.concat(chunks).toString('utf-8');
  try {
    return rawBody ? JSON.parse(rawBody) : {};
  } catch {
    throw new HttpError(400, 'Invalid JSON payload');
  }
}

export function emojiFsPlugin(): Plugin {
  return {
    name: 'vite-plugin-emoji-fs',
    configureServer(server) {
      const rootDir = server.config.root;
      const emojisDir = path.join(rootDir, 'emojis');

      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/emojis/')) {
          return next();
        }

        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        // H3: Reject requests whose Origin/Host is not the dev server's
        if (!isAllowedOriginAndHost(req, server.config.server?.host)) {
          res.statusCode = 403;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Forbidden: invalid Origin or Host' }));
          return;
        }

        // H3: Require Content-Type: application/json
        const contentType = (req.headers['content-type'] || '')
          .split(';')[0]
          .trim()
          .toLowerCase();
        if (contentType !== 'application/json') {
          res.statusCode = 415;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({ error: 'Unsupported Media Type: expected application/json' })
          );
          return;
        }

        try {
          // H3: Cap the body size at 10 MB
          const body = await readJsonBody(req, MAX_BODY_BYTES);

          // 1. Save updated manifest (defaultParams, modifiers, metadata) to emojis/<slug>/emoji.json
          if (req.url === '/api/emojis/save') {
            const slug = sanitizeSlug(body.slug || body.manifest?.id || '');
            if (!slug || !body.manifest) {
              throw new HttpError(400, 'Missing slug or manifest payload');
            }
            const targetDir = path.join(emojisDir, slug);
            await fs.mkdir(targetDir, { recursive: true });
            const manifestPath = path.join(targetDir, 'emoji.json');
            await fs.writeFile(manifestPath, JSON.stringify(body.manifest, null, 2) + '\n', 'utf-8');

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, path: manifestPath }));
            return;
          }

          // 2. Duplicate / Save as new variant in emojis/<newSlug>/
          if (req.url === '/api/emojis/duplicate') {
            const sourceSlug = sanitizeSlug(body.sourceSlug || '');
            const newSlug = sanitizeSlug(body.newSlug || '');
            if (!sourceSlug || !newSlug || !body.manifest) {
              throw new HttpError(400, 'Missing sourceSlug, newSlug, or manifest');
            }
            if (newSlug === sourceSlug) {
              throw new HttpError(
                409,
                `Cannot duplicate "${sourceSlug}" onto itself. Choose a different variant name.`
              );
            }
            const sourceDir = path.join(emojisDir, sourceSlug);
            if (!(await pathExists(sourceDir))) {
              throw new HttpError(404, `Source emoji "${sourceSlug}" does not exist`);
            }
            const targetDir = path.join(emojisDir, newSlug);
            if (await pathExists(targetDir)) {
              throw new HttpError(
                409,
                `Emoji "emojis/${newSlug}" already exists. Choose a different variant name.`
              );
            }
            await fs.mkdir(targetDir, { recursive: true });

            // Copy renderer or asset files from sourceDir
            const entries = await fs.readdir(sourceDir, { withFileTypes: true });
            for (const entry of entries) {
              if (entry.isFile() && entry.name !== 'emoji.json') {
                await fs.copyFile(
                  path.join(sourceDir, entry.name),
                  path.join(targetDir, entry.name)
                );
              }
            }

            const manifestPath = path.join(targetDir, 'emoji.json');
            const updatedManifest = {
              ...body.manifest,
              id: newSlug,
              shortcode: body.manifest.shortcode || newSlug,
              createdAt: new Date().toISOString(),
            };
            await fs.writeFile(manifestPath, JSON.stringify(updatedManifest, null, 2) + '\n', 'utf-8');

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, slug: newSlug, path: manifestPath }));
            return;
          }

          // 3. Save exported PNG or GIF binary to emojis/<slug>/exports/<filename>
          if (req.url === '/api/emojis/export') {
            const slug = sanitizeSlug(body.slug || 'emoji');
            const rawFilename = (body.filename || `${slug}.gif`).replace(/[^a-zA-Z0-9._-]/g, '_');
            const filename =
              rawFilename === '.' || rawFilename === '..' ? `${slug}.gif` : rawFilename;
            const dataUrl: string = body.dataUrl || '';
            const base64Match = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
            if (!base64Match) {
              throw new HttpError(400, 'Invalid dataUrl payload');
            }
            const buffer = Buffer.from(base64Match[1], 'base64');
            const exportsDir = path.join(emojisDir, slug, 'exports');
            await fs.mkdir(exportsDir, { recursive: true });
            const exportPath = path.join(exportsDir, filename);
            await fs.writeFile(exportPath, buffer);

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                ok: true,
                path: exportPath,
                sizeBytes: buffer.byteLength,
              })
            );
            return;
          }

          // 4. Import a raster image as a new customizable emoji in emojis/<slug>/
          if (req.url === '/api/emojis/import-raster') {
            const name = body.name || 'Imported Emoji';
            const slug = sanitizeSlug(body.slug || name);
            const dataUrl: string = body.dataUrl || '';
            const ext = (body.ext || 'png').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'png';
            const base64Match = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
            if (!base64Match) {
              throw new HttpError(400, 'Invalid image dataUrl');
            }
            const targetDir = path.join(emojisDir, slug);
            if (await pathExists(targetDir)) {
              throw new HttpError(
                409,
                `Emoji "emojis/${slug}" already exists. Rename the file before importing.`
              );
            }
            const buffer = Buffer.from(base64Match[1], 'base64');
            await fs.mkdir(targetDir, { recursive: true });

            const assetFileName = `asset.${ext}`;
            await fs.writeFile(path.join(targetDir, assetFileName), buffer);

            const manifest = {
              id: slug,
              name,
              shortcode: slug,
              description: `Imported image emoji (${assetFileName})`,
              tags: ['imported', 'raster'],
              animated: false,
              author: 'user-import',
              createdAt: new Date().toISOString(),
              rasterAsset: assetFileName,
              paramsSchema: {
                padding: {
                  type: 'number',
                  label: 'Image Padding',
                  min: 0,
                  max: 32,
                  step: 1,
                },
                cornerRadius: {
                  type: 'number',
                  label: 'Corner Radius',
                  min: 0,
                  max: 64,
                  step: 2,
                },
                borderWidth: {
                  type: 'number',
                  label: 'Outline Width',
                  min: 0,
                  max: 10,
                  step: 1,
                },
                borderColor: {
                  type: 'color',
                  label: 'Outline Color',
                },
              },
              defaultParams: {
                padding: 4,
                cornerRadius: 0,
                borderWidth: 0,
                borderColor: '#ffffff',
              },
              modifiers: body.modifiers || undefined,
            };

            const manifestPath = path.join(targetDir, 'emoji.json');
            await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, slug, path: manifestPath }));
            return;
          }

          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Unknown endpoint' }));
        } catch (err: any) {
          const statusCode = err instanceof HttpError ? err.statusCode : 500;
          res.statusCode = statusCode;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err?.message || 'Internal server error' }));
        }
      });
    },
  };
}
