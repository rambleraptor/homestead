/**
 * Update Grocery Item Hook
 *
 * Mutation for updating grocery items (toggle checked, edit name/notes)
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { Collections, getCollection } from '@/core/api/pocketbase';
import { categorizeGroceryItem } from '@/core/services/gemini';
import { logger } from '@/core/utils/logger';
import type { GroceryItem } from '../types';

interface UpdateGroceryItemParams {
  id: string;
  data: Partial<{
    name: string;
    notes: string;
    checked: boolean;
  }>;
}

export function useUpdateGroceryItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: UpdateGroceryItemParams) => {
      // If name is being updated, re-categorize the item
      if (data.name) {
        const category = await categorizeGroceryItem(data.name);
        logger.info(`Re-categorizing item: ${data.name} -> ${category}`);

        const updateData: Partial<GroceryItem> = {
          ...data,
          category,
        };

        const item = await getCollection<GroceryItem>(Collections.GROCERIES).update(id, updateData);
        return item;
      }

      // Otherwise, just update the data as-is
      const item = await getCollection<GroceryItem>(Collections.GROCERIES).update(id, data);
      return item;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.module('groceries').list() });
    },
    onError: (error) => {
      logger.error('Failed to update grocery item', error);
    },
  });
}
