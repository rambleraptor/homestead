import { useResourceDelete } from '@rambleraptor/homestead-core/api/resourceHooks';

export function useDeleteNote() {
  return useResourceDelete('notes', 'note');
}
