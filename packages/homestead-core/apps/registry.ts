/**
 * App Registry
 *
 * The list of apps served by an instance lives in the operator's
 * `homestead.config.ts`. The frontend boot calls
 * {@link initializeAppRegistry} once with the full app list; every
 * helper here reads from the resulting singleton.
 *
 * This file deliberately imports zero `AppConfig` instances of its own:
 * the always-installed core apps (settings/users/superuser) are
 * passed in by the consumer. That keeps `import` of this app a
 * zero-cost type-only operation, which matters for test mocking — eager
 * loading of app components would freeze hook bindings before a test
 * file's `vi.mock` calls could take effect.
 *
 * Nested apps: a parent app can declare `children: AppConfig[]`
 * to group related sub-features (e.g. `gamesApp` owns `minigolf`,
 * `pictionary`, `bridge`). Only the parent goes in the config list; the
 * registry walks `children` for route/widget aggregation, validation,
 * `app-flags` schema generation, and `getApp(id)` lookups, so a
 * nested app gets its own `enabled` flag (and any other declared
 * flags) and can be gated independently of its parent.
 */

import type {
  DashboardWidget,
  AppConfig,
  AppFlagDef,
  AppRegistry,
  AppRoute,
  UserSettingDef,
} from './types';
import type { CronHook } from './cron';
import type { Migration } from './migrations';
import type { ResourceSync } from './sync';
import type {
  ResourceCustomMethod,
  ResourceDefinition,
} from '../resources/types';
import type { BulkImportDef } from '../resources/bulk-import/types';
import type { BulkExportDef } from '../resources/bulk-export/types';
import { logger } from '../utils/logger';
import {
  appBasePath,
  firstSegment,
  isUrlSafeAppId,
  RESERVED_ROUTE_SEGMENTS,
  resolveAppPaths,
} from './paths';

class AppRegistryImpl implements AppRegistry {
  apps: AppConfig[];

  constructor(apps: AppConfig[]) {
    // Fill in every app's derived `web.basePath` (see `apps/paths.ts`) so
    // consumers never have to derive one themselves, then sort by navOrder.
    this.apps = resolveAppPaths(apps).sort(
      (a, b) => (a.web?.navOrder || 100) - (b.web?.navOrder || 100),
    );

    this.validateApps();
  }

  /**
   * Validate IDs, base paths, and parent/child relationships across
   * the whole tree. Walks `children` recursively so nested apps
   * share the same id/path namespace as top-level apps.
   *
   * Paths are derived from ids, so most of the path checks can only trip
   * on an explicit `web.basePath` override; the id checks are what keep the
   * derived paths well-formed.
   */
  private validateApps(): void {
    const ids = new Set<string>();
    const paths = new Set<string>();

    const visit = (mod: AppConfig, parent: AppConfig | null): void => {
      const duplicateId = ids.has(mod.id);
      if (duplicateId) {
        logger.warn(`Duplicate app ID detected: ${mod.id}`, { appId: mod.id });
      }
      ids.add(mod.id);

      if (!isUrlSafeAppId(mod.id)) {
        logger.warn(
          `App id "${mod.id}" is not URL-safe (use lowercase letters, digits, "-" or "_"); it is also the app's route segment`,
          { appId: mod.id },
        );
      }

      // Headless apps (no `web`) have no base path, so skip all
      // path-shape and nesting checks for them.
      if (mod.web) {
        const basePath = appBasePath(mod);
        const explicit = mod.web.basePath !== undefined && mod.web.basePath !== basePath;

        // A duplicate id already implies a duplicate derived path; don't
        // report the same collision twice.
        if (paths.has(basePath) && !duplicateId) {
          logger.warn(
            `Duplicate base path detected: ${basePath} (declared by app "${mod.id}")`,
            { appId: mod.id, basePath },
          );
        }
        paths.add(basePath);

        if (!basePath.startsWith('/')) {
          logger.warn(`App "${mod.id}" base path should start with /`, {
            appId: mod.id,
            basePath,
          });
        }

        if (!parent && RESERVED_ROUTE_SEGMENTS.includes(firstSegment(basePath))) {
          logger.warn(
            `App "${mod.id}" base path "${basePath}" is reserved for the server or the SPA shell and will never render; ` +
              (explicit
                ? 'choose a different web.basePath'
                : 'declare an explicit web.basePath for this app'),
            { appId: mod.id, basePath },
          );
        }

        if (parent?.web) {
          const parentPath = appBasePath(parent);
          if (!basePath.startsWith(parentPath + '/')) {
            logger.warn(
              `Child app "${mod.id}" base path "${basePath}" must be nested under parent "${parent.id}" (${parentPath})`,
              { appId: mod.id, parentId: parent.id },
            );
          }
        }
      }

      for (const child of mod.children ?? []) {
        visit(child, mod);
      }
    };

    for (const mod of this.apps) {
      visit(mod, null);
    }
  }

