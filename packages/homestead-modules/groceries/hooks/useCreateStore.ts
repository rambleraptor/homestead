import { useResourceCreate } from '@rambleraptor/homestead-core/api/resourceHooks';
import type { Store } from '../types';

interface CreateStoreInput {
  name: string;
  sort_order?: number;
}

export function useCreateStore() {
  return useResourceCreate<Store, CreateStoreInput>('groceries', 'store');
}
