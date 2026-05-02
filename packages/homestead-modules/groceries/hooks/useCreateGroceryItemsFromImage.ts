/**
 * Create Grocery Items from Image Hook
 *
 * Extracts items from an uploaded image via the backend Gemini route, then
 * creates them in aepbase.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { aepbase, AepCollections } from '@rambleraptor/homestead-core/api/aepbase';
import { extractGroceryItemsFromImage } from '@rambleraptor/homestead-core/services/gemini';
import { logger } from '@rambleraptor/homestead-core/utils/logger';
import type { GroceryItem } from '../types';

export interface CreateFromImageResult {
  extractedCount: number;
  createdItems: GroceryItem[];
  failedItems: string[];
}

export function useCreateGroceryItemsFromImage() {
  const queryClient = useQueryClient();

  return useMutation({
    // Image extraction is server-side (Gemini); persisting a multipart
    // image to localStorage is impractical, so this fails fast offline.
    networkMode: 'online',
    mutationFn: async (imageFile: File) => {
      logger.info('Extracting grocery items from image');
      const extractedItems = await extractGroceryItemsFromImage(imageFile);

      if (extractedItems.length === 0) {
        logger.warn('No items extracted from image');
        return { extractedCount: 0, createdItems: [], failedItems: [] };
      }

      logger.info(
        `Extracted ${extractedItems.length} items, creating in database...`,
      );

      const createdItems: GroceryItem[] = [];
      const failedItems: string[] = [];

      for (const extractedItem of extractedItems) {
        try {
          const item = await aepbase.create<GroceryItem>(
            AepCollections.GROCERIES,
            {
              name: extractedItem.name,
              notes: '',
              checked: false,
            },
          );
          createdItems.push(item);
        } catch (error) {
          logger.error(`Failed to create item: ${extractedItem.name}`, error);
          failedItems.push(extractedItem.name);
        }
      }

      logger.info(
        `Successfully created ${createdItems.length} of ${extractedItems.length} grocery items from image`,
      );
      if (failedItems.length > 0) {
        logger.warn(
          `Failed to create ${failedItems.length} items: ${failedItems.join(', ')}`,
        );
      }

      const result: CreateFromImageResult = {
        extractedCount: extractedItems.length,
        createdItems,
        failedItems,
      };
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.module('groceries').list() });
    },
    onError: (error) => {
      logger.error('Failed to create grocery items from image', error);
    },
  });
}