  /**
   * Get a specific app by ID. Walks `children` so nested apps
   * are reachable; their flags live in the same id namespace as their
   * parents, so flag consumers (and the Flag Management UI) need to
   * resolve a child's `AppConfig` to render its name and metadata.
   */
  getApp(id: string): AppConfig | undefined {
    const visit = (mod: AppConfig): AppConfig | undefined => {
      if (mod.id === id) return mod;
      for (const child of mod.children ?? []) {
        const hit = visit(child);
        if (hit) return hit;
      }
      return undefined;
    };
    for (const mod of this.apps) {
      const hit = visit(mod);
      if (hit) return hit;
    }
    return undefined;
  }

  /**
   * Get apps that should appear in the sidebar navigation
   */
  getNavigationApps(): AppConfig[] {
    return this.apps.filter(
      (m) => !!m.web && m.web.showInNav !== false && m.web.placement !== 'topbar',
    );
  }

  /**
   * Get apps that should render as icon buttons in the top bar.
   * Already sorted by navOrder (the constructor sorts the full list).
   */
  getTopBarApps(): AppConfig[] {
    return this.apps.filter(
      (m) => m.web?.placement === 'topbar' && m.web.showInNav !== false,
    );
  }

  /**
   * Get all routes from all apps, including nested children.
   */
  getAllRoutes(): AppRoute[] {
    const collect = (mod: AppConfig): AppRoute[] => [
      ...(mod.web?.routes ?? []),
      ...(mod.children ?? []).flatMap(collect),
    ];
    return this.apps.flatMap(collect);
  }

  /**
   * Get app statistics
   */
  getStats() {
    return {
      total: this.apps.length,
      inNavigation: this.apps.filter((m) => !!m.web && m.web.showInNav !== false).length,
    };
  }
}

let _appRegistry: AppRegistryImpl | undefined;

/**
 * Initialize the app registry. Must be called once at app startup,
 * before any helper below is invoked. The frontend's
 * `src/apps/registry.ts` shim handles this side effect on import.
 *
 * Pass the operator-supplied app list. The shim is also responsible
 * for prepending the always-installed core apps (settings, users,
 * superuser); this file does not pull them in by name so test setup can
 * boot the registry without dragging every app's component tree
 * into the app cache.
 *
 * Idempotent across hot-reloads in dev (overwrites the singleton).
 * Tests can call this to install a synthetic config.
 */
export function initializeAppRegistry(apps: AppConfig[]): void {
  _appRegistry = new AppRegistryImpl(apps);
}

/**
 * Reset the singleton. Test-only — used by suites that want to
 * verify behaviour before {@link initializeAppRegistry} runs.
 */
export function resetAppRegistry(): void {
  _appRegistry = undefined;
}

/**
 * Singleton accessor. Throws if {@link initializeAppRegistry} has
 * not been called yet — that almost always means an import order bug
 * (the frontend bootstrap must run before any app-registry helper).
 */
