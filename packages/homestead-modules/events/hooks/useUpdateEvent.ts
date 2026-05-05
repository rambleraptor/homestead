import { useResourceUpdate } from '@rambleraptor/homestead-core/api/resourceHooks';
import type { Event, EventFormData } from '../types';

export function useUpdateEvent() {
  return useResourceUpdate<Event, EventFormData>('events', 'event');
}
