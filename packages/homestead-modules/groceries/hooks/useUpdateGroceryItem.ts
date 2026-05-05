import { useResourceUpdate } from '@rambleraptor/homestead-core/api/resourceHooks';
import type { GroceryItem } from '../types';

type GroceryItemUpdate = Partial<Pick<GroceryItem, 'name' | 'notes' | 'checked' | 'store'>>;

export function useUpdateGroceryItem() {
  return useResourceUpdate<GroceryItem, GroceryItemUpdate>('groceries', 'grocery');
}