export function getAppRegistry(): AppRegistryImpl {
  if (!_appRegistry) {
    throw new Error(
      'App registry not initialized. The app shim at ' +
        '`packages/homestead-app/src/apps/registry.ts` must run before any ' +
        'registry helper is called.',
    );
  }
  return _appRegistry;
}

/**
 * Singleton instance of the app registry. Lazy-resolved so the
 * value is read after {@link initializeAppRegistry} runs.
 */
export const appRegistry: AppRegistry = {
  get apps() {
    return getAppRegistry().apps;
  },
  getApp: (id) => getAppRegistry().getApp(id),
  getNavigationApps: () => getAppRegistry().getNavigationApps(),
  getTopBarApps: () => getAppRegistry().getTopBarApps(),
};

/**
 * Helper function to get all apps
 */
export function getAllApps(): AppConfig[] {
  return getAppRegistry().apps;
}

/**
 * Helper function to get app by ID
 */
export function getAppById(id: string): AppConfig | undefined {
  return getAppRegistry().getApp(id);
}

/**
 * Helper function to get apps for navigation
 */
export function getNavigationApps(): AppConfig[] {
  return getAppRegistry().getNavigationApps();
}

/**
 * Helper function to get apps placed on the top bar
 */
export function getTopBarApps(): AppConfig[] {
  return getAppRegistry().getTopBarApps();
}

/**
 * Helper function to get all routes
 */
export function getAllRoutes(): AppRoute[] {
  return getAppRegistry().getAllRoutes();
}

/**
 * Helper function to check if an app exists
 */
export function appExists(id: string): boolean {
  return getAppRegistry().getApp(id) !== undefined;
}

/**
 * A widget paired with the id of the app that declared it. The
 * appId rides along so consumers (dashboard, widget settings) can
 * gate visibility through `useAppEnabledPredicate` without having
 * to maintain a separate widget→app index.
 */
export type RegisteredDashboardWidget = DashboardWidget & {
  appId: string;
};

/**
 * Collect all dashboard widgets contributed by registered apps,
 * sorted by their declared `order` (default 100). Each widget is
 * tagged with its owning app id so consumers can filter out
 * widgets for apps the current viewer can't access.
 */
export function getAllDashboardWidgets(): RegisteredDashboardWidget[] {
  const collect = (mod: AppConfig): RegisteredDashboardWidget[] => [
    ...(mod.web?.widgets ?? []).map((w) => ({ ...w, appId: mod.id })),
    ...(mod.children ?? []).flatMap(collect),
  ];
  return getAppRegistry()
    .apps.flatMap(collect)
    .sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
}

/**
 * Collect every declared flag across all registered apps — top-level and
 * nested — keyed by app id. Consumed by the settings UI, the aepbase schema
 * syncer, and the `useAppFlag` hook.
 *
 * Apps declare their own feature flags; there are no auto-injected flags. (App
 * *audience* used to be an injected `enabled`/`enabled_tags` flag pair; that
 * per-app gate was retired in favor of the permission system.)
 */
export function getAllAppFlagDefs(): Record<
  string,
  Record<string, AppFlagDef>
> {
  const out: Record<string, Record<string, AppFlagDef>> = {};
  const visit = (mod: AppConfig): void => {
    out[mod.id] = { ...(mod.flags ?? {}) };
    for (const child of mod.children ?? []) {
      visit(child);
    }
  };
  for (const mod of getAppRegistry().apps) {
    visit(mod);
  }
  return out;
}

/**
 * Collect every declared per-user setting across all registered
 * apps — top-level and nested — keyed by app id. Consumed by
 * the user-settings schema syncer and the `useUserSetting` hook.
 *
 * Unlike {@link getAllAppFlagDefs}, there is no built-in setting:
 * per-user audience gating is irrelevant (the `enabled` flag already
 * lives at the app-flag layer).
 */
