/**
 * Builds the offline app shell into the service worker.
 *
 * `public/sw.js` is the worker's source. In a production build this plugin
 * rewrites the copy in the output dir with a header describing the build:
 *
 *   self.__HOMESTEAD_PRECACHE__ = { version, urls: [...], lazy: [...] };
 *
 * - `urls` are precached when the worker installs: index.html, the public
 *   files, styles, and every chunk the app's own code can load — including
 *   the route chunks of apps the person never opened, so an app launched from
 *   the Home Screen with no network still boots and can link to another app.
 * - `lazy` are the rest of the build, which the worker caches the first time
 *   each is fetched: chunks only a library loads on demand (shiki's ~300
 *   language grammars) and the packages in `lazyPackages`. Precaching all of
 *   it would pull ~18 MB onto every phone on every deploy.
 *
 * `version` hashes every emitted file, so the header — and with it the bytes
 * of `sw.js` — change exactly when the build does. The browser then installs a
 * fresh worker on its next update check, and that worker drops the previous
 * version's cache when it activates.
 *
 * Dev serves `public/sw.js` untouched (no header), and the worker caches
 * nothing there, so HMR is never shadowed by a stale shell.
 */

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import type { Plugin, Rollup } from 'vite';

export const SW_FILE = 'sw.js';

/** What the build hands the worker. */
export interface PrecacheManifest {
  version: string;
  /** Cached on install. */
  urls: string[];
  /** Cached on first use. */
  lazy: string[];
}

/** One emitted file: a chunk lists the modules bundled into it. */
export interface EmittedFile {
  fileName: string;
  contents: string | Uint8Array;
  moduleIds?: string[];
}

/** The module graph, as Rollup reports it. */
export interface ModuleGraph {
  entries: string[];
  imports(id: string): { static: readonly string[]; dynamic: readonly string[] };
}

const NEVER_CACHED = /\.map$/;

function packageOf(id: string): string | null {
  const at = id.lastIndexOf('/node_modules/');
  if (at === -1) return null;
  const [scope, name] = id.slice(at + '/node_modules/'.length).split('/');
  return scope.startsWith('@') ? `${scope}/${name}` : scope;
}

/**
 * Modules the app's own code can load: everything statically imported from
 * an entry, plus every dynamic import an app module makes (route components,
 * `lazy()` panels, `import('lucide-react')`). A library's own dynamic imports
 * are it loading an optional piece of itself (a grammar, a diagram type), so
 * they aren't followed; nor is anything inside a `lazyPackages` package.
 *
 * Chunk-level metadata can't make this call: Rollup merges app and library
 * modules into one chunk, so a chunk's dynamic imports don't say whose they are.
 */
function appReachableModules(graph: ModuleGraph, lazyPackages: ReadonlySet<string>): Set<string> {
  const reached = new Set<string>();
  const stack = [...graph.entries];
  while (stack.length) {
    const id = stack.pop()!;
    if (reached.has(id)) continue;
    const pkg = packageOf(id);
    if (pkg && lazyPackages.has(pkg)) continue;
    reached.add(id);
    const { static: imported, dynamic } = graph.imports(id);
    stack.push(...imported);
    if (!pkg) stack.push(...dynamic);
  }
  return reached;
}

const toUrl = (fileName: string) => `/${fileName.split(sep).join('/')}`;

export function buildPrecacheManifest(
  files: EmittedFile[],
  graph: ModuleGraph,
  lazyPackages: readonly string[] = [],
): PrecacheManifest {
  const reached = appReachableModules(graph, new Set(lazyPackages));
  const servable = files
    .filter((f) => f.fileName !== SW_FILE && !NEVER_CACHED.test(f.fileName))
    .sort((a, b) => (a.fileName < b.fileName ? -1 : 1));

  // index.html and public files aren't content-hashed by name, so hash
  // contents as well as names.
  const hash = createHash('sha256');
  const urls: string[] = [];
  const lazy: string[] = [];
  for (const file of servable) {
    hash.update(file.fileName).update('\0').update(file.contents).update('\0');
    // Non-chunk files (html, css, images, fonts) are always eager. A chunk is
    // eager when it carries any module the app can reach.
    const eager = !file.moduleIds || file.moduleIds.some((id) => reached.has(id));
    (eager ? urls : lazy).push(toUrl(file.fileName));
  }
  return { version: hash.digest('hex').slice(0, 16), urls, lazy };
}

/** The worker source with the manifest header prepended. */
export function renderServiceWorker(template: string, manifest: PrecacheManifest): string {
  return `self.__HOMESTEAD_PRECACHE__ = ${JSON.stringify(manifest)};\n${template}`;
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

export interface OfflinePrecacheOptions {
  /**
   * Packages the app imports dynamically but that are no use offline, so they
   * are cached on first use rather than precached (e.g. a converter that only
   * runs before an upload, which needs the network anyway).
   */
  lazyPackages?: string[];
}

export function offlinePrecache(options: OfflinePrecacheOptions = {}): Plugin {
  let outDir = '';
  let publicDir = '';
  return {
    name: 'homestead-offline-precache',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
      publicDir = config.publicDir;
    },
    writeBundle(_options, bundle) {
      const outputs = Object.values(bundle);
      const files: EmittedFile[] = walk(publicDir).map((path) => ({
        fileName: relative(publicDir, path),
        contents: readFileSync(path),
      }));
      for (const output of outputs) {
        files.push(
          output.type === 'chunk'
            ? { fileName: output.fileName, contents: output.code, moduleIds: output.moduleIds }
            : { fileName: output.fileName, contents: output.source },
        );
      }
      const graph: ModuleGraph = {
        entries: outputs
          .filter((o): o is Rollup.OutputChunk => o.type === 'chunk' && o.isEntry && !!o.facadeModuleId)
          .map((o) => o.facadeModuleId!),
        imports: (id) => {
          const info = this.getModuleInfo(id);
          return { static: info?.importedIds ?? [], dynamic: info?.dynamicallyImportedIds ?? [] };
        },
      };
      const manifest = buildPrecacheManifest(files, graph, options.lazyPackages);
      const template = readFileSync(join(publicDir, SW_FILE), 'utf8');
      writeFileSync(join(outDir, SW_FILE), renderServiceWorker(template, manifest));
    },
  };
}
