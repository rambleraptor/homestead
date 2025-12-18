/**
 * Events Bulk Import Component
 */

import { BulkImportContainer, useBulkImport } from '@/shared/bulk-import';
import { Collections } from '@/core/api/pocketbase';
import { queryKeys } from '@/core/api/queryClient';
import { eventsImportSchema } from './schema';

export function EventsBulkImport() {
  const bulkImport = useBulkImport({
    collection: Collections.EVENTS,
    queryKey: queryKeys.module('events').list(),
  });

  return (
    <BulkImportContainer
      config={{
        moduleName: 'Events',
        moduleNamePlural: 'events',
        backRoute: '/events',
        schema: eventsImportSchema,
        onImport: bulkImport.mutateAsync,
        isImporting: bulkImport.isPending,
      }}
    />
  );
}
