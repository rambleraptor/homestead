/**
 * The offline-precache plugin decides which build files an installed app
 * downloads up front (so it boots with no network) and which wait for first
 * use. These pin that decision on a small module graph shaped like the real
 * one: an entry, lazy app routes, and libraries that load their own pieces.
 */

import { describe, expect, test } from 'vitest';
import {
  buildPrecacheManifest,
  renderServiceWorker,
  type EmittedFile,
  type ModuleGraph,
} from '../../../vite/offline-precache';

const NM = '/repo/node_modules';

/** module id → [static imports, dynamic imports] */
function graph(edges: Record<string, [string[], string[]]>, entries = ['/src/main.tsx']): ModuleGraph {
  return {
    entries,
    imports: (id) => ({ static: edges[id]?.[0] ?? [], dynamic: edges[id]?.[1] ?? [] }),
  };
}

const chunk = (fileName: string, ...moduleIds: string[]): EmittedFile => ({
  fileName,
  contents: `/* ${fileName} */`,
  moduleIds,
});

const EDGES: Record<string, [string[], string[]]> = {
  '/src/main.tsx': [[`${NM}/react/index.js`], ['/apps/recipes/RecipesHome.tsx', `${NM}/lucide-react/index.js`]],
  '/apps/recipes/RecipesHome.tsx': [[], [`${NM}/heic-to/index.js`]],
  // A library loading an optional piece of itself.
  [`${NM}/shiki/index.js`]: [[], [`${NM}/@shikijs/langs/cpp.mjs`]],
  '/core/chat/Thread.tsx': [[`${NM}/shiki/index.js`], []],
};
EDGES['/src/main.tsx'][1].push('/core/chat/Thread.tsx');

const FILES: EmittedFile[] = [
  { fileName: 'index.html', contents: '<html></html>' },
  { fileName: 'icon-192.png', contents: new Uint8Array([1, 2, 3]) },
  { fileName: 'assets/index.css', contents: 'body{}' },
  chunk('assets/index.js', '/src/main.tsx', `${NM}/react/index.js`),
  chunk('assets/index.js.map'),
  chunk('assets/RecipesHome.js', '/apps/recipes/RecipesHome.tsx'),
  chunk('assets/lucide-react.js', `${NM}/lucide-react/index.js`),
  chunk('assets/heic-to.js', `${NM}/heic-to/index.js`),
  // Rollup merges app and library modules into one chunk.
  chunk('assets/chat.js', '/core/chat/Thread.tsx', `${NM}/shiki/index.js`),
  chunk('assets/cpp.js', `${NM}/@shikijs/langs/cpp.mjs`),
  { fileName: 'sw.js', contents: '' },
];

describe('buildPrecacheManifest', () => {
  test('precaches the shell and every chunk app code can load', () => {
    const { urls } = buildPrecacheManifest(FILES, graph(EDGES));
    expect(urls).toEqual([
      '/assets/RecipesHome.js',
      '/assets/chat.js',
      '/assets/heic-to.js',
      '/assets/index.css',
      '/assets/index.js',
      '/assets/lucide-react.js',
      '/icon-192.png',
      '/index.html',
    ]);
  });

  test("leaves a library's own dynamic imports for first use, even from a merged chunk", () => {
    const { lazy } = buildPrecacheManifest(FILES, graph(EDGES));
    expect(lazy).toEqual(['/assets/cpp.js']);
  });

  test('lazyPackages moves a package the app imports to first use', () => {
    const { urls, lazy } = buildPrecacheManifest(FILES, graph(EDGES), ['heic-to']);
    expect(urls).not.toContain('/assets/heic-to.js');
    expect(lazy).toContain('/assets/heic-to.js');
  });

  test('never lists sourcemaps or the worker itself', () => {
    const { urls, lazy } = buildPrecacheManifest(FILES, graph(EDGES));
    for (const url of [...urls, ...lazy]) {
      expect(url).not.toMatch(/\.map$|^\/sw\.js$/);
    }
  });

  test('the version changes with any file’s contents and is stable otherwise', () => {
    const base = buildPrecacheManifest(FILES, graph(EDGES)).version;
    expect(buildPrecacheManifest([...FILES].reverse(), graph(EDGES)).version).toBe(base);
    const edited = FILES.map((f) =>
      f.fileName === 'index.html' ? { ...f, contents: '<html><body></body></html>' } : f,
    );
    expect(buildPrecacheManifest(edited, graph(EDGES)).version).not.toBe(base);
  });
});

describe('renderServiceWorker', () => {
  test('prepends the manifest the worker reads', () => {
    const manifest = { version: 'abc', urls: ['/index.html'], lazy: [] };
    const out = renderServiceWorker('// worker\n', manifest);
    const header = out.split('\n', 1)[0];
    expect(header).toBe(`self.__HOMESTEAD_PRECACHE__ = ${JSON.stringify(manifest)};`);
    expect(out.endsWith('// worker\n')).toBe(true);
  });
});
