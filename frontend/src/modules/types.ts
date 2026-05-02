/**
 * Module System Types
 *
 * This file defines the contract that every module must follow.
 * All modules registered in the system must implement the HomeModule interface.
 */

import type { ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { OmniboxAdapter } from '@rambleraptor/homestead-core/shared/omnibox/types';
import type { ModuleFilterDecl } from '@rambleraptor/homestead-core/shared/filters/types';
import type { ResourceDefinition } from '@rambleraptor/homestead-core/resources/types';
import type { ModuleVisibility } from '@rambleraptor/homestead-core/settings/visibility';

/**
 * A widget a module contributes to the dashboard. The component is
 * responsible for its own data fetching and chrome (typically a
 * `SectionCard`); the dashboard just lays widgets out in `order`.
 */
export interface DashboardWidget {
  /** Stable id, unique across all modules. */
  id: string;
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
   * Optional widgets this module contributes to the dashboard. Each
   * widget is an independent React component that owns its own data
   * fetching and presentation.
   */
  widgets?: DashboardWidget[];

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
