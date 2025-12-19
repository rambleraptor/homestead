/**
 * Create Grocery Items from Image Hook
 *
 * Mutation for extracting and creating grocery items from an uploaded image
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { Collections, getCollection } from '@/core/api/pocketbase';
import { extractGroceryItemsFromImage, categorizeGroceryItems } from '@/core/services/gemini';
import { logger } from '@/core/utils/logger';
import type { GroceryItem } from '../types';

export interface CreateFromImageResult {
  extractedItems: string[];
  createdItems: GroceryItem[];
}

export function useCreateGroceryItemsFromImage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (imageFile: File): Promise<CreateFromImageResult> => {
      logger.info('Extracting grocery items from image');

      // Step 1: Extract items from image using Gemini Vision
      const extractedItems = await extractGroceryItemsFromImage(imageFile);

      if (extractedItems.length === 0) {
        logger.warn('No items extracted from image');
        return { extractedItems: [], createdItems: [] };
      }

      logger.info(`Extracted ${extractedItems.length} items, categorizing...`);

      // Step 2: Batch categorize all items
      const categorizations = await categorizeGroceryItems(extractedItems);

      logger.info(`Categorized ${categorizations.size} items, creating in database...`);

      // Step 3: Create all items in PocketBase
      const createdItems: GroceryItem[] = [];
      const collection = getCollection<GroceryItem>(Collections.GROCERIES);

      for (const itemName of extractedItems) {
        const category = categorizations.get(itemName) || 'Other';
        try {
          const item = await collection.create({
            name: itemName,
            notes: '',
            category,
            checked: false,
          });
          createdItems.push(item);
        } catch (error) {
          logger.error(`Failed to create item: ${itemName}`, error);
          // Continue with other items even if one fails
        }
      }

      logger.info(`Successfully created ${createdItems.length} grocery items from image`);

      return {
        extractedItems,
        createdItems,
      };
    },
    onSuccess: () => {
      // Invalidate groceries list to refresh
      queryClient.invalidateQueries({ queryKey: queryKeys.module('groceries').list() });
    },
    onError: (error) => {
      logger.error('Failed to create grocery items from image', error);
    },
  });
}
