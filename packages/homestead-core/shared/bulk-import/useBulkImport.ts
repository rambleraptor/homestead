import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { logger } from '@rambleraptor/homestead-core/utils/logger';
import type { ParsedItem, BulkImportResult } from './types';

export interface SaveItemHelpers<C> {
  ctx: C;
  createdBy: string | undefined;
}

interface BaseOptions<C> {
  queryKey: readonly unknown[];
  /**
   * Loaded once before the first row is saved. Useful for fetching
   * lookup data the per-row save needs (e.g. an existing-records map
   * for name → id resolution). Result is passed to every saveItem call.
   */
  prepare?: () => Promise<C>;
}

interface SimpleOptions<T> extends BaseOptions<undefined> {
  /** Kebab-case plural URL segment, e.g. "gift-cards". */
  collection: string;
  transformData?: (data: T) => Record<string, unknown>;
  saveItem?: never;
}

interface CustomOptions<T, C> extends BaseOptions<C> {
  /**
   * Translate a single CSV row into one or more aepbase writes. Throw to
   * mark the row as failed; the framework records the error against the
   * row number and continues with the next item.
   */
  saveItem: (data: T, helpers: SaveItemHelpers<C>) => Promise<void>;
  collection?: never;
  transformData?: never;
}

export type UseBulkImportOptions<T, C = undefined> =
  | SimpleOptions<T>
  | CustomOptions<T, C>;

export function useBulkImport<T, C = undefined>(
  options: UseBulkImportOptions<T, C>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      items: ParsedItem<T>[],
    ): Promise<BulkImportResult> => {
      const userId = aepbase.getCurrentUser()?.id;
      if (!userId) {
        throw new Error('You must be logged in to import items');
      }
      const createdBy = `users/${userId}`;

      const ctx = (options.prepare ? await options.prepare() : undefined) as C;

      const results: BulkImportResult = {
        successful: 0,
        failed: 0,
        errors: [],
      };

      const validItems = items.filter((item) => item.isValid);

      for (const item of validItems) {
        try {
          if (options.saveItem) {
            await options.saveItem(item.data, { ctx, createdBy });
          } else {
            const data = options.transformData
              ? options.transformData(item.data)
              : item.data;
            await aepbase.create(options.collection, {
              ...(data as Record<string, unknown>),
              created_by: createdBy,
            });
          }
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
      queryClient.invalidateQueries({ queryKey: options.queryKey });
    },
  });
}
