import { useResourceUpdate } from '@rambleraptor/homestead-core/api/resourceHooks';
import type { Store } from '../types';

export function useUpdateStore() {
  return useResourceUpdate<Store, Partial<Pick<Store, 'name' | 'sort_order'>>>(
    'groceries',
    'store',
  );
}
