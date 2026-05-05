/**
 * Groceries-specific offline overrides — the only thing that survives
 * the move to the generic factory is the store→items cascade. When a
 * store is deleted, items pointing at it have their `store` field
 * cleared so they reappear under "No Store". The cascade is applied
 * optimistically inside the delete `onMutate` and reversed on error.
 */

import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import type { GroceryItem } from './types';

const ITEMS_KEY = queryKeys.module('groceries').resource('grocery').list();

export const storeCascadeDelete = {
  apply(storeId: string, qc: QueryClient): unknown {
    const items = qc.getQueryData<GroceryItem[]>(ITEMS_KEY) ?? [];
    qc.setQueryData<GroceryItem[]>(
      ITEMS_KEY,
      items.map((it) => (it.store === storeId ? { ...it, store: '' } : it)),
    );
    return items;
  },
  rollback(snapshot: unknown, qc: QueryClient): void {
    qc.setQueryData<GroceryItem[]>(ITEMS_KEY, snapshot as GroceryItem[]);
  },
};
