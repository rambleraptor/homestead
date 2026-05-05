import { useResourceCreate } from '@rambleraptor/homestead-core/api/resourceHooks';
import type { GroceryItem, GroceryItemFormData } from '../types';

export function useCreateGroceryItem() {
  return useResourceCreate<GroceryItem, GroceryItemFormData>('groceries', 'grocery');
}
