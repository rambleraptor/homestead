/**
 * Grouped Groceries Hook
 *
 * Groups grocery items by category and provides statistics
 */

import { useMemo } from 'react';
import { GROCERY_CATEGORIES } from '@/core/services/gemini';
import type { GroceryCategory } from '@/core/services/gemini';
import { useGroceries } from './useGroceries';
import type { GroupedGroceries, GroceryStats } from '../types';

export function useGroupedGroceries() {
  const { data: items = [], isLoading, isError, error } = useGroceries();

  const stats = useMemo<GroceryStats>(() => {
    // Group items by category
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

    // Sort items into categories
    items.forEach((item) => {
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
    const categories = Array.from(categoryMap.values())
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

    const totalItems = items.length;
    const checkedItems = items.filter((item) => item.checked).length;

    return {
      totalItems,
      checkedItems,
      uncheckedItems: totalItems - checkedItems,
      categories,
    };
  }, [items]);

  return {
    stats,
    isLoading,
    isError,
    error,
  };
}
