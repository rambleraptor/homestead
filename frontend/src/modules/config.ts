import type { HomeModule } from './types';

/**
 * Shape of the user-supplied configuration consumed by the registry.
 * Operators declare their instance by exporting a value of this type
 * from `frontend/homestead.config.ts`.
 */
export interface HomesteadConfig {
  /**
   * Modules included in this instance. Order is preserved for any
   * use-cases that care; the registry sorts by `navOrder` for nav.
   */
  modules: HomeModule[];
}
