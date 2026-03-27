/**
 * Create Grocery Items from Image Hook
 *
 * Mutation for extracting and creating grocery items from an uploaded image
 * Uses backend API for secure Gemini Vision processing
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { Collections, getCollection } from '@/core/api/pocketbase';
import { extractGroceryItemsFromImage } from '@/core/services/gemini';
import { logger } from '@/core/utils/logger';
import type { GroceryItem } from '../types';


export interface CreateFromImageResult {
  extractedCount: number;
  createdItems: GroceryItem[];
  failedItems: string[];
}

export function useCreateGroceryItemsFromImage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (imageFile: File) => {
      logger.info('Extracting grocery items from image');

      // Extract items using backend API
      const extractedItems = await extractGroceryItemsFromImage(imageFile);

      if (extractedItems.length === 0) {
        logger.warn('No items extracted from image');
        return {
          extractedCount: 0,
          createdItems: [],
          failedItems: [],
        };
      }

      logger.info(`Extracted ${extractedItems.length} items, creating in database...`);

      // Create all items in PocketBase
      const createdItems: GroceryItem[] = [];
      const failedItems: string[] = [];
      const collection = getCollection<GroceryItem>(Collections.GROCERIES);

      for (const extractedItem of extractedItems) {
        try {
          const item = await collection.create({
            name: extractedItem.name,
            notes: '',
            checked: false,
          });
          createdItems.push(item);
        } catch (error) {
          logger.error(`Failed to create item: ${extractedItem.name}`, error);
          failedItems.push(extractedItem.name);
          // Continue with other items even if one fails
        }
      }

      logger.info(
        `Successfully created ${createdItems.length} of ${extractedItems.length} grocery items from image`
      );

      if (failedItems.length > 0) {
        logger.warn(`Failed to create ${failedItems.length} items: ${failedItems.join(', ')}`);
      }

      const result: CreateFromImageResult = {
        extractedCount: extractedItems.length,
        createdItems,
        failedItems,
      };

      return result;
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
