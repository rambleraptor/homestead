/**
 * Reusable Bulk Import Framework - Generic Bulk Import Hook
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getCollection, pb, Collections } from '@/core/api/pocketbase';
import { logger } from '@/core/utils/logger';
import type { ParsedItem, BulkImportResult } from './types';

interface UseBulkImportOptions<T> {
  /** PocketBase collection name */
  collection: typeof Collections[keyof typeof Collections];
  /** Query key to invalidate on success */
  queryKey: readonly unknown[];
  /** Transform parsed data to create payload (optional) */
  transformData?: (data: T) => Record<string, unknown>;
}

/**
 * Generic hook for bulk importing items
 */
export function useBulkImport<T>({
  collection,
  queryKey,
  transformData,
}: UseBulkImportOptions<T>) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (items: ParsedItem<T>[]): Promise<BulkImportResult> => {
      const userId = pb.authStore.record?.id;
      if (!userId) {
        throw new Error('You must be logged in to import items');
      }

      const results: BulkImportResult = {
        successful: 0,
        failed: 0,
        errors: [],
      };

      // Filter out invalid items
      const validItems = items.filter((item) => item.isValid);

      // Import items sequentially to maintain order and capture individual errors
      for (const item of validItems) {
        try {
          const data = transformData ? transformData(item.data) : item.data;

          await getCollection(collection).create({
            ...(data as Record<string, unknown>),
            created_by: userId,
          });

          results.successful++;
        } catch (error) {
          results.failed++;
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          results.errors.push({
            rowNumber: item.rowNumber,
            error: errorMessage,
          });
        }
      }

      if (results.failed > 0) {
        logger.error('Bulk import errors', { errors: results.errors });
      }

      return results;
    },
    onSuccess: () => {
      // Invalidate query to refresh the list
      queryClient.invalidateQueries({ queryKey });
    },
  });
}