export function getAllUserSettingDefs(): Record<
  string,
  Record<string, UserSettingDef>
> {
  const out: Record<string, Record<string, UserSettingDef>> = {};
  const visit = (mod: AppConfig): void => {
    const declared = mod.userSettings;
    if (declared && Object.keys(declared).length > 0) {
      out[mod.id] = { ...declared };
    }
    for (const child of mod.children ?? []) {
      visit(child);
    }
  };
  for (const mod of getAppRegistry().apps) {
    visit(mod);
  }
  return out;
}

/**
 * Collect apps that should appear on the user Settings page —
 * either because they declare per-user settings or because they
 * supply a custom `settingsWidget`. Returns apps in nav order so
 * the page renders deterministically.
 */
export function getAllSettingsWidgets(): {
  appId: string;
  app: AppConfig;
}[] {
  const out: { appId: string; app: AppConfig }[] = [];
  const visit = (mod: AppConfig): void => {
    const hasSettings =
      !!mod.web?.settingsWidget ||
      (mod.userSettings && Object.keys(mod.userSettings).length > 0);
    if (hasSettings) {
      out.push({ appId: mod.id, app: mod });
    }
    for (const child of mod.children ?? []) {
      visit(child);
    }
  };
  for (const mod of getAppRegistry().apps) {
    visit(mod);
  }
  return out;
}

/**
 * Collect every aepbase resource definition declared by registered
 * apps — top-level and nested. Consumed by the instrumentation
 * hook to push schemas to aepbase on server boot, and by the e2e
 * bootstrap. Order matches app registration; the runner topo-sorts
 * by `parents` before applying.
 */
/** Resolve an app's `resources`, which may be a thunk (see {@link AppConfig}). */
export function resolveResources(mod: AppConfig): ResourceDefinition[] {
  return typeof mod.resources === 'function' ? mod.resources() : (mod.resources ?? []);
}

export function getAllResourceDefs(): ResourceDefinition[] {
  const out: ResourceDefinition[] = [];
  const visit = (mod: AppConfig): void => {
    for (const def of resolveResources(mod)) {
      out.push(def);
    }
    for (const child of mod.children ?? []) {
      visit(child);
    }
  };
  for (const mod of getAppRegistry().apps) {
    visit(mod);
  }
  return out;
}

/**
 * Same traversal as {@link getAllResourceDefs}, but pairs each
 * definition with the owning app so callers can read `app.id` while
 * iterating. Used by the offline mutation factory's auto-registration loop.
 */
export function getAllResourceDefsWithApp(): {
  app: AppConfig;
  def: ResourceDefinition;
}[] {
  const out: { app: AppConfig; def: ResourceDefinition }[] = [];
  const visit = (mod: AppConfig): void => {
    for (const def of resolveResources(mod)) {
      out.push({ app: mod, def });
    }
    for (const child of mod.children ?? []) {
      visit(child);
    }
  };
  for (const mod of getAppRegistry().apps) {
    visit(mod);
  }
  return out;
}

/**
 * Resolve a single AEP-136 custom method by `(plural, verb)`. Scans every
 * declared resource definition (top-level and nested) for one whose plural
 * matches and that declares the verb under `customMethods`. Used by the
 * sidecar's `/api/aep` gateway to dispatch `POST /<plural>:<verb>` calls.
 */
export function getResourceCustomMethod(
  plural: string,
  verb: string,
): ResourceCustomMethod | undefined {
  for (const def of getAllResourceDefs()) {
    if (def.plural === plural) {
      const method = def.customMethods?.[verb];
      if (method) return method;
    }
  }
  return undefined;
}

/**
 * Collect every declared custom method across all registered resources,
 * flattened to a `${plural}:${verb}` key. Useful for diagnostic UIs,
 * the CLI, and tests.
 */
