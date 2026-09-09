/**
 * App System Types
 *
 * This file defines the contract that every app must follow.
 * All apps registered in the system must implement the AppConfig interface.
 */

import type { ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { AppFilterDecl } from '../shared/filters/types';
import type { ResourceDefinition } from '../resources/types';
import type { CronHook } from './cron';
import type { Migration } from './migrations';
import type { ResourceSync } from './sync';

export type { CronContext, CronHandler, CronHook } from './cron';
export type { MigrationContext, MigrationHandler, Migration } from './migrations';
export type { SyncContext, SyncHandler, SyncEvent, ResourceSync } from './sync';

/**
 * A lazily-loaded React component. The thunk resolves to either a module
 * namespace with a `default` export or the component itself, so both
 * `() => import('./Foo')` (default export) and
 * `() => import('./Foo').then(m => m.Foo)` (named export) are valid.
 *
 * Declaring components this way keeps `app.config.ts` free of eager
 * React/component imports: client consumers wrap the thunk in
 * `React.lazy` (see `apps/lazy.tsx`) and the catch-all server route
 * resolves it with `await`. This both enables per-app code-splitting
 * and lets a non-React consumer import a config without dragging the
 * component graph (and its browser-only side effects) into scope.
 */
export type LazyComponent<P = unknown> = () => Promise<
  { default: ComponentType<P> } | ComponentType<P>
>;

/**
 * A lazily-loaded Lucide icon. Resolves directly to the icon component,
 * e.g. `() => import('lucide-react').then(m => m.ShoppingCart)`.
 */
export type LazyIcon = () => Promise<LucideIcon>;

/**
 * A widget an app contributes to the dashboard. The component is
 * responsible for its own data fetching and chrome (typically a
 * `SectionCard`); the dashboard just lays widgets out in `order`.
 */
export interface DashboardWidget {
  /** Stable id, unique across all apps. */
  id: string;
  /**
   * Human-readable label shown in the dashboard customization UI.
   * Falls back to `id` when omitted.
   */
  label?: string;
  /** Self-contained widget component (lazily loaded). Receives no props. */
  component: LazyComponent;
  /** Lower numbers render first. Defaults to 100. */
  order?: number;
}

/**
 * Props passed to a route's component when the catch-all router renders it.
 * `params` carries values captured from `:name` segments in `AppRoute.path`.
 * Optional so components that don't take params (the common case) can be
 * assigned directly without a wrapping adapter.
 */
export interface AppRouteProps {
  params?: Record<string, string>;
}

/**
 * Route definition consumed by the single catch-all renderer at
 * `app/(app)/[[...slug]]/page.tsx`. The component is declared inline so a
 * app is fully self-describing — no per-route page file is needed.
 */
export interface AppRoute {
  /**
   * Path relative to the app's basePath. Empty string for the index
   * route. Use `:name` segments for dynamic params (e.g. `:id`).
   */
  path: string;

  /**
   * Whether this is the index route
   */
  index?: boolean;

  /**
   * Component rendered at this route (lazily loaded). Receives resolved
   * `:name` params.
   */
  component: LazyComponent<AppRouteProps>;

  /**
   * Optional gates wrapping the component. Names resolve to wrapper
   * components in `homestead-core/apps/router/gates`. The parameterized
   * `permission:<verb>:<resourceType>` form guards on `can(verb, resourceType)`.
   */
  gates?: Array<'superuser' | `permission:${'read' | 'write' | 'manage'}:${string}`>;

  /**
   * True when the path uses dynamic params (`:id`) and should not be
   * statically prerendered by `generateStaticParams`.
   */
  dynamic?: boolean;
}

/**
 * Web / presentation configuration for an app: how it surfaces in the
 * browser (routing, navigation placement, the UI surfaces it
 * contributes) plus its client-side offline-mutation overrides.
 */
export interface AppWebConfig {
  /**
   * Lucide icon for navigation (lazily loaded). Client consumers render
   * it via `<AppIcon icon={...} />`.
   */
  icon: LazyIcon;

  /**
   * URL prefix for the app's routes. **Derived — leave it out.** A top-level
   * app lives at `/<id>` and a child app at `<parent path>/<id>`, so `id:
   * 'gift-cards'` serves `/gift-cards` and the `minigolf` child of `games`
   * serves `/games/minigolf`. Ids are unique across the registry, so derived
   * paths can't collide and always nest correctly.
   *
   * Declare it only when the id genuinely can't be the URL — e.g. the Health
   * app can't use `/health`, which the server answers as its readiness probe
   * (see `RESERVED_ROUTE_SEGMENTS` in `apps/paths.ts`). An override must
   * start with `/`, and a child's override must sit under its parent's path.
   * Read the resolved value with `appBasePath(app)` from `apps/paths.ts`.
   */
  basePath?: string;

  /**
   * Route definitions for this app. Each `path` is relative to the app's
   * (derived) base path.
   */
  routes: AppRoute[];

  /**
   * Optional custom icon used when this app is added to a device's home
   * screen (PWA install). A URL/path to a square raster image (PNG, ideally
   * 512×512). When set, navigating anywhere within this app swaps the
   * document's `apple-touch-icon` and web app manifest so an "Add to Home
   * Screen" uses this image — and the app's own name and start path —
   * instead of the shared Homestead icon. Apps that omit it fall back to the
   * global Homestead home-screen icon.
   *
   * Example: `homeScreenIcon: '/app-icons/groceries.png'`
   */
  homeScreenIcon?: string;

  /**
   * Whether this app should appear in the main navigation
   * @default true
   */
  showInNav?: boolean;

  /**
   * Where the app's nav entry renders. 'sidebar' (the default) places it
   * in the left navigation; 'topbar' renders an icon-only button in the
   * Header instead. Topbar apps never appear in the sidebar;
   * `showInNav: false` hides the app from both surfaces.
   * @default 'sidebar'
   */
  placement?: 'topbar' | 'sidebar';

  /**
   * Optional badge rendered inside the app's top-bar button (only
   * meaningful with `placement: 'topbar'`). Declared as a lazy component
   * rather than a hook — hooks can't be called conditionally and core
   * must not import app code. The component fetches its own data and
   * renders the badge (or null); compose `layout/TopBarBadge` for the
   * standard count pill.
   */
  topBarBadge?: LazyComponent;

  /**
   * Navigation order (lower numbers appear first)
   * @default 100
   */
  navOrder?: number;

  /**
   * Section/category for grouping apps in navigation
   * Apps without a section will be displayed at the end
   */
  section?: string;

  /**
   * Optional filterable fields for the app's list view. A shared
   * `<FilterBar>` renders one input per decl and the list is filtered
   * in-memory client-side — no server round-trip.
   */
  filters?: AppFilterDecl[];

  /**
   * Optional custom React component shown on the user Settings page in
   * place of the auto-generated form. Use this when an app's per-user
   * settings need bespoke UI (e.g. a picker that depends on other
   * resources, or grouped controls). The component receives no props
   * and reads/writes its own state via `useUserSetting`.
   */
  settingsWidget?: LazyComponent;

  /**
   * Optional widgets this app contributes to the dashboard. Each
   * widget is an independent React component that owns its own data
   * fetching and presentation.
   */
  widgets?: DashboardWidget[];
}

/**
 * Core App Configuration
 * Every app must export a config object that implements this interface
 */
export interface AppConfig {
  /**
   * Unique identifier for the app. Lowercase letters, digits, and `-`/`_`
   * only — it doubles as the app's URL segment (`/<id>`), keys its flags and
   * permissions, and must be unique across the whole app tree.
   * Example: 'dashboard', 'chores', 'meal-planner'
   */
  id: string;

  /**
   * Display name shown in navigation and UI
   * Example: 'Dashboard', 'Chores', 'Meal Planner'
   */
  name: string;

  /**
   * Short description of app functionality
   */
  description: string;

  /**
   * Additional app-specific metadata
   */
  metadata?: Record<string, unknown>;

  /**
   * Optional app-scoped flags. Each entry declares a typed knob
   * that a household member can tweak from the settings UI.
   *
   * The registry flattens all declared flags across apps into a
   * single aepbase-backed singleton (`app-flags` resource) whose
   * field names are `${appId_snake}__${key}`.
   */
  flags?: Record<string, AppFlagDef>;

  /**
   * Optional per-user settings owned by this app. Same shape as
   * `flags`, but values are scoped to the signed-in user instead of
   * being household-wide. Declarations are flattened into the
   * `user-preference` resource (one record per user, parented under
   * `/users/{id}/preferences/{id}`) with field names
   * `${appId_snake}__${key}`.
   *
   * The settings page renders a section per app that has either
   * `userSettings` or `web.settingsWidget`. When only `userSettings` is
   * declared, an auto-generated form is rendered.
   */
  userSettings?: Record<string, UserSettingDef>;

  /**
   * Optional aepbase resource definitions owned by this app. The
   * registry aggregates them across all apps (including children)
   * and the Next.js instrumentation hook applies them to aepbase via
   * `/aep-resource-definitions` on server boot. Each `singular` must
   * be globally unique.
   */
  /**
   * Usually a plain array. A thunk is also accepted: it defers construction
   * until {@link getAllResourceDefs} is first called, instead of at module
   * import, for a schema that must be computed lazily. Resolved once per read,
   * so it must stay cheap and pure.
   */
  resources?: ResourceDefinition[] | (() => ResourceDefinition[]);

  /**
   * Server-side endpoints are declared as AEP-136 custom methods on the
   * app's resource definitions (`ResourceDefinition.customMethods`),
   * not on the app itself — they live on the resource they act on and
   * are addressed as `POST /<plural>:<verb>`. See
   * `core/resources/types.ts#ResourceCustomMethod`.
   */

  /**
   * Optional sub-apps. When set, this app is a container —
   * each child's routes are served under the parent's path
   * (`<parent path>/<child id>`), the registry aggregates child routes and
   * dashboard widgets,
   * and a generic `<NestedAppLanding>` renders cards for each
   * child on the parent's index page. Children get their own `enabled`
   * flag (and any other declared flags) and can be reached via
   * `getApp(id)`, so each nested page can be gated independently.
   * Children still stay out of top-level navigation: the parent owns
   * the sidebar placement.
   */
  children?: AppConfig[];

  /**
   * Optional periodic server-side hooks. Each declares a handler the
   * server's scheduler invokes on a fixed interval (see {@link CronHook}).
   * Hooks run headless — the scheduler mints a short-lived admin token per
   * firing — so an app can schedule background work (digests, cleanups,
   * reminders) without any web surface. Aggregated across apps (and nested
   * children) via `getAllCronHooks()` at server boot.
   */
  crons?: CronHook[];

  /**
   * Optional one-shot data migrations this app ships (see {@link Migration}).
   * The server's migration runner applies each pending one exactly once at
   * boot, after the schema sync, and records the outcome in a ledger so a
   * succeeded migration is skipped on every later boot. Use these to backfill a
   * newly-added field, rewrite an enum value, or correct existing rows — the
   * schema sync reconciles a collection's *shape*, migrations reconcile its
   * *data*. Aggregated across apps (and nested children) via
   * `getAllMigrations()`.
   */
  migrations?: Migration[];

  /**
   * Optional resource syncs this app declares (see {@link ResourceSync}). Each
   * names a target resource by `singular` and fires a handler *after* one of
   * that resource's records is created, updated, or deleted, to mirror the
   * change one-way to an external system. Firings are best-effort and
   * asynchronous — the triggering write commits and returns first, then the
   * sync runs out-of-band inside its own AEP-151 operation, so a mirror can
   * never block or fail the write. Because the target is named at the app level
   * (not nested on a `ResourceDefinition`), a sync can watch the built-in
   * `user` resource as well as any app-owned collection. Aggregated across apps
   * (and nested children) via `getAllResourceSyncs()` at server boot.
   */
  syncs?: ResourceSync[];

  /**
   * Web / presentation config: routing, navigation placement, the UI
   * surfaces the app contributes (dashboard widgets, list filters,
   * settings widget), and its offline-mutation overrides.
   *
   * Optional: a "headless" app omits `web` entirely. Such an app
   * contributes no routes, navigation entry, or dashboard widgets — it
   * only declares server-side surfaces (`resources`, `flags`,
   * `userSettings`). The registry skips web-less apps when building
   * navigation, routes, and base-path validation.
   */
  web?: AppWebConfig;
}

/**
 * Runtime value a flag can hold. Matches `AppFlagDef.type`
 * one-to-one — `enum` flags store their selected option as a string.
 */
export type AppFlagValue = string | number | boolean;

/**
 * Declarative description of a single app flag. The settings UI
 * renders the right input widget based on `type`; the aepbase schema
 * syncer converts `type` into a JSON-schema property.
 *
 * `description` is required so the Flag Management admin UI can always
 * show an operator what a flag does before they toggle it.
 */
export type AppFlagDef =
  | {
      type: 'string';
      label: string;
      description: string;
      default?: string;
    }
  | {
      type: 'number';
      label: string;
      description: string;
      default?: number;
    }
  | {
      type: 'boolean';
      label: string;
      description: string;
      default?: boolean;
    }
  | {
      type: 'enum';
      label: string;
      description: string;
      options: readonly string[];
      default?: string;
    };

/**
 * Runtime value a per-user setting can hold. Matches `UserSettingDef.type`
 * one-to-one — `enum` settings store their selected option as a string.
 */
export type UserSettingValue = string | number | boolean;

/**
 * Declarative description of a single per-user app setting.
 * Structurally identical to `AppFlagDef` — the only difference is
 * scope (per-user vs. household). Aliasing avoids drift between the two
 * declaration shapes; the rendering and schema-encoding helpers operate
 * on the same union.
 */
export type UserSettingDef = AppFlagDef;

/**
 * App Registry
 * Central registry of all available apps in the system
 */
export interface AppRegistry {
  apps: AppConfig[];
  getApp: (id: string) => AppConfig | undefined;
  getNavigationApps: () => AppConfig[];
  getTopBarApps: () => AppConfig[];
}

/**
 * Helper type for app component props
 */
export interface AppComponentProps {
  appId?: string;
  [key: string]: unknown;
}

/**
 * App initialization hook result
 */
export interface AppHook<T = unknown> {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}
