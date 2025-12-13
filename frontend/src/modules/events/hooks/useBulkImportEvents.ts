import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getCollection, pb } from '../../../core/api/pocketbase';
import { queryKeys } from '../../../core/api/queryClient';
import type { EventFormData } from '../types';

interface BulkImportEvent extends EventFormData {
  rowNumber: number;
  isValid: boolean;
  errors: string[];
}

interface BulkImportResult {
  successful: number;
  failed: number;
  errors: Array<{ rowNumber: number; error: string }>;
}

export function useBulkImportEvents() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (events: BulkImportEvent[]): Promise<BulkImportResult> => {
      const userId = pb.authStore.record?.id;
      if (!userId) {
        throw new Error('You must be logged in to import events');
      }

      const results: BulkImportResult = {
        successful: 0,
        failed: 0,
        errors: [],
      };

      // Filter out invalid events
      const validEvents = events.filter(event => event.isValid);

      // Import events sequentially to maintain order and capture individual errors
      for (const event of validEvents) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { rowNumber, isValid, errors, ...eventData } = event;

          await getCollection('events').create({
            ...eventData,
            created_by: userId,
          });

          results.successful++;
        } catch (error) {
          results.failed++;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          results.errors.push({
            rowNumber: event.rowNumber,
            error: errorMessage,
          });
        }
      }

      if (results.failed > 0) {
        console.error('Bulk import errors:', results.errors);
      }

      return results;
    },
    onSuccess: () => {
      // Invalidate events query to refresh the list
      queryClient.invalidateQueries({
        queryKey: queryKeys.module('events').list(),
      });
    },
  });
}
