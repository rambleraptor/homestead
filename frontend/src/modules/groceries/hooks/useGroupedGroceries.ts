/**
 * Grouped Groceries Hook
 *
 * Groups grocery items by store and category, and provides statistics
 */

import { useMemo } from 'react';
import { GROCERY_CATEGORIES } from '@/core/services/gemini';
import type { GroceryCategory } from '@/core/services/gemini';
import { useGroceries } from './useGroceries';
import { useStores } from './useStores';
import type { GroupedGroceries, StoreGroupedGroceries, GroceryStats } from '../types';

export function useGroupedGroceries() {
  const { data: items = [], isLoading: itemsLoading, isError: itemsError, error: itemsErrorMsg } = useGroceries();
  const { data: stores = [], isLoading: storesLoading, isError: storesError, error: storesErrorMsg } = useStores();

  const stats = useMemo<GroceryStats>(() => {
    // Group items by store first
    const storeMap = new Map<string | null, StoreGroupedGroceries>();

    // Initialize all stores
    stores.forEach((store) => {
      storeMap.set(store.id, {
        store,
        categories: [],
        checkedCount: 0,
        totalCount: 0,
      });
    });

    // Initialize "No Store" group
    storeMap.set(null, {
      store: null,
      categories: [],
      checkedCount: 0,
      totalCount: 0,
    });

    // Group items by store, then by category
    items.forEach((item) => {
      const storeId = item.store || null;
      const storeGroup = storeMap.get(storeId);

      if (storeGroup) {
        storeGroup.totalCount++;
        if (item.checked) {
          storeGroup.checkedCount++;
        }
      }
    });

    // For each store, group items by category
    storeMap.forEach((storeGroup, storeId) => {
      const categoryMap = new Map<GroceryCategory | 'Uncategorized', GroupedGroceries>();

      // Initialize all known categories
      GROCERY_CATEGORIES.forEach((category) => {
        categoryMap.set(category, {
          category,
          items: [],
          checkedCount: 0,
          totalCount: 0,
        });
      });

      // Add uncategorized group
      categoryMap.set('Uncategorized', {
        category: 'Uncategorized',
        items: [],
        checkedCount: 0,
        totalCount: 0,
      });

      // Sort items into categories for this store
      items
        .filter((item) => (item.store || null) === storeId)
        .forEach((item) => {
          const category = item.category || 'Uncategorized';
          const group = categoryMap.get(category);

          if (group) {
            group.items.push(item);
            group.totalCount++;
            if (item.checked) {
              group.checkedCount++;
            }
          }
        });

      // Filter out empty categories and sort
      storeGroup.categories = Array.from(categoryMap.values())
        .filter((group) => group.totalCount > 0)
        .sort((a, b) => {
          // Unchecked items first, then by category name
          const aUnchecked = a.totalCount - a.checkedCount;
          const bUnchecked = b.totalCount - b.checkedCount;
          if (aUnchecked !== bUnchecked) {
            return bUnchecked - aUnchecked;
          }
          return a.category.localeCompare(b.category);
        });
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
