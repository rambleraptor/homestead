/**
 * Reusable Bulk Import Framework — Generic Bulk Import Hook
 *
 * Writes each row to aepbase via the thin wrapper. `collection` is the
 * aepbase plural (kebab-case URL segment), e.g. "gift-cards".
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aepbase } from '@/core/api/aepbase';
import { logger } from '@/core/utils/logger';
import type { ParsedItem, BulkImportResult } from './types';

interface UseBulkImportOptions<T> {
  /** aepbase collection plural (kebab-case URL segment, e.g. "gift-cards") */
  collection: string;
  /** Query key to invalidate on success */
  queryKey: readonly unknown[];
  /** Transform parsed data to create payload (optional) */
  transformData?: (data: T) => Record<string, unknown>;
}

export function useBulkImport<T>({
  collection,
  queryKey,
  transformData,
}: UseBulkImportOptions<T>) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (items: ParsedItem<T>[]): Promise<BulkImportResult> => {
      const userId = aepbase.getCurrentUser()?.id;
      if (!userId) {
        throw new Error('You must be logged in to import items');
      }
      const createdBy = `users/${userId}`;

      const results: BulkImportResult = {
        successful: 0,
        failed: 0,
        errors: [],
      };

      const validItems = items.filter((item) => item.isValid);

      for (const item of validItems) {
        try {
          const data = transformData ? transformData(item.data) : item.data;
          await aepbase.create(collection, {
            ...(data as Record<string, unknown>),
            created_by: createdBy,
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
      queryClient.invalidateQueries({ queryKey });
    },
  });
}
