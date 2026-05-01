/**
 * Module Registry
 *
 * CENTRAL MODULE REGISTRATION
 * ===========================
 * This is the ONLY file you need to modify to add a new module to Homestead.
 *
 * To add a new module:
 * 1. Create your module directory in src/modules/your-module/
 * 2. Implement the module.config.ts file
 * 3. Import and register it in the MODULES array below
 * 4. That's it! The module will automatically appear in navigation and routing.
 *
 * Example:
 * ```
 * import { dashboardModule } from './dashboard/module.config';
 * import { choresModule } from './chores/module.config';
 *
 * const MODULES: HomeModule[] = [
 *   dashboardModule,
 *   choresModule,
 * ];
 * ```
 *
 * Nested modules: a parent can declare `children: HomeModule[]` to
 * group related sub-features (e.g. `gamesModule` owns `minigolf`,
 * `pictionary`, `bridge`). Only the parent goes in `MODULES`; the
 * registry walks `children` for route/widget aggregation, validation,
 * `module-flags` schema generation, and `getModule(id)` lookups, so a
 * nested module gets its own `enabled` flag (and any other declared
 * flags) and can be gated independently of its parent. Children still
 * stay out of top-level navigation — the parent owns the sidebar
 * placement and the omnibox surface.
 */

import type {
  DashboardWidget,
  HomeModule,
  ModuleFlagDef,
  ModuleRegistry,
} from './types';
import {
  DEFAULT_MODULE_VISIBILITY,
  MODULE_VISIBILITY_OPTIONS,
  type ModuleVisibility,
} from './settings/visibility';
import { logger } from '@/core/utils/logger';

// =============================================================================
// IMPORT YOUR MODULES HERE
// =============================================================================

// Import modules as they are created
import { dashboardModule } from './dashboard/module.config';
import { giftCardsModule } from './gift-cards/module.config';
import { groceriesModule } from './groceries/module.config';
import { peopleModule } from './people/module.config';
import { notificationsModule } from './notifications/module.config';
import { settingsModule } from './settings/module.config';
import { hsaModule } from './hsa/module.config';
import { creditCardsModule } from './credit-cards/module.config';
import { superuserModule } from './superuser/module.config';
import { gamesModule } from './games/module.config';
import { recipesModule } from './recipes/module.config';
import { todosModule } from './todos/module.config';

// =============================================================================
// REGISTER MODULES HERE
// =============================================================================

/**
 * Array of all registered modules in the system.
 * Add your module to this array to make it available in the app.
 */
const MODULES: HomeModule[] = [
  dashboardModule,
  todosModule,
  giftCardsModule,
  groceriesModule,
  recipesModule,
  peopleModule,
  hsaModule,
  creditCardsModule,
  gamesModule,
  notificationsModule,
  superuserModule,
  settingsModule,
  // Add your modules here...
];

// =============================================================================
// MODULE REGISTRY IMPLEMENTATION
// (You don't need to modify anything below this line)
// =============================================================================

class ModuleRegistryImpl implements ModuleRegistry {
  modules: HomeModule[];

  constructor(modules: HomeModule[]) {
    // Filter out disabled modules and sort by navOrder
    this.modules = modules
      .filter((m) => m.enabled !== false)
      .sort((a, b) => (a.navOrder || 100) - (b.navOrder || 100));

    this.validateModules();
  }

  /**
   * Validate IDs, base paths, and parent/child relationships across
   * the whole tree. Walks `children` recursively so nested modules
   * share the same id/path namespace as top-level modules.
   */
  private validateModules(): void {
    const ids = new Set<string>();
    const paths = new Set<string>();

    const visit = (mod: HomeModule, parent: HomeModule | null): void => {
      if (ids.has(mod.id)) {
        logger.warn(`Duplicate module ID detected: ${mod.id}`, { moduleId: mod.id });
      }
      ids.add(mod.id);

      if (paths.has(mod.basePath)) {
        logger.warn(`Duplicate base path detected: ${mod.basePath}`, { basePath: mod.basePath });
      }
      paths.add(mod.basePath);

      if (!mod.basePath.startsWith('/')) {
        logger.warn(`Module "${mod.id}" base path should start with /`, {
          moduleId: mod.id,
          basePath: mod.basePath,
        });
      }

      if (parent && !mod.basePath.startsWith(parent.basePath + '/')) {
        logger.warn(
          `Child module "${mod.id}" base path "${mod.basePath}" must be nested under parent "${parent.id}" (${parent.basePath})`,
          { moduleId: mod.id, parentId: parent.id },
        );
      }

      for (const child of mod.children ?? []) {
        visit(child, mod);
      }
    };

    for (const mod of this.modules) {
      visit(mod, null);
    }
  }

