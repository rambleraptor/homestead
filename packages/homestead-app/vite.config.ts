import { defineConfig, searchForWorkspaceRoot, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { execSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoveredApps, projectAppsDirs } from './vite/discovered-apps';

const SERVER_STUB_ID = '\0homestead-server-only-stub';

/**
 * Stub server-only app modules out of the production client bundle. Two kinds,
 * both reachable from the client registry via lazy `() => import(...)` thunks
 * that would otherwise code-split into dead browser chunks (pulling in web-push,
 * `node:fs`, and friends):
 *
 *  - custom-method handlers + bulk-import parsers, under an app's `methods/` dir
 *    (ResourceDefinition.customMethods[].load / bulkImport.formats[].load);
 *  - cron handlers, under an app's `crons/` dir (AppConfig.crons[].load);
 *  - resource-sync handlers, under an app's `syncs/` dir (AppConfig.syncs[].load);
 *  - data-migration handlers, under an app's `migrations/` dir
 *    (AppConfig.migrations[].load);
 *  - server boot modules, named `*.server.ts` (AppConfig.boot.server).
 *
 * All are invoked only in homestead-server, whose bundle is built separately
 * and is unaffected. A handler that strays outside these naming conventions
 * silently ships to the browser, so keep server-only code under `methods/`,
 * `crons/`, `syncs/`, or `migrations/`, or in a `.server` module.
 */
function stubServerOnlyModules(): Plugin {
  const SERVER_ONLY_RE =
    /homestead-(?:apps|core)[/\\].*(?:[/\\](?:methods|crons|syncs|migrations)[/\\][^/\\]+|\.server\.[jt]sx?)$/;
  return {
    name: 'homestead:stub-server-only',
    enforce: 'pre',
    apply: 'build',
    async resolveId(source, importer, options) {
      if (!importer) return null;
      const resolved = await this.resolve(source, importer, {
        ...options,
        skipSelf: true,
      });
      if (resolved && SERVER_ONLY_RE.test(resolved.id)) return SERVER_STUB_ID;
      return null;
    },
    load(id) {
      if (id === SERVER_STUB_ID) {
        return 'export default function serverOnlyStub() {\n  throw new Error("server-only module invoked in the browser bundle");\n}\n';
      }
      return null;
    },
  };
}

/** Read git metadata at build time; tolerate a missing/shallow .git. */
function git(args: string): string {
  try {
    return execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
}

const commitHash = git('rev-parse HEAD');
const commitDate = git('log -1 --pretty=format:%cI');
const commitMessage = git('log -1 --pretty=format:%s');

const srcDir = fileURLToPath(new URL('./src', import.meta.url));
// The launcher's build pipeline points HOMESTEAD_CONFIG at the operator's
// project config; the default covers the workspace layout.
const configPath =
  process.env.HOMESTEAD_CONFIG ??
  fileURLToPath(new URL('../../homestead.config.ts', import.meta.url));
const projectRoot = dirname(configPath);
// `@homestead-project` aliases the operator's project root, so apps can glob
// project-relative paths (`@homestead-project/documents/types/*.ts`) without
// any app-specific alias. Auto-discovered apps don't go through it — they can
// live outside the project (HOMESTEAD_APPS_DIRS), so the boot shim imports
// them from the `virtual:homestead-discovered-apps` module instead.
const appDirs = projectAppsDirs(projectRoot);

export default defineConfig(({ mode }) => ({
  plugins: [
    stubServerOnlyModules(),
    discoveredApps(projectRoot),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': srcDir,
      '@homestead/config': configPath,
      '@homestead-project': projectRoot,
    },
  },
  server: {
    fs: {
      // Explicit allow replaces Vite's default, so keep the workspace root
      // (covers the repo checkout) and add the operator's project dir plus
      // every app dir (the config and the apps live outside this package,
      // and an app dir need not sit inside the project at all).
      allow: [searchForWorkspaceRoot(srcDir), projectRoot, ...appDirs],
    },
  },
  // Keep the existing `process.env.*` reads in shared packages working in
  // the browser (and identical under Bun, where process.env is real). The
  // commit metadata is baked in at build time.
  define: {
    'process.env.NODE_ENV': JSON.stringify(
      mode === 'production' ? 'production' : 'development',
    ),
    'process.env.NEXT_PUBLIC_COMMIT_HASH': JSON.stringify(commitHash),
    'process.env.NEXT_PUBLIC_COMMIT_DATE': JSON.stringify(commitDate),
    'process.env.NEXT_PUBLIC_COMMIT_MESSAGE': JSON.stringify(commitMessage),
    'process.env.NEXT_PUBLIC_BUILD_ID': JSON.stringify(commitHash),
    // Bake the public VAPID key into the browser bundle. The legacy
    // NEXT_PUBLIC_VAPID_PUBLIC_KEY is still honored as a fallback so existing
    // .env files keep working.
    'process.env.VAPID_PUBLIC_KEY': JSON.stringify(
      process.env.VAPID_PUBLIC_KEY ??
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ??
        '',
    ),
  },
  // No dev proxy: in dev, Vite runs in middleware mode inside
  // homestead-server (see packages/homestead-server/src/dev-vite.ts), which
  // serves /api/* and /oauth/* itself. The `server` block above only widens
  // fs access for the out-of-root config + app dirs.
  build: {
    // Built SPA. The launcher overrides --outDir into its build cache
    // (spa-build.ts); `make build` uses this default. Sourcemaps stay off in
    // prod builds — flip on locally if you need to debug one.
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
  },
}));
