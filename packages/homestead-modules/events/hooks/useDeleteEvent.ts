import { useResourceDelete } from '@rambleraptor/homestead-core/api/resourceHooks';

export function useDeleteEvent() {
  return useResourceDelete('events', 'event');
}