export function getAllResourceCustomMethods(): Record<string, ResourceCustomMethod> {
  const out: Record<string, ResourceCustomMethod> = {};
  for (const def of getAllResourceDefs()) {
    for (const [verb, method] of Object.entries(def.customMethods ?? {})) {
      out[`${def.plural}:${verb}`] = method;
    }
  }
  return out;
}

/**
 * A cron hook paired with the id of the app that declared it. The appId
 * rides along so the scheduler can label log output and hand it to the
 * handler's context without a separate hook→app index.
 */
export type RegisteredCronHook = CronHook & { appId: string };

/**
 * Collect every cron hook declared by registered apps — top-level and
 * nested. Consumed by the server's scheduler on boot. Ids must be unique
 * across all apps: a hook whose id was already seen is dropped with a
 * warning, as is one that doesn't declare exactly one valid schedule (a
 * positive `intervalSeconds` or a `dailyAtHour` in 0–23), so the scheduler
 * never sets up a broken or ambiguous timer.
 */
export function getAllCronHooks(): RegisteredCronHook[] {
  const out: RegisteredCronHook[] = [];
  const seen = new Set<string>();
  const visit = (mod: AppConfig): void => {
    for (const hook of mod.crons ?? []) {
      if (seen.has(hook.id)) {
        logger.warn(
          `Duplicate cron hook id "${hook.id}" (app "${mod.id}") ignored`,
          { appId: mod.id, hookId: hook.id },
        );
        continue;
      }
      const hasInterval = hook.intervalSeconds !== undefined;
      const hasDaily = hook.dailyAtHour !== undefined;
      if (hasInterval === hasDaily) {
        logger.warn(
          `Cron hook "${hook.id}" (app "${mod.id}") must declare exactly one of intervalSeconds or dailyAtHour; ignored`,
          { appId: mod.id, hookId: hook.id },
        );
        continue;
      }
      if (hasInterval && !(hook.intervalSeconds! > 0)) {
        logger.warn(
          `Cron hook "${hook.id}" (app "${mod.id}") has a non-positive intervalSeconds; ignored`,
          { appId: mod.id, hookId: hook.id },
        );
        continue;
      }
      if (
        hasDaily &&
        !(Number.isInteger(hook.dailyAtHour) && hook.dailyAtHour! >= 0 && hook.dailyAtHour! <= 23)
      ) {
        logger.warn(
          `Cron hook "${hook.id}" (app "${mod.id}") has a dailyAtHour outside 0–23; ignored`,
          { appId: mod.id, hookId: hook.id },
        );
        continue;
      }
      seen.add(hook.id);
      out.push({ ...hook, appId: mod.id });
    }
    for (const child of mod.children ?? []) {
      visit(child);
    }
  };
  for (const mod of getAppRegistry().apps) {
    visit(mod);
  }
  return out;
}

/**
 * A migration paired with the id of the app that declared it. The appId rides
 * along so the runner can label log output and hand it to the handler's
 * context without a separate migration→app index.
 */
export type RegisteredMigration = Migration & { appId: string };

/**
 * Collect every data migration declared by registered apps — top-level and
 * nested — in declaration order. Consumed by the server's migration runner on
 * boot. Ids must be unique across all apps: a migration whose id was already
 * seen is dropped with a warning, so the ledger key stays unambiguous.
 */
export function getAllMigrations(): RegisteredMigration[] {
  const out: RegisteredMigration[] = [];
  const seen = new Set<string>();
  const visit = (mod: AppConfig): void => {
    for (const migration of mod.migrations ?? []) {
      if (seen.has(migration.id)) {
        logger.warn(
          `Duplicate migration id "${migration.id}" (app "${mod.id}") ignored`,
          { appId: mod.id, migrationId: migration.id },
        );
        continue;
      }
      seen.add(migration.id);
      out.push({ ...migration, appId: mod.id });
    }
    for (const child of mod.children ?? []) {
      visit(child);
    }
  };
  for (const mod of getAppRegistry().apps) {
    visit(mod);
  }
  return out;
}

