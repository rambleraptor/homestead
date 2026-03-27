/**
 * Grouped Groceries Hook
 *
 * Groups grocery items by store and provides statistics
 */

import { useMemo } from 'react';
import { useGroceries } from './useGroceries';
import { useStores } from './useStores';
import type { StoreGroupedGroceries, GroceryStats } from '../types';

export function useGroupedGroceries() {
  const { data: items = [], isLoading: itemsLoading, isError: itemsError, error: itemsErrorMsg } = useGroceries();
  const { data: stores = [], isLoading: storesLoading, isError: storesError, error: storesErrorMsg } = useStores();

  const stats = useMemo<GroceryStats>(() => {
    // Group items by store
    const storeMap = new Map<string | null, StoreGroupedGroceries>();

    // Initialize all stores
    stores.forEach((store) => {
      storeMap.set(store.id, {
        store,
        items: [],
        checkedCount: 0,
        totalCount: 0,
      });
    });

    // Initialize "No Store" group
    storeMap.set(null, {
      store: null,
      items: [],
      checkedCount: 0,
      totalCount: 0,
    });

    // Sort items into stores
    items.forEach((item) => {
      const storeId = item.store || null;
      const storeGroup = storeMap.get(storeId);

      if (storeGroup) {
        storeGroup.items.push(item);
        storeGroup.totalCount++;
        if (item.checked) {
          storeGroup.checkedCount++;
        }
      }
    });

    // Filter out empty stores and sort by sort_order
    const storesList = Array.from(storeMap.values())
      .filter((group) => group.totalCount > 0)
      .sort((a, b) => {
        // No Store group last
        if (a.store === null) return 1;
        if (b.store === null) return -1;

        // Sort by sort_order, then by name
        const aSortOrder = a.store.sort_order ?? 0;
        const bSortOrder = b.store.sort_order ?? 0;
        if (aSortOrder !== bSortOrder) {
          return aSortOrder - bSortOrder;
        }
        return a.store.name.localeCompare(b.store.name);
      });

    const totalItems = items.length;
    const checkedItems = items.filter((item) => item.checked).length;

    return {
      totalItems,
      checkedItems,
      uncheckedItems: totalItems - checkedItems,
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