  /**
   * Get a specific module by ID. Walks `children` so nested modules
   * are reachable; their flags live in the same id namespace as their
   * parents, so flag consumers (and the Flag Management UI) need to
   * resolve a child's `HomeModule` to render its name and metadata.
   */
  getModule(id: string): HomeModule | undefined {
    const visit = (mod: HomeModule): HomeModule | undefined => {
      if (mod.id === id) return mod;
      for (const child of mod.children ?? []) {
        const hit = visit(child);
        if (hit) return hit;
      }
      return undefined;
    };
    for (const mod of this.modules) {
      const hit = visit(mod);
      if (hit) return hit;
    }
    return undefined;
  }

  /**
   * Get modules that should appear in navigation
   */
  getNavigationModules(): HomeModule[] {
    return this.modules.filter((m) => m.showInNav !== false);
  }

  /**
   * Get all routes from all modules, including nested children.
   */
  getAllRoutes(): HomeModule['routes'] {
    const collect = (mod: HomeModule): HomeModule['routes'] => [
      ...mod.routes,
      ...(mod.children ?? []).flatMap(collect),
    ];
    return this.modules.flatMap(collect);
  }

  /**
   * Get module statistics
   */
  getStats() {
    return {
      total: this.modules.length,
      inNavigation: this.modules.filter((m) => m.showInNav !== false).length,
    };
  }
}

/**
 * Singleton instance of the module registry
 */
export const moduleRegistry = new ModuleRegistryImpl(MODULES);

/**
 * Helper function to get all modules
 */
export function getAllModules(): HomeModule[] {
  return moduleRegistry.modules;
}

/**
 * Helper function to get module by ID
 */
export function getModuleById(id: string): HomeModule | undefined {
  return moduleRegistry.getModule(id);
}

/**
 * Helper function to get modules for navigation
 */
export function getNavigationModules(): HomeModule[] {
  return moduleRegistry.getNavigationModules();
}

/**
 * Helper function to get all routes
 */
export function getAllRoutes(): HomeModule['routes'] {
  return moduleRegistry.getAllRoutes();
}

/**
 * Helper function to check if a module exists
 */
export function moduleExists(id: string): boolean {
  return moduleRegistry.getModule(id) !== undefined;
}

/**
 * Collect all dashboard widgets contributed by registered modules,
 * sorted by their declared `order` (default 100). Used by the
 * dashboard to render module-owned widgets without hardcoding any
 * module-specific imports.
 */
export function getAllDashboardWidgets(): DashboardWidget[] {
  const collect = (mod: HomeModule): DashboardWidget[] => [
    ...(mod.widgets ?? []),
    ...(mod.children ?? []).flatMap(collect),
  ];
  return moduleRegistry.modules
    .flatMap(collect)
    .sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
}

/**
 * Reserved key for the built-in `enabled` flag every module gets.
 * Module-declared flags cannot override this name.
 */
export const BUILTIN_ENABLED_FLAG_KEY = 'enabled';

function builtinEnabledFlagDef(
  defaultValue: ModuleVisibility,
): ModuleFlagDef {
  return {
    type: 'enum',
    label: 'Module enabled for',
    description:
      "Who can use this module. 'superusers' restricts it to superusers; 'all' makes it available to every signed-in user; 'none' hides it from everyone (including superusers).",
    options: MODULE_VISIBILITY_OPTIONS,
    default: defaultValue,
  };
}

/**
 * Collect every declared flag across all registered modules — top-level
 * and nested — keyed by module id. Consumed by the settings UI, the
 * aepbase schema syncer, and the `useModuleFlag` hook.
 *
 * Every module (including children) automatically receives a built-in
 * `enabled` flag (see `BUILTIN_ENABLED_FLAG_KEY`) so it can be gated
 * independently. Module-declared flags of the same name are ignored
 * with a warning so the audience knob stays consistent across the app.
 */
export function getAllModuleFlagDefs(): Record<
  string,
  Record<string, ModuleFlagDef>
> {
  const out: Record<string, Record<string, ModuleFlagDef>> = {};
  const visit = (mod: HomeModule): void => {
    const declared = mod.flags ?? {};
    if (BUILTIN_ENABLED_FLAG_KEY in declared) {
      logger.warn(
        `Module "${mod.id}" declares a reserved flag "${BUILTIN_ENABLED_FLAG_KEY}"; built-in definition takes precedence.`,
        { moduleId: mod.id },
      );
    }
    const builtin = builtinEnabledFlagDef(
      mod.defaultEnabled ?? DEFAULT_MODULE_VISIBILITY,
    );
    out[mod.id] = {
      ...declared,
      [BUILTIN_ENABLED_FLAG_KEY]: builtin,
    };
    for (const child of mod.children ?? []) {
      visit(child);
    }
  };
  for (const mod of moduleRegistry.modules) {
    visit(mod);
  }
  return out;
}

/**
 * Export the registry as default
 */
export default moduleRegistry;
