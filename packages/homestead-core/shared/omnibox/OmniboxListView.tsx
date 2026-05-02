'use client';

/**
 * Renders the module's own list/home component with the omnibox-parsed
 * filter values seeded via context. The list component's inner
 * `<ModuleFiltersProvider>` picks the seed up as `initialValues`.
 */

import React from 'react';
import type { OmniboxAdapter } from '@rambleraptor/homestead-core/shared/omnibox/types';
import { OmniboxFilterSeedProvider } from '@rambleraptor/homestead-core/shared/filters';

interface OmniboxListViewProps {
  moduleId: string;
  adapter: OmniboxAdapter;
  filters?: Record<string, unknown>;
}

export function OmniboxListView({
  adapter,
  filters,
}: OmniboxListViewProps) {
  const ListComponent = adapter.listComponent;
  return (
    <OmniboxFilterSeedProvider values={filters}>
      <ListComponent />
    </OmniboxFilterSeedProvider>
  );
}
