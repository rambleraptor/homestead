'use client';

import { useMemo } from 'react';
import { BulkImportContainer } from '@/shared/bulk-import';
import { usePeopleNameMap } from './peopleMap';
import { makePictionaryImportSchema } from './schema';
import { useBulkImportPictionary } from './useBulkImportPictionary';

export function PictionaryBulkImport() {
  const bulkImport = useBulkImportPictionary();
  const { data: peopleByName, isLoading } = usePeopleNameMap();

  const schema = useMemo(
    () => makePictionaryImportSchema(peopleByName),
    [peopleByName],
  );

  if (isLoading) {
    return (
      <div className="container mx-auto max-w-6xl px-4 py-8">
        <p className="text-muted-foreground">Loading people…</p>
      </div>
    );
  }

  return (
    <BulkImportContainer
      config={{
        moduleName: 'Pictionary Games',
        moduleNamePlural: 'pictionary games',
        backRoute: '/games/pictionary',
        schema,
        onImport: bulkImport.mutateAsync,
        isImporting: bulkImport.isPending,
      }}
    />
  );
}
