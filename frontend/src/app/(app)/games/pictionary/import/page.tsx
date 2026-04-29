'use client';

import { PictionaryBulkImport } from '@/modules/games/pictionary/bulk-import';
import { ModuleEnabledGate } from '@/shared/components/ModuleEnabledGate';

export default function PictionaryImportPage() {
  return (
    <ModuleEnabledGate moduleId="pictionary">
      <PictionaryBulkImport />
    </ModuleEnabledGate>
  );
}
