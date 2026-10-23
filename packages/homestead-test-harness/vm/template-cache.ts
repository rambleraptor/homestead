/**
 * On-disk cache for the VM template database, so a run with no relevant code
 * changes skips the schema sync and account setup entirely.
 *
 * The key is deliberately broad: the path and contents of every source file
 * that could shape the database — server, core and app code, the config, the
 * lockfile, and this harness — plus HOMESTEAD_APPS_DIRS. Any edit to any of
 * them is a miss. Contents rather than mtimes, so a fresh checkout (CI, a
 * branch switch) still hits when nothing actually changed. Spec, e2e and unit-test files are left out, so editing a
 * spec keeps the cache. A stale hit would hand every test the wrong schema,
 * so when in doubt this rebuilds. HOMESTEAD_VM_NO_TEMPLATE_CACHE=1 turns the
 * cache off.
 */

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '../../..');
const CACHE_DIR = join(REPO_ROOT, 'node_modules/.cache/homestead-vm');
/** Templates for other source states are pruned once this old. */
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

/** Trees and files whose contents can change what the template holds. */
const KEY_SOURCES = [
  'packages/homestead-server/src',
  'packages/homestead-core',
  'packages/homestead-apps',
  'packages/homestead-test-harness/vm',
  'apps',
  'homestead.config.ts',
  'package-lock.json',
];

/** Directories that never affect the template (specs, tests, dependencies). */
const SKIP_DIRS = new Set(['node_modules', '__tests__', 'e2e', 'vm', 'dist', '.cache']);

async function collect(path: string, out: string[]): Promise<void> {
  let info;
  try {
    info = await stat(path);
  } catch {
    return;
  }
  if (info.isFile()) {
    const digest = createHash('sha256').update(await readFile(path)).digest('hex');
    out.push(`${relative(REPO_ROOT, path)}\0${digest}`);
    return;
  }
  if (!info.isDirectory()) return;
  const entries = await readdir(path, { withFileTypes: true });
  await Promise.all(
    entries
      // The harness's own vm/ dir is a key source; specs' vm/ dirs are not.
      .filter((e) => !(e.isDirectory() && SKIP_DIRS.has(e.name) && !path.endsWith('homestead-test-harness')))
      .map((e) => collect(join(path, e.name), out)),
  );
}

export async function templateCacheKey(): Promise<string> {
  const entries: string[] = [];
  await Promise.all(KEY_SOURCES.map((p) => collect(join(REPO_ROOT, p), entries)));
  entries.sort();
  return createHash('sha256')
    .update(process.env.HOMESTEAD_APPS_DIRS ?? '')
    .update('\n')
    .update(entries.join('\n'))
    .digest('hex')
    .slice(0, 16);
}

export function templateCacheEnabled(): boolean {
  return !process.env.HOMESTEAD_VM_NO_TEMPLATE_CACHE;
}

interface CachePaths {
  db: string;
  meta: string;
}

function pathsFor(key: string): CachePaths {
  return {
    db: join(CACHE_DIR, `template-${key}.db`),
    meta: join(CACHE_DIR, `template-${key}.json`),
  };
}

/** The cached template for `key`, or null. Its metadata is written last, so its presence means complete. */
export async function readCachedTemplate<T>(key: string): Promise<(T & { dbPath: string }) | null> {
  const { db, meta } = pathsFor(key);
  if (!existsSync(meta) || !existsSync(db)) return null;
  const parsed = JSON.parse(await readFile(meta, 'utf8')) as T;
  return { ...parsed, dbPath: db };
}

/**
 * Store a freshly built template under `key` and prune stale entries. Writes
 * go to temp names and are renamed into place, so concurrent workers never
 * read a partial file.
 */
export async function writeCachedTemplate<T>(key: string, dbPath: string, meta: T): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  const target = pathsFor(key);
  const tmp = `.${process.pid}-${Date.now()}`;
  await writeFile(target.db + tmp, await readFile(dbPath));
  await rename(target.db + tmp, target.db);
  await writeFile(target.meta + tmp, JSON.stringify(meta));
  await rename(target.meta + tmp, target.meta);

  // Prune older templates, but only stale ones: a concurrent run on other
  // sources may still be copying from its own entry.
  const cutoff = Date.now() - STALE_AFTER_MS;
  for (const name of await readdir(CACHE_DIR)) {
    if (!name.startsWith('template-') || name.startsWith(`template-${key}.`)) continue;
    const path = join(CACHE_DIR, name);
    const info = await stat(path).catch(() => null);
    if (info && info.mtimeMs < cutoff) await rm(path, { force: true });
  }
}
