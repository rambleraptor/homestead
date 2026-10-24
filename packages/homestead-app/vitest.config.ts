import { defineConfig } from 'vitest/config';
import path from 'path';
import { discoveredApps } from './vite/discovered-apps';

// Operator project root (mirrors vite.config.ts). The workspace root has no
// apps/ dir, so discovery finds nothing here unless HOMESTEAD_APPS_DIRS points
// somewhere that does.
const projectRoot = path.resolve(__dirname, '../..');

export default defineConfig({
  plugins: [discoveredApps(projectRoot)],
  // tsconfig sets `jsx: preserve` for Next.js, which leaves the JSX
  // runtime up to the bundler. Vitest doesn't go through Next.js, so
  // pin it to the automatic runtime here — otherwise components that
  // don't import `React` blow up at render time with
  // `ReferenceError: React is not defined`.
  esbuild: { jsx: 'automatic' },
  test: {
    globals: true,
    // happy-dom, as the VM tier uses: its per-file setup is far cheaper than
    // jsdom's, which dominated this suite's run time.
    environment: 'happy-dom',
    setupFiles: ['./src/test/setup.ts'],
    include: [
      'src/**/*.{test,spec}.{js,jsx,ts,tsx}',
      '../*/**/*.{test,spec}.{js,jsx,ts,tsx}',
    ],
    // Playwright e2e specs colocated next to their apps live under
    // `packages/homestead-apps/<app>/e2e/`. Vitest must not run them.
    // The homestead-cli and homestead-server packages are Bun-tested
    // (`bun test`), not vitest — their specs import `bun:test`, which vitest
    // can't transform.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '../homestead-apps/**/e2e/**',
      '../homestead-cli/**',
      '../homestead-server/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData/',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@homestead/config': path.resolve(__dirname, '../../homestead.config.ts'),
      // Operator project root (mirrors vite.config.ts). The workspace root has
      // no documents/ dir, so project-relative globs resolve to zero modules
      // here.
      '@homestead-project': projectRoot,
    },
  },
});
