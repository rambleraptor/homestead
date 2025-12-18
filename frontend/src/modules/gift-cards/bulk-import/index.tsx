/**
 * Gift Cards Bulk Import Component
 */

import { BulkImportContainer, useBulkImport } from '@/shared/bulk-import';
import { Collections } from '@/core/api/pocketbase';
import { queryKeys } from '@/core/api/queryClient';
import { giftCardsImportSchema } from './schema';

export function GiftCardsBulkImport() {
  const bulkImport = useBulkImport({
    collection: Collections.GIFT_CARDS,
    queryKey: queryKeys.module('gift-cards').list(),
    // Transform data to add null for file fields
    transformData: (data) => ({
      ...(data as Record<string, unknown>),
      front_image: null,
      back_image: null,
    }),
  });

  return (
    <BulkImportContainer
      config={{
        moduleName: 'Gift Cards',
        moduleNamePlural: 'gift cards',
        backRoute: '/gift-cards',
        schema: giftCardsImportSchema,
        onImport: bulkImport.mutateAsync,
        isImporting: bulkImport.isPending,
      }}
    />
  );
}
