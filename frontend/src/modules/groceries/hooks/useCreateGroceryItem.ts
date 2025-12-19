/**
 * Create Grocery Item Hook
 *
 * Mutation for creating a new grocery item with AI categorization
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { Collections, getCollection } from '@/core/api/pocketbase';
import { categorizeGroceryItem } from '@/core/services/gemini';
import { logger } from '@/core/utils/logger';
import type { GroceryItem, GroceryItemFormData } from '../types';

export function useCreateGroceryItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: GroceryItemFormData) => {
      // Categorize the item using AI
      const category = await categorizeGroceryItem(data.name);

      logger.info(`Creating grocery item: ${data.name} (${category})`);

      // Create the item with the AI-determined category
      const item = await getCollection<GroceryItem>(Collections.GROCERIES).create({
        name: data.name,
        notes: data.notes || '',
        category,
        checked: false,
      });

      return item;
    },
    onSuccess: () => {
      // Invalidate groceries list to refresh
      queryClient.invalidateQueries({ queryKey: queryKeys.module('groceries').list() });
    },
    onError: (error) => {
      logger.error('Failed to create grocery item', error);
    },
  });
}
