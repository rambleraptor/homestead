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

import type { HomeModule, ModuleRegistry } from './types';

// =============================================================================
// IMPORT YOUR MODULES HERE
// =============================================================================

// Import modules as they are created
import { dashboardModule } from './dashboard/module.config';
import { giftCardsModule } from './gift-cards/module.config';
import { eventsModule } from './events/module.config';
import { notificationsModule } from './notifications/module.config';
import { settingsModule } from './settings/module.config';

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
  eventsModule,
  notificationsModule,
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

    for (const module of this.modules) {
      if (ids.has(module.id)) {
        console.warn(`Duplicate module ID detected: ${module.id}`);
      }
      ids.add(module.id);

      if (paths.has(module.basePath)) {
        console.warn(`Duplicate base path detected: ${module.basePath}`);
      }
      paths.add(module.basePath);

      // Validate base path starts with /
      if (!module.basePath.startsWith('/')) {
        console.warn(`Module "${module.id}" base path should start with /`);
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
 * Export the registry as default
 */
export default moduleRegistry;
