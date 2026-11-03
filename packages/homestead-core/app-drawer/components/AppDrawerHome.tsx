/**
 * The app drawer: every app the signed-in person can use, in two lists.
 * "Your sidebar" is the sidebar, in its order; "More apps" is everything
 * else. One button moves an entry between them, and tapping an entry opens
 * it. The lists come from the same visibility pass the sidebar runs
 * (`useSidebarPins`), so an app the person isn't granted never appears here,
 * not even greyed out. Moving an app changes nothing but their sidebar.
 */

import { useState } from 'react';
import { Input } from '@rambleraptor/homestead-core/shared/components/Input';
import { PageHeader } from '@rambleraptor/homestead-core/shared/components/PageHeader';
import { Card } from '@rambleraptor/homestead-core/shared/components/Card';
import { useSidebarPinActions } from '../hooks/useSidebarPinActions';
import { SidebarLists } from './SidebarLists';

export function AppDrawerHome() {
  const { entries, pinnedEntries, setPinned, reset, customized, isSaving } =
    useSidebarPinActions();
  const [query, setQuery] = useState('');

  const move = async (appId: string, pinned: boolean) => {
    try {
      await setPinned(appId, pinned);
    } catch {
      // Toast surfaced by the global mutation error handler (queryClient.ts).
    }
  };

  const handleReset = async () => {
    try {
      await reset();
    } catch {
      // Toast surfaced by the global mutation error handler (queryClient.ts).
    }
  };

  return (
    <div className="space-y-6" data-testid="app-drawer">
      <PageHeader
        title="All apps"
        subtitle="Tap an app to open it. Move it between the two lists to change your sidebar."
        actions={
          entries.length > 0 ? (
            <div className="w-full sm:w-64">
              <Input
                type="search"
                aria-label="Search apps"
                placeholder="Search apps"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                data-testid="app-drawer-search"
              />
            </div>
          ) : undefined
        }
      />

      {entries.length === 0 ? (
        <Card>
          <p className="text-center text-gray-600 py-8" data-testid="app-drawer-empty">
            No apps have been shared with you yet.
          </p>
        </Card>
      ) : (
        <SidebarLists
          entries={entries}
          inSidebar={new Set(pinnedEntries.map((e) => e.app.id))}
          leftTitle="Your sidebar"
          leftEmpty="Nothing here yet. Add apps from the right."
          leftFooter={
            customized ? (
              <button
                type="button"
                onClick={handleReset}
                disabled={isSaving}
                data-testid="app-drawer-reset"
                className="text-sm text-text-muted underline hover:text-brand-navy disabled:opacity-60"
              >
                Back to the household&apos;s defaults
              </button>
            ) : undefined
          }
          query={query}
          onAdd={(entry) => move(entry.app.id, true)}
          onRemove={(entry) => move(entry.app.id, false)}
          busy={isSaving}
          whose="your"
        />
      )}

      <p className="text-xs text-text-muted">
        Apps you don&apos;t see here haven&apos;t been shared with you. Anything in More apps
        still opens from here, a link, a widget, or the assistant.
      </p>
    </div>
  );
}
