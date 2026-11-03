/**
 * The app drawer: every app the signed-in person can use, grouped by sidebar
 * section, each card opening the app and carrying a pin toggle for the
 * sidebar. The list is the same visibility pass the sidebar runs
 * (`useSidebarPins`), so an app the person isn't granted never appears here,
 * not even greyed out. Pins are a preference on the person's own record and
 * change nothing but their sidebar.
 *
 * One layout serves both widths: on a phone the cards are icon tiles whose
 * pin badges appear in an edit mode; from `sm` up they are rows with the
 * description and a labelled Pin button always showing.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Pencil, Pin } from 'lucide-react';
import { AppIcon } from '@rambleraptor/homestead-core/apps/lazy';
import { groupAppsBySection } from '@rambleraptor/homestead-core/apps/sections';
import type { AppConfig } from '@rambleraptor/homestead-core/apps/types';
import { Button } from '@rambleraptor/homestead-core/shared/components/Button';
import { Card } from '@rambleraptor/homestead-core/shared/components/Card';
import { Input } from '@rambleraptor/homestead-core/shared/components/Input';
import { PageHeader } from '@rambleraptor/homestead-core/shared/components/PageHeader';
import { cn } from '@rambleraptor/homestead-core/shared/lib/utils';
import { useSidebarPinActions } from '../hooks/useSidebarPinActions';

function matches(app: AppConfig, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return app.name.toLowerCase().includes(q) || app.description.toLowerCase().includes(q);
}

export function AppDrawerHome() {
  const { visibleApps, pinnedApps, states, setPinned, reset, customized, isSaving } =
    useSidebarPinActions();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(false);

  const shown = visibleApps.filter((app) => matches(app, query));
  const sections = groupAppsBySection(shown);

  const togglePin = async (appId: string) => {
    try {
      await setPinned(appId, !states.get(appId)?.pinned);
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
        subtitle="Everything you can use here. Pin the ones you want in your sidebar."
        actions={
          visibleApps.length > 0 ? (
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

      {visibleApps.length === 0 ? (
        <Card>
          <p className="text-center text-gray-600 py-8" data-testid="app-drawer-empty">
            No apps have been shared with you yet.
          </p>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-text-muted" data-testid="app-drawer-summary">
              {pinnedApps.length} of {visibleApps.length} in your sidebar
            </p>
            <div className="flex items-center gap-2">
              {customized && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleReset}
                  disabled={isSaving}
                  data-testid="app-drawer-reset"
                >
                  Reset to defaults
                </Button>
              )}
              <Button
                variant={editing ? 'primary' : 'secondary'}
                size="sm"
                className="sm:hidden"
                aria-pressed={editing}
                onClick={() => setEditing((v) => !v)}
                data-testid="app-drawer-edit"
              >
                {editing ? (
                  <>
                    <Check className="w-4 h-4" aria-hidden="true" />
                    Done
                  </>
                ) : (
                  <>
                    <Pencil className="w-4 h-4" aria-hidden="true" />
                    Edit
                  </>
                )}
              </Button>
            </div>
          </div>

          {editing && (
            <p className="sm:hidden text-sm text-amber-900 bg-amber-50 rounded-lg px-3 py-2">
              Tap the pin on an app to show or hide it in your sidebar.
            </p>
          )}

          {shown.length === 0 && (
            <Card>
              <p className="text-center text-gray-600 py-8" data-testid="app-drawer-no-matches">
                No apps match that search.
              </p>
            </Card>
          )}

          {sections.map((section) => (
            <section key={section.name || 'unsectioned'} className="space-y-3">
              {section.name && (
                <h2 className="text-lg font-semibold text-gray-900">{section.name}</h2>
              )}
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-2">
                {section.apps.map((app) => {
                  const web = app.web;
                  if (!web) return null;
                  const pinned = states.get(app.id)?.pinned ?? false;
                  return (
                    <div
                      key={app.id}
                      className="relative flex flex-col items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm sm:flex-row sm:items-start sm:gap-4 sm:p-5"
                      data-testid={`app-drawer-item-${app.id}`}
                    >
                      <Link
                        to={web.basePath}
                        data-testid={`app-drawer-card-${app.id}`}
                        className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center sm:flex-row sm:items-start sm:gap-4 sm:text-left"
                      >
                        <span
                          className={cn(
                            'flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl sm:h-auto sm:w-auto sm:rounded-none sm:bg-transparent sm:pt-1',
                            pinned || !editing ? 'bg-accent-terracotta/10' : 'bg-gray-100',
                          )}
                        >
                          <AppIcon
                            icon={web.icon}
                            className={cn(
                              'h-6 w-6',
                              pinned || !editing ? 'text-accent-terracotta' : 'text-gray-400',
                            )}
                          />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold leading-tight text-gray-900 sm:text-base">
                            {app.name}
                          </span>
                          <span className="mt-1 hidden text-sm text-gray-600 sm:block">
                            {app.description}
                          </span>
                        </span>
                      </Link>
                      <button
                        type="button"
                        aria-pressed={pinned}
                        aria-label={`${pinned ? 'Unpin' : 'Pin'} ${app.name}`}
                        disabled={isSaving}
                        onClick={() => togglePin(app.id)}
                        data-testid={`app-drawer-pin-${app.id}`}
                        className={cn(
                          'flex shrink-0 items-center justify-center gap-1.5 rounded-full border text-sm font-medium transition-colors disabled:opacity-60',
                          // Phone: a round badge on the tile, only while editing.
                          'absolute -top-2 -right-2 h-9 w-9 shadow-sm',
                          !editing && 'max-sm:hidden',
                          // Desktop: a labelled pill beside the description.
                          'sm:static sm:h-9 sm:w-auto sm:rounded-lg sm:px-3 sm:shadow-none',
                          pinned
                            ? 'border-accent-terracotta/30 bg-accent-terracotta/10 text-accent-terracotta-hover'
                            : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50',
                        )}
                      >
                        <Pin
                          className="h-4 w-4"
                          fill={pinned ? 'currentColor' : 'none'}
                          aria-hidden="true"
                        />
                        <span className="hidden sm:inline">{pinned ? 'Pinned' : 'Pin'}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </>
      )}

      <p className="text-xs text-text-muted">
        Apps you don&apos;t see here haven&apos;t been shared with you. An unpinned app still
        opens from a link, a widget, or the assistant.
      </p>
    </div>
  );
}
