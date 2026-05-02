'use client';

/**
 * People Bulk Import Component
 */

import { BulkImportContainer } from '@/shared/bulk-import';
import { peopleImportSchema } from './schema';
import { useBulkImportPeople } from '../hooks/useBulkImportPeople';

export function PeopleBulkImport() {
  const bulkImport = useBulkImportPeople();

  return (
    <BulkImportContainer
      config={{
        moduleName: 'People',
        moduleNamePlural: 'people',
        backRoute: '/people',
        schema: peopleImportSchema,
        onImport: bulkImport.mutateAsync,
        isImporting: bulkImport.isPending,
      }}
    />
  );
}
