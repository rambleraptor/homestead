/**
 * Categorize All Groceries Hook
 *
 * Mutation for batch categorizing all grocery items using AI
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { Collections, getCollection, pb } from '@/core/api/pocketbase';
import { logger } from '@/core/utils/logger';
import type { GroceryItem } from '../types';
import type { GroceryCategory } from '@/core/services/gemini';

interface CategorizeAllResult {
  totalItems: number;
  categorized: number;
  failed: number;
  failedIds: string[];
}

export function useCategorizeAllGroceries() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<CategorizeAllResult> => {
      logger.info('Starting batch categorization of all grocery items');

      // Fetch all grocery items
      const collection = getCollection<GroceryItem>(Collections.GROCERIES);
      const allItems = await collection.getFullList({
        sort: '-created',
      });

      if (allItems.length === 0) {
        return {
          totalItems: 0,
          categorized: 0,
          failed: 0,
          failedIds: [],
        };
      }

      logger.info(`Fetched ${allItems.length} items for categorization`);

      // Prepare items for categorization
      const itemsToCateg = allItems.map((item) => ({
        id: item.id,
        name: item.name,
      }));

      // Call batch categorization API
      const token = pb.authStore.token;
      const res = await fetch('/api/groceries/categorize-batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ items: itemsToCateg }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const response = await res.json() as {
        categorized: Array<{ id: string; category: GroceryCategory }>;
        failed: string[];
        message: string;
      };

      logger.info(response.message);

      // Update each item with its new category
      let updateCount = 0;
      for (const categorizedItem of response.categorized) {
        try {
          await collection.update(categorizedItem.id, {
            category: categorizedItem.category,
          });
          updateCount++;
        } catch (error) {
          logger.error(`Failed to update item ${categorizedItem.id}`, error);
          response.failed.push(categorizedItem.id);
        }
      }

      logger.info(`Successfully updated ${updateCount} items with new categories`);

      return {
        totalItems: allItems.length,
        categorized: updateCount,
        failed: response.failed.length,
        failedIds: response.failed,
      };
    },
    onSuccess: (result) => {
      logger.info(
        `Batch categorization complete: ${result.categorized} categorized, ${result.failed} failed`
      );
      // Invalidate groceries list to refresh with new categories
      queryClient.invalidateQueries({ queryKey: queryKeys.module('groceries').list() });
    },
    onError: (error) => {
      logger.error('Failed to batch categorize grocery items', error);
    },
  });
}
