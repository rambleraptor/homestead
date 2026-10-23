/**
 * The VM test tier: `*.vm.ts` specs, each running the real SPA in happy-dom
 * against the real server in the same worker (see vm/boot.ts).
 *
 * Module resolution mirrors packages/homestead-app's vite config — the same
 * aliases and the discovered-apps virtual module — since the SPA is imported
 * from source exactly as Vite serves it in dev.
 */

import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { discoveredApps } from '../homestead-app/vite/discovered-apps';
import { AI_STUB_ORIGIN, VM_ORIGIN } from './vm/origin';

const repoRoot = path.resolve(__dirname, '../..');
const reactDev = !!process.env.HOMESTEAD_VM_REACT_DEV;
const appDir = path.resolve(repoRoot, 'packages/homestead-app');

export default defineConfig({
  root: repoRoot,
  plugins: [discoveredApps(repoRoot)],
  // jsxDev must follow the React build: production React has no `jsxDEV`.
  esbuild: { jsx: 'automatic', jsxDev: reactDev },
  resolve: {
    alias: {
      '@': path.resolve(appDir, 'src'),
      '@homestead/config': path.resolve(repoRoot, 'homestead.config.ts'),
      '@homestead-project': repoRoot,
    },
  },
  test: {
    // Keep transformed modules on disk between runs (keyed by file content),
    // so a rerun skips most of Vite's transform work. Experimental in Vitest 4;
    // delete node_modules/.experimental-vitest-cache if it ever misbehaves.
    experimental: { fsModuleCache: true },
    include: ['packages/**/vm/**/*.vm.ts', 'tests/vm/**/*.vm.ts'],
    exclude: ['**/node_modules/**'],
    environment: path.resolve(__dirname, 'vm/environment.ts'),
    // Spec files on a worker share one module graph (server + SPA), so the
    // multi-second import is paid once per worker, not once per file.
    // bootHomestead()/close() reset every piece of per-test state.
    isolate: false,
    // Each worker loads that graph itself (~3s of CPU), so past a couple of
    // workers the extra parallelism costs more than it buys.
    maxWorkers: '50%',
    deps: {
      // Pre-bundle like Vite's dev server does for the browser. Left to Node's
      // loader, date-fns links ~860 modules one by one, re-reading its very
      // large package.json `exports` map for each (over a second, landing in
      // whichever test first touches a date).
      optimizer: { ssr: { enabled: true, include: ['date-fns'] } },
    },
    env: {
      // React's production build renders several times faster than its
      // development build. Set for the whole worker, not by aliasing React, so
      // every library that imports React gets the same copy. Run with
      // HOMESTEAD_VM_REACT_DEV=1 to get the development build (and its
      // warnings) back while debugging a spec.
      NODE_ENV: reactDev ? 'development' : 'production',
      // The rest mirrors the e2e server's environment (tests/e2e/config).
      // Honor grant changes on the very next request.
      PERMISSION_CACHE_TTL_MS: '0',
      AEPBASE_ACCESS_CACHE_TTL_MS: '1000',
      // The stub AI provider, served in-process by the fetch shim (vm/boot.ts).
      AI_API_KEY: 'e2e-stub-key',
      AI_PROVIDER: 'openai',
      AI_MODEL: 'stub-model',
      AI_BASE_URL: `${AI_STUB_ORIGIN}/v1`,
      // Server-side helpers read this at import time; point them at the VM.
      AEPBASE_URL: `${VM_ORIGIN}/api/aep`,
      // Point the e2e seed helpers (tests/e2e/utils) at the VM too.
      HOMESTEAD_E2E_APP_URL: VM_ORIGIN,
    },
  },
});
