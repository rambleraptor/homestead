/**
 * Events Module Exports
 */

export { eventsModule } from './module.config';
export type { Event, EventFormData, KnownEventTag } from './types';
export { KNOWN_EVENT_TAGS } from './types';
export {
  upsertBirthdayEvent,
  upsertAnniversaryEvent,
  upsertPersonEvent,
} from './utils/personEventSync';
