/**
 * Static SPA serving for prod. Assets are read from disk — either the repo's
 * built SPA (packages/homestead-app/dist) or the launcher-built dist passed
 * via --spa-dist. Streams through node:fs so the same code runs under Bun
 * and Node.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openFileStream } from './engine/files';

/** A servable static asset (absolute disk path + derived metadata). */
export interface SpaAsset {
  path: string;
  size: number;
  contentType: string;
}

/** Static SPA assets resolved by request path. */
export interface SpaAssets {
  index(): SpaAsset;
  file(relPath: string): SpaAsset | null;
  /**
   * A short hash identifying the current build, derived from index.html (whose
   * asset references are content-hashed, so it changes iff the build output
   * does). Served at /api/app-version; open tabs reload when it changes. The
   * launcher's `vite build --watch` rewrites the dist in place, so this tracks
   * rebuilds without any restart or input hashing.
   */
  version(): string;
}

const DEFAULT_DIST = fileURLToPath(
  new URL('../../homestead-app/dist', import.meta.url),
);

// Everything a Vite SPA build can emit; unknown extensions fall through to
// application/octet-stream.
const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.map': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.pdf': 'application/pdf',
};

export function contentTypeFor(path: string): string {
  return CONTENT_TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream';
}

function asset(path: string): SpaAsset {
  return { path, size: statSync(path).size, contentType: contentTypeFor(path) };
}

/** Disk-backed assets from the built SPA (packages/homestead-app/dist). */
export function diskSpaAssets(dir: string = DEFAULT_DIST): SpaAssets {
  const indexPath = join(dir, 'index.html');
  if (!existsSync(indexPath)) {
    throw new Error(`built SPA not found at ${dir} — run \`make build\`, or start with --dev`);
  }
  // Cache the index.html hash by mtime so polling /api/app-version doesn't
  // re-read + re-hash on every request; a `vite build --watch` rewrite bumps
  // the mtime and invalidates it.
  let cached: { mtimeMs: number; hash: string } | null = null;
  return {
    index: () => asset(indexPath),
    file: (rel) => {
      const safe = normalize(rel).replace(/^(\.\.(\/|\\|$))+/, '');
      if (!safe || safe === '.') return null;
      const p = join(dir, safe);
      return p.startsWith(dir) && isFile(p) ? asset(p) : null;
    },
    version: () => {
      try {
        const mtimeMs = statSync(indexPath).mtimeMs;
        if (!cached || cached.mtimeMs !== mtimeMs) {
          const hash = createHash('sha256').update(readFileSync(indexPath)).digest('hex').slice(0, 16);
          cached = { mtimeMs, hash };
        }
        return cached.hash;
      } catch {
        // Mid-rewrite read failure — fall back to the last known hash.
        return cached?.hash ?? '';
      }
    },
  };
}

/**
 * Rewrites the served index.html for a request path (e.g. to point an app's
 * path at that app's home-screen manifest and icon). Returning the input
 * unchanged serves the file as-is.
 */
export type IndexRewrite = (html: string, path: string) => string;

/** Serve a static asset, falling back to index.html (SPA routing). */
export function serveStatic(
  spa: SpaAssets,
  path: string,
  rewriteIndex?: IndexRewrite,
): Response {
  const rel = path.replace(/^\/+/, '');
  if (rel && rel !== '.') {
    const file = spa.file(rel);
    if (file) return assetResponse(file);
  }
  const index = spa.index();
  if (rewriteIndex) {
    const html = readFileSync(index.path, 'utf8');
    const rewritten = rewriteIndex(html, path);
    if (rewritten !== html) {
      return new Response(rewritten, { headers: { 'content-type': index.contentType } });
    }
  }
  return assetResponse(index);
}

function assetResponse(a: SpaAsset): Response {
  return new Response(openFileStream(a.path), {
    headers: {
      'content-type': a.contentType,
      'content-length': String(a.size),
    },
  });
}

function isFile(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}
