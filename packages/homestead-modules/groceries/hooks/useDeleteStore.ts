import { useResourceDelete } from '@rambleraptor/homestead-core/api/resourceHooks';

export function useDeleteStore() {
  return useResourceDelete('groceries', 'store');
}
