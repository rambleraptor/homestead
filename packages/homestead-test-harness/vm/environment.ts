/**
 * Vitest environment for the VM tier: a happy-dom window for the SPA, sharing
 * one global with the server code that runs in the same worker.
 *
 * Vitest's stock happy-dom environment swaps in happy-dom's fetch, Request,
 * Response, Headers, URL, FormData, Blob and File. The server half (Hono, the
 * engine) needs Node's own: it builds Responses the SPA's fetch then reads, and
 * the two must be the same classes. So the DOM comes from happy-dom and the
 * fetch family stays Node's; `fetch` itself is replaced by the shim in
 * fetch-shim.ts, which routes the VM origin into the app.
 */

import type { Environment } from 'vitest/environments';
import { populateGlobal } from 'vitest/environments';
import { applyHappyDomFixes } from './happy-dom-fixes';
import { VM_ORIGIN } from './origin';

/** Node implementations the server shares with the page. */
const NODE_NATIVE = ['FormData', 'Blob', 'File'] as const;

export default {
  name: 'homestead-vm',
  // Server modules need Node semantics (file: import.meta.url, node export
  // conditions); the SPA's modules run fine under the same transform.
  viteEnvironment: 'ssr',
  async setup(global) {
    const { Window } = await import('happy-dom');
    const natives = new Map(NODE_NATIVE.map((k) => [k, global[k]]));
    const win = new Window({
      url: `${VM_ORIGIN}/`,
      width: 1280,
      height: 800,
      console: global.console,
      settings: { disableErrorCapturing: true },
    });
    applyHappyDomFixes(win as unknown as Parameters<typeof applyHappyDomFixes>[0]);
    const { keys, originals } = populateGlobal(global, win, { bindFunctions: true });
    for (const [k, v] of natives) global[k] = v;

    return {
      async teardown(g) {
        await win.happyDOM.abort();
        win.close();
        keys.forEach((k) => delete g[k]);
        originals.forEach((v, k) => (g[k] = v));
        for (const [k, v] of natives) g[k] = v;
      },
    };
  },
} satisfies Environment;
