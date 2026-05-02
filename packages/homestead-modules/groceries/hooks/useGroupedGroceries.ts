import { useMemo } from 'react';
import { useGroceries } from './useGroceries';
import { useStores } from './useStores';
import type { StoreGroupedGroceries, GroceryStats } from '../types';

export function useGroupedGroceries() {
  const { data: items = [], isLoading: itemsLoading, isError: itemsError, error: itemsErrorMsg } = useGroceries();
  const { data: stores = [], isLoading: storesLoading, isError: storesError, error: storesErrorMsg } = useStores();

  const stats = useMemo<GroceryStats>(() => {
    const storeMap = new Map<string | null, StoreGroupedGroceries>();
    for (const store of stores) {
      storeMap.set(store.id, { store, items: [], checkedCount: 0, totalCount: 0 });
    }
    storeMap.set(null, { store: null, items: [], checkedCount: 0, totalCount: 0 });

    for (const item of items) {
      const group = storeMap.get(item.store || null);
      if (!group) continue;
      group.items.push(item);
      group.totalCount++;
      if (item.checked) group.checkedCount++;
    }

    const storesList = Array.from(storeMap.values())
      .filter((group) => group.totalCount > 0)
      .sort((a, b) => {
        // "No Store" last.
        if (a.store === null) return 1;
        if (b.store === null) return -1;
        const order = (a.store.sort_order ?? 0) - (b.store.sort_order ?? 0);
        return order !== 0 ? order : a.store.name.localeCompare(b.store.name);
      });

    const checkedItems = items.filter((item) => item.checked).length;

    return {
      totalItems: items.length,
      checkedItems,
      uncheckedItems: items.length - checkedItems,
      stores: storesList,
    };
  }, [items, stores]);

  return {
    stats,
    isLoading: itemsLoading || storesLoading,
    isError: itemsError || storesError,
    error: itemsErrorMsg || storesErrorMsg,
  };
}
