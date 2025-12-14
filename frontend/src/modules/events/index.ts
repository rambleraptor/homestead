/**
 * Events Module Exports
 *
 * Central export point for the events module
 */

export { eventsModule } from './module.config';
export { eventRoutes } from './routes';
export type {
  Event,
  EventType,
  EventFormData,
  EventStats,
  NotificationPreference,
  NotificationPreferenceOption,
} from './types';
export { NOTIFICATION_PREFERENCE_OPTIONS } from './types';
