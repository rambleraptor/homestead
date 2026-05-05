import { useResourceDelete } from '@rambleraptor/homestead-core/api/resourceHooks';

export function useDeleteGroceryItem() {
  return useResourceDelete('groceries', 'grocery');
}
