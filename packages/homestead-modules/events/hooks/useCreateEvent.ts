import { useResourceCreate } from '@rambleraptor/homestead-core/api/resourceHooks';
import type { Event, EventFormData } from '../types';

export function useCreateEvent() {
  return useResourceCreate<Event, EventFormData>('events', 'event');
}
