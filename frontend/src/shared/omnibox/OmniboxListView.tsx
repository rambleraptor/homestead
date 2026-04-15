'use client';

/**
 * Renders the module's own list/home component with omnibox filters
 * available via `useOmniboxFilter()` inside the component.
 */

import React from 'react';
import type { OmniboxAdapter } from '@/shared/omnibox/types';
import { OmniboxFilterProvider } from '@/shared/omnibox/OmniboxContext';

interface OmniboxListViewProps {
  moduleId: string;
  adapter: OmniboxAdapter;
  filters?: Record<string, unknown>;
}

export function OmniboxListView({
  moduleId,
  adapter,
  filters,
}: OmniboxListViewProps) {
  const ListComponent = adapter.listComponent;
  return (
    <OmniboxFilterProvider moduleId={moduleId} filters={filters ?? {}}>
      <ListComponent />
    </OmniboxFilterProvider>
  );
}
