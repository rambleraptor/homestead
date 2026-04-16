/**
 * Module Registry
 *
 * CENTRAL MODULE REGISTRATION
 * ===========================
 * This is the ONLY file you need to modify to add a new module to HomeOS.
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
 */

import type { HomeModule, ModuleRegistry, ModuleFlagDef } from './types';
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
import { usersModule } from './users/module.config';
import { minigolfModule } from './minigolf/module.config';
import { flagManagementModule } from './flag-management/module.config';

// =============================================================================
// REGISTER MODULES HERE
// =============================================================================

/**
 * Array of all registered modules in the system.
 * Add your module to this array to make it available in the app.
 */
const MODULES: HomeModule[] = [
  dashboardModule,
  giftCardsModule,
  groceriesModule,
  peopleModule,
  hsaModule,
  creditCardsModule,
  minigolfModule,
  notificationsModule,
  usersModule,
  flagManagementModule,
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
   * Validate that all modules have unique IDs and base paths
   */
  private validateModules(): void {
    const ids = new Set<string>();
    const paths = new Set<string>();

    for (const mod of this.modules) {
      if (ids.has(mod.id)) {
        logger.warn(`Duplicate module ID detected: ${mod.id}`, { moduleId: mod.id });
      }
      ids.add(mod.id);

      if (paths.has(mod.basePath)) {
        logger.warn(`Duplicate base path detected: ${mod.basePath}`, { basePath: mod.basePath });
      }
      paths.add(mod.basePath);

      // Validate base path starts with /
      if (!mod.basePath.startsWith('/')) {
        logger.warn(`Module "${mod.id}" base path should start with /`, {
          moduleId: mod.id,
          basePath: mod.basePath
        });
      }
    }
  }

  /**
   * Get a specific module by ID
   */
  getModule(id: string): HomeModule | undefined {
    return this.modules.find((m) => m.id === id);
  }

  /**
   * Get modules that should appear in navigation
   */
  getNavigationModules(): HomeModule[] {
    return this.modules.filter((m) => m.showInNav !== false);
  }

  /**
   * Get all routes from all modules
   */
  getAllRoutes(): HomeModule['routes'] {
    return this.modules.flatMap((m) => m.routes);
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
 * Collect every declared flag across all registered modules, keyed by
 * module id. Consumed by the settings UI, the aepbase schema syncer,
 * and the `useModuleFlag` hook.
 */
export function getAllModuleFlagDefs(): Record<
  string,
  Record<string, ModuleFlagDef>
> {
  return Object.fromEntries(
    moduleRegistry.modules
      .filter((m) => m.flags && Object.keys(m.flags).length > 0)
      .map((m) => [m.id, m.flags!]),
  );
}

/**
 * Export the registry as default
 */
export default moduleRegistry;
