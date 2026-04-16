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
