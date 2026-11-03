/**
 * Superuser → Sidebar defaults: what a new member's sidebar starts with,
 * edited with the same two lists as the drawer. The left list is the default
 * sidebar; moving an app changes the household's `sidebar_defaults` flag and
 * touches nobody's own choices.
 */

import { useState } from 'react';
import { Input } from '@rambleraptor/homestead-core/shared/components/Input';
import { PageHeader } from '@rambleraptor/homestead-core/shared/components/PageHeader';
import { useSidebarDefaults } from '../hooks/useSidebarDefaults';
import { SidebarLists } from './SidebarLists';

export function SidebarDefaultsHome() {
  const { entries, defaultIds, setDefault, isSaving } = useSidebarDefaults();
  const [query, setQuery] = useState('');

  const move = async (entry: Parameters<typeof setDefault>[0], pinned: boolean) => {
    try {
      await setDefault(entry, pinned);
    } catch {
      // Toast surfaced by the global mutation error handler (queryClient.ts).
    }
  };

  return (
    <div className="space-y-6" data-testid="sidebar-defaults">
      <PageHeader
        title="Sidebar defaults"
        subtitle="What a member's sidebar starts with. People who've customized theirs keep their choices."
        actions={
          <div className="w-full sm:w-64">
            <Input
              type="search"
              aria-label="Search apps"
              placeholder="Search apps"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              data-testid="sidebar-defaults-search"
            />
          </div>
        }
      />

      <SidebarLists
        entries={entries}
        inSidebar={defaultIds}
        leftTitle="A new member's sidebar"
        leftEmpty="Nothing here yet. Add apps from the right."
        query={query}
        onAdd={(entry) => move(entry, true)}
        onRemove={(entry) => move(entry, false)}
        busy={isSaving}
        whose="the default"
      />

      <p className="text-xs text-text-muted">
        Each member only ever sees the apps they&apos;re granted, whatever the defaults say.
      </p>
    </div>
  );
}
