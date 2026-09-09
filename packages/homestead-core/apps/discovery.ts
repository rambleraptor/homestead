/**
 * App auto-discovery helpers.
 *
 * Operators can drop an app under `apps/<dir>/` with an
 * `app.homestead.ts` file default-exporting its `AppConfig`; the SPA
 * picks those up at build time (`import.meta.glob` in the boot shim)
 * and the server at boot (`server/app-discovery.ts`). Both sides
 * funnel what they find through these helpers so validation and merge
 * semantics can't drift.
 *
 * Browser-safe: no fs access here — callers hand in already-loaded
 * modules.
 */

import type { AppConfig } from './types';
import { logger } from '../utils/logger';

/**
 * Validate a discovered module's default export and return it as an
 * `AppConfig`. Discovery hands in untyped modules (Vite glob records,
 * dynamic imports), so a malformed `app.homestead.ts` fails here with
 * the offending file path in the message.
 */
export function assertDiscoveredApp(
  mod: unknown,
  sourcePath: string,
): AppConfig {
  const def = (mod as { default?: unknown } | null | undefined)?.default;
  if (def === undefined) {
    throw new Error(
      `${sourcePath} must default-export its AppConfig (\`export default myApp\`)`,
    );
  }
  const app = def as Partial<AppConfig>;
  if (
    typeof def !== 'object' ||
    def === null ||
    typeof app.id !== 'string' ||
    // `web` is optional (headless apps omit it), but when present it must be
    // an object, and a `basePath` override — itself optional, the path is
    // derived from the id — must be a string.
    (app.web !== undefined &&
      (typeof app.web !== 'object' ||
        app.web === null ||
        (app.web.basePath !== undefined && typeof app.web.basePath !== 'string')))
  ) {
    throw new Error(
      `${sourcePath}: default export is not an AppConfig (expected an object with a string \`id\`, and an object \`web\` — with a string \`basePath\` if one is declared — when \`web\` is present)`,
    );
  }
  return def as AppConfig;
}

/**
 * Merge auto-discovered apps into the operator's explicit
 * `homestead.config.ts` list. The explicit entry wins on an id
 * collision, so an operator who already imported `./apps/<dir>` into
 * the config keeps working unchanged — with a warning that the manual
 * wiring is now redundant. Discovery can span several directories
 * (`HOMESTEAD_APPS_DIRS`), so two discovered apps can collide too; the
 * first one found wins, following the order of the directory list.
 */
export function mergeDiscoveredApps(
  explicit: AppConfig[],
  discovered: AppConfig[],
): AppConfig[] {
  const fromConfig = new Set(explicit.map((m) => m.id));
  const seen = new Set(fromConfig);
  const merged = [...explicit];
  for (const app of discovered) {
    if (fromConfig.has(app.id)) {
      logger.warn(
        `App "${app.id}" is auto-discovered and also listed in homestead.config.ts; using the config entry. The manual import can be removed.`,
        { appId: app.id },
      );
      continue;
    }
    if (seen.has(app.id)) {
      logger.warn(
        `App "${app.id}" was auto-discovered from more than one app directory; keeping the first one found.`,
        { appId: app.id },
      );
      continue;
    }
    seen.add(app.id);
    merged.push(app);
  }
  return merged;
}
