'use client';

import { BulkImportContainer } from '@/shared/bulk-import';
import { pictionaryImportSchema } from './schema';
import { useBulkImportPictionary } from './useBulkImportPictionary';

export function PictionaryBulkImport() {
  const bulkImport = useBulkImportPictionary();

  return (
    <BulkImportContainer
      config={{
        moduleName: 'Pictionary Games',
        moduleNamePlural: 'pictionary games',
        backRoute: '/pictionary',
        schema: pictionaryImportSchema,
        onImport: bulkImport.mutateAsync,
        isImporting: bulkImport.isPending,
      }}
    />
  );
}
