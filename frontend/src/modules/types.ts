/**
 * Module System Types
 *
 * This file defines the contract that every module must follow.
 * All modules registered in the system must implement the HomeModule interface.
 */

import type { ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { NextRequest } from 'next/server';
import type { OmniboxAdapter } from '@rambleraptor/homestead-core/shared/omnibox/types';
import type { ModuleFilterDecl } from '@rambleraptor/homestead-core/shared/filters/types';
import type { ResourceDefinition } from '@rambleraptor/homestead-core/resources/types';
import type { ModuleVisibility } from '@rambleraptor/homestead-core/settings/visibility';
import type { ResourceMutationOpts } from '@rambleraptor/homestead-core/api/registerResourceMutationDefaults';

/**
 * A widget a module contributes to the dashboard. The component is
 * responsible for its own data fetching and chrome (typically a
 * `SectionCard`); the dashboard just lays widgets out in `order`.
 */
export interface DashboardWidget {
  /** Stable id, unique across all modules. */
  id: string;
  /**
   * Human-readable label shown in the dashboard customization UI.
   * Falls back to `id` when omitted.
   */
  label?: string;
  /** Self-contained widget component. Receives no props. */
  component: ComponentType;
  /** Lower numbers render first. Defaults to 100. */
  order?: number;
}

/**
 * Props passed to a route's component when the catch-all router renders it.
 * `params` carries values captured from `:name` segments in `ModuleRoute.path`.
 * Optional so components that don't take params (the common case) can be
 * assigned directly without a wrapping adapter.
 */
export interface ModuleRouteProps {
  params?: Record<string, string>;
}

/**
 * Route definition consumed by the single catch-all renderer at
 * `app/(app)/[[...slug]]/page.tsx`. The component is declared inline so a
 * module is fully self-describing — no per-route page file is needed.
 */
export interface ModuleRoute {
  /**
   * Path relative to the module's basePath. Empty string for the index
   * route. Use `:name` segments for dynamic params (e.g. `:id`).
   */
  path: string;

  /**
   * Whether this is the index route
   */
  index?: boolean;

  /**
   * Component rendered at this route. Receives resolved `:name` params.
   */
  component: ComponentType<ModuleRouteProps>;

  /**
   * Optional gates wrapping the component. Names resolve to wrapper
   * components in `@/modules/router/gates`.
   */
  gates?: Array<'enabled' | 'superuser'>;

  /**
   * True when the path uses dynamic params (`:id`) and should not be
   * statically prerendered by `generateStaticParams`.
   */
  dynamic?: boolean;
}

/**
 * Core Module Configuration
 * Every module must export a config object that implements this interface
 */
export interface HomeModule {
  /**
   * Unique identifier for the module (lowercase, no spaces)
   * Example: 'dashboard', 'chores', 'meal_planner'
   */
  id: string;

  /**
   * Display name shown in navigation and UI
   * Example: 'Dashboard', 'Chores', 'Meal Planner'
   */
  name: string;

  /**
   * Short description of module functionality
   */
  description: string;

  /**
   * Lucide icon component for navigation
   */
  icon: LucideIcon;

  /**
   * Base path for module routes (must start with /)
   * Example: '/dashboard', '/chores'
   */
  basePath: string;

  /**
   * Route definitions for this module
   * Routes are now defined by the Next.js App Router file structure
   */
  routes: ModuleRoute[];

  /**
   * Whether this module should appear in the main navigation
   * @default true
   */
  showInNav?: boolean;

  /**
   * Navigation order (lower numbers appear first)
   * @default 100
   */
  navOrder?: number;

  /**
   * Section/category for grouping modules in navigation
   * Modules without a section will be displayed at the end
   */
  section?: string;

  /**
   * Whether this module is enabled
   * Can be used for feature flags
   * @default true
   */
  enabled?: boolean;

  /**
   * Default audience for the built-in `enabled` flag that the registry
   * auto-injects for every module. Controls who can see/use the module
   * until an admin overrides the flag in the Flag Management UI.
   * @default 'all'
   */
  defaultEnabled?: ModuleVisibility;

  /**
   * Additional module-specific metadata
   */
  metadata?: Record<string, unknown>;

  /**
   * Optional declarative integration with the natural-language omnibox
   * (`/search`). When present, the module is discoverable + addressable
   * via the omnibox. See `@rambleraptor/homestead-core/shared/omnibox/types` for the shape.
   */
  omnibox?: OmniboxAdapter;

  /**
   * Optional filterable fields for the module's list view. A shared
   * `<FilterBar>` renders one input per decl and the list is filtered
   * in-memory client-side — no server round-trip. The same decls are
   * forwarded to the omnibox manifest so the LLM can set values.
   */
  filters?: ModuleFilterDecl[];

  /**
   * Optional module-scoped flags. Each entry declares a typed knob
   * that a household member can tweak from the settings UI.
   *
   * The registry flattens all declared flags across modules into a
   * single aepbase-backed singleton (`module-flags` resource) whose
   * field names are `${moduleId_snake}__${key}`.
   */
  flags?: Record<string, ModuleFlagDef>;

  /**
   * Optional aepbase resource definitions owned by this module. The
   * registry aggregates them across all modules (including children)
   * and the Next.js instrumentation hook applies them to aepbase via
   * `/aep-resource-definitions` on server boot. Each `singular` must
   * be globally unique.
   */
  resources?: ResourceDefinition[];

  /**
   * Per-resource overrides applied when the offline mutation factory
   * auto-registers create/update/delete defaults. Key is the resource
   * `singular`. `false` skips auto-registration entirely (escape hatch
   * for modules with bespoke mutation logic). An object merges into
   * `ResourceMutationOpts` — useful for non-standard cache keys,
   * cascade deletes, custom optimistic shapes, or legacy mutation-key
   * aliases during migrations.
   */
  offlineOverrides?: Record<string, ResourceOverride | false>;

  /**
   * Optional widgets this module contributes to the dashboard. Each
   * widget is an independent React component that owns its own data
   * fetching and presentation.
   */
  widgets?: DashboardWidget[];

  /**
   * Optional HTTP workers — module-owned server endpoints, à la
   * Cloudflare Workers. Each entry is mounted at
   * `/api/modules/<moduleId>/<workerName>`; the catch-all dispatcher
   * at `app/api/modules/[moduleId]/[...path]/route.ts` resolves the
   * worker, enforces method + auth, and invokes the lazy-loaded
   * handler. Workers run in-process inside Next.js — they're not
   * isolated like real Cloudflare Workers, just modular.
   */
  workers?: Record<string, ModuleWorker>;

  /**
   * Optional sub-modules. When set, this module is a container —
   * the registry validates each child's `basePath` is a prefix-match
   * of the parent's, aggregates child routes and dashboard widgets,
   * and a generic `<NestedModuleLanding>` renders cards for each
   * child on the parent's index page (and as the omnibox
   * `listComponent`). Children get their own `enabled` flag (and any
   * other declared flags) and can be reached via `getModule(id)`, so
   * each nested page can be gated independently. Children still stay
   * out of top-level navigation: the parent owns the sidebar placement
   * and the omnibox synonyms.
   */
  children?: HomeModule[];
}

/**
 * Per-resource overrides for the offline mutation factory.
 *
 * The factory derives almost everything from convention — list cache key,
 * mutation keys, optimistic shape, request body. Modules only need an
 * override when they have something the convention can't express:
 * `parentPath` for nested resources, `cascadeDelete` for cross-resource
 * effects on delete.
 */
export type ResourceOverride = Partial<
  Pick<ResourceMutationOpts, 'parentPath' | 'cascadeDelete'>
>;

/**
 * Runtime value a flag can hold. Matches `ModuleFlagDef.type`
 * one-to-one — `enum` flags store their selected option as a string.
 */
export type ModuleFlagValue = string | number | boolean;

/**
 * Declarative description of a single module flag. The settings UI
 * renders the right input widget based on `type`; the aepbase schema
 * syncer converts `type` into a JSON-schema property.
 *
 * `description` is required so the Flag Management admin UI can always
 * show an operator what a flag does before they toggle it.
 */
export type ModuleFlagDef =
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
 * HTTP method a module worker accepts. The dispatcher returns 405 if
 * the request method doesn't match.
 */
export type ModuleWorkerMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Authenticated caller info handed to a worker. Mirrors the shape
 * returned by `app/api/_lib/aepbase-server.ts#authenticate` — kept
 * inline here so the module-contract types stay free of server-only
 * runtime imports.
 */
export interface ModuleWorkerAuth {
  token: string;
  user: {
    id: string;
    path: string;
    email: string;
    display_name?: string;
    type?: string;
  };
}

/**
 * Context passed to a worker handler when the dispatcher invokes it.
 */
export interface ModuleWorkerContext {
  request: NextRequest;
  /**
   * Authenticated caller. Always set when the worker requires auth
   * (the default); only `null` for workers declared with
   * `requireAuth: false`.
   */
  auth: ModuleWorkerAuth | null;
  moduleId: string;
  workerName: string;
}

export type ModuleWorkerHandler = (
  ctx: ModuleWorkerContext,
) => Promise<Response>;

/**
 * Declarative definition of a single module worker.
 *
 * The handler is referenced via a lazy `import()` so the runtime
 * code stays out of the client bundle when `module.config.ts` is
 * loaded by client components.
 *
 * @example
 *   workers: {
 *     'process-image': {
 *       method: 'POST',
 *       load: () => import('./workers/process-image'),
 *     },
 *   }
 */
export interface ModuleWorker {
  /** HTTP method this worker accepts. Defaults to `'POST'`. */
  method?: ModuleWorkerMethod;
  /**
   * Whether the dispatcher should require an authenticated caller
   * before invoking the handler. Defaults to `true`.
   */
  requireAuth?: boolean;
  /**
   * Lazy import of the handler module. The dispatcher awaits this
   * on demand and invokes the default export.
   */
  load: () => Promise<{ default: ModuleWorkerHandler }>;
}

/**
 * Module Registry
 * Central registry of all available modules in the system
 */
export interface ModuleRegistry {
  modules: HomeModule[];
  getModule: (id: string) => HomeModule | undefined;
  getNavigationModules: () => HomeModule[];
}

/**
 * Helper type for module component props
 */
export interface ModuleComponentProps {
  moduleId?: string;
  [key: string]: unknown;
}

/**
 * Module initialization hook result
 */
export interface ModuleHook<T = unknown> {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}
