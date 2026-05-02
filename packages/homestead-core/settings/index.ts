/**
 * Settings Module Exports
 *
 * Central export point for the settings module
 */

export { settingsModule } from './module.config';
export type {
  NotificationSubscription,
  NotificationSettings,
} from './types';

// Public hook for reading/writing module-scoped flags.
export { useModuleFlag } from './hooks/useModuleFlag';
export type { UseModuleFlagResult } from './hooks/useModuleFlag';

// Public hook for gating a module by its built-in `enabled` flag.
export {
  useIsModuleEnabled,
  useModuleEnabledPredicate,
} from './hooks/useIsModuleEnabled';
export {
  MODULE_VISIBILITY_OPTIONS,
  DEFAULT_MODULE_VISIBILITY,
} from './visibility';
export type { ModuleVisibility } from './visibility';
