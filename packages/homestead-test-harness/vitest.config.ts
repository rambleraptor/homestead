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
import { VM_ORIGIN } from './vm/origin';

const repoRoot = path.resolve(__dirname, '../..');
const appDir = path.resolve(repoRoot, 'packages/homestead-app');

export default defineConfig({
  root: repoRoot,
  plugins: [discoveredApps(repoRoot)],
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@': path.resolve(appDir, 'src'),
      '@homestead/config': path.resolve(repoRoot, 'homestead.config.ts'),
      '@homestead-project': repoRoot,
    },
  },
  test: {
    include: ['packages/**/vm/**/*.vm.ts'],
    exclude: ['**/node_modules/**'],
    environment: path.resolve(__dirname, 'vm/environment.ts'),
    deps: {
      // Pre-bundle like Vite's dev server does for the browser. Left to Node's
      // loader, date-fns links ~860 modules one by one, re-reading its very
      // large package.json `exports` map for each (over a second, landing in
      // whichever test first touches a date).
      optimizer: { ssr: { enabled: true, include: ['date-fns'] } },
    },
    env: {
      // Honor grant changes on the very next request (matches the e2e suite).
      PERMISSION_CACHE_TTL_MS: '0',
      // Server-side helpers read this at import time; point them at the VM.
      AEPBASE_URL: `${VM_ORIGIN}/api/aep`,
    },
  },
});