/**
 * A resource sync paired with the id of the app that declared it. The appId
 * rides along so the dispatcher can label log output and hand it to the
 * handler's context without a separate sync→app index.
 */
export type RegisteredResourceSync = ResourceSync & { appId: string };

/**
 * Collect every resource sync declared by registered apps — top-level and
 * nested — in declaration order. Consumed by the server's sync dispatcher on
 * boot. Ids must be unique across all apps: a sync whose id was already seen is
 * dropped with a warning, as is one missing an `id` or a `resource`, so the
 * dispatcher never wires up an ambiguous or unroutable mirror.
 *
 * The target `resource` is *not* checked for existence here — that needs the
 * full resource universe, which is assembled at server boot. `startServer`
 * validates every aggregated sync's `resource` (via `validateSyncResources`)
 * and fails fast on an unknown one.
 */
export function getAllResourceSyncs(): RegisteredResourceSync[] {
  const out: RegisteredResourceSync[] = [];
  const seen = new Set<string>();
  const visit = (mod: AppConfig): void => {
    for (const sync of mod.syncs ?? []) {
      if (!sync.id || !sync.resource) {
        logger.warn(
          `Resource sync (app "${mod.id}") missing id or resource; ignored`,
          { appId: mod.id, syncId: sync.id },
        );
        continue;
      }
      if (seen.has(sync.id)) {
        logger.warn(
          `Duplicate resource sync id "${sync.id}" (app "${mod.id}") ignored`,
          { appId: mod.id, syncId: sync.id },
        );
        continue;
      }
      seen.add(sync.id);
      out.push({ ...sync, appId: mod.id });
    }
    for (const child of mod.children ?? []) {
      visit(child);
    }
  };
  for (const mod of getAppRegistry().apps) {
    visit(mod);
  }
  return out;
}

/**
 * Resolve a resource's bulk-import declaration by plural, if it has one.
 *
 * Kept here (rather than beside the synthesized custom method in
 * `core/server/bulk-import`) because it's a pure registry read: the discovery
 * endpoint needs the format metadata, and tests need it without a server.
 */
export function getResourceBulkImport(
  plural: string,
): BulkImportDef | undefined {
  for (const def of getAllResourceDefs()) {
    if (def.plural === plural && def.bulkImport) return def.bulkImport;
  }
  return undefined;
}

/**
 * Every resource that opts into bulk import, keyed by plural. Backs the
 * discovery endpoint's format listing and the CLI's help output.
 */
export function getAllResourceBulkImports(): Record<string, BulkImportDef> {
  const out: Record<string, BulkImportDef> = {};
  for (const def of getAllResourceDefs()) {
    if (def.bulkImport) out[def.plural] = def.bulkImport;
  }
  return out;
}

/**
 * Resolve a resource's bulk-export declaration by plural, if it has one. The
 * mirror of {@link getResourceBulkImport}: a pure registry read the discovery
 * endpoint and the shared handler both use.
 */
export function getResourceBulkExport(
  plural: string,
): BulkExportDef | undefined {
  for (const def of getAllResourceDefs()) {
    if (def.plural === plural && def.bulkExport) return def.bulkExport;
  }
  return undefined;
}

/**
 * Every resource that opts into bulk export, keyed by plural. Backs the
 * discovery endpoint's format listing and the CLI's help output.
 */
export function getAllResourceBulkExports(): Record<string, BulkExportDef> {
  const out: Record<string, BulkExportDef> = {};
  for (const def of getAllResourceDefs()) {
    if (def.bulkExport) out[def.plural] = def.bulkExport;
  }
  return out;
}

/**
 * Default export retained for callers that imported the registry
 * object directly. Prefer the named helpers above for new code.
 */
export default appRegistry;
