/**
 * The app drawer: every app the signed-in person can use, grouped by sidebar
 * section, each card opening the app and carrying a pin toggle for the
 * sidebar. The list is the same visibility pass the sidebar runs
 * (`useSidebarPins`), so an app the person isn't granted never appears here,
 * not even greyed out. Pins are a preference on the person's own record and
 * change nothing but their sidebar.
 *
 * Superusers get a second mode, **Household defaults**: which apps start out
 * pinned for everyone who hasn't chosen for themselves. It writes the
 * drawer's `sidebar_defaults` flag and touches nobody's own pins.
 *
 * One layout serves both widths: on a phone the cards are icon tiles whose
 * pin badges appear in an edit mode; from `sm` up they are rows with the
 * description and a labelled Pin button always showing.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Pencil, Pin, ShieldCheck } from 'lucide-react';
import { AppIcon } from '@rambleraptor/homestead-core/apps/lazy';
import { groupAppsBySection } from '@rambleraptor/homestead-core/apps/sections';
import type { AppConfig } from '@rambleraptor/homestead-core/apps/types';
import { useAuth } from '@rambleraptor/homestead-core/auth/useAuth';
import { Button } from '@rambleraptor/homestead-core/shared/components/Button';
import { Card } from '@rambleraptor/homestead-core/shared/components/Card';
import { Input } from '@rambleraptor/homestead-core/shared/components/Input';
import { PageHeader } from '@rambleraptor/homestead-core/shared/components/PageHeader';
import { cn } from '@rambleraptor/homestead-core/shared/lib/utils';
import { useSidebarDefaults } from '../hooks/useSidebarDefaults';
import { useSidebarPinActions } from '../hooks/useSidebarPinActions';

type Mode = 'mine' | 'defaults';

function matches(app: AppConfig, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return app.name.toLowerCase().includes(q) || app.description.toLowerCase().includes(q);
}

export function AppDrawerHome() {
  const { user } = useAuth();
  const { visibleApps, pinnedApps, states, setPinned, reset, customized, isSaving } =
    useSidebarPinActions();
  const defaults = useSidebarDefaults();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState<Mode>('mine');

  const isSuperuser = user?.type === 'superuser';
  const defaultsMode = isSuperuser && mode === 'defaults';
  const shown = visibleApps.filter((app) => matches(app, query));
  const sections = groupAppsBySection(shown);
  const defaultApps = visibleApps.filter((app) => defaults.defaultIds.has(app.id));
  const saving = isSaving || defaults.isSaving;

  const togglePin = async (appId: string) => {
    try {
      await setPinned(appId, !states.get(appId)?.pinned);
    } catch {
      // Toast surfaced by the global mutation error handler (queryClient.ts).
    }
  };

  const toggleDefault = async (app: AppConfig) => {
    try {
      await defaults.setDefault(app, !defaults.defaultIds.has(app.id));
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
        subtitle={
          defaultsMode
            ? 'Choose which apps start out in the sidebar for everyone in the household.'
            : 'Everything you can use here. Pin the ones you want in your sidebar.'
        }
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
            {isSuperuser ? (
              <div
                role="tablist"
                aria-label="Which sidebar to edit"
                className="inline-flex gap-0.5 rounded-lg border border-gray-200 bg-white p-0.5"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={!defaultsMode}
                  onClick={() => setMode('mine')}
                  data-testid="app-drawer-mode-mine"
                  className={cn(
                    'h-8 rounded-md px-3 text-sm font-medium transition-colors',
                    !defaultsMode ? 'bg-brand-navy text-white' : 'text-text-muted hover:text-brand-navy',
                  )}
                >
                  My sidebar
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={defaultsMode}
                  onClick={() => setMode('defaults')}
                  data-testid="app-drawer-mode-defaults"
                  className={cn(
                    'flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors',
                    defaultsMode ? 'bg-brand-navy text-white' : 'text-text-muted hover:text-brand-navy',
                  )}
                >
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  Household defaults
                </button>
              </div>
            ) : (
              <span />
            )}
            <div className="flex flex-wrap items-center gap-3">
              {defaultsMode ? (
                <p className="text-sm text-text-muted" data-testid="app-drawer-default-summary">
                  {defaultApps.length} of {visibleApps.length} in the sidebar by default
                </p>
              ) : (
                <p className="text-sm text-text-muted" data-testid="app-drawer-summary">
                  {pinnedApps.length} of {visibleApps.length} in your sidebar
                </p>
              )}
              {!defaultsMode && customized && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleReset}
                  disabled={saving}
                  data-testid="app-drawer-reset"
                >
                  Reset to defaults
                </Button>
              )}
              {!defaultsMode && (
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
              )}
            </div>
          </div>

          {defaultsMode && (
            <div className="grid gap-4 lg:grid-cols-[1fr_16rem]">
              <p className="text-sm text-blue-900 bg-blue-50 rounded-lg px-4 py-3">
                These defaults are what a member sees until they customize their own
                sidebar. Changing one here doesn&apos;t touch anyone&apos;s pins; people
                who&apos;ve customized keep their choices.
              </p>
              <Card>
                <p className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-2">
                  A new member&apos;s sidebar
                </p>
                {defaultApps.length === 0 ? (
                  <p className="text-sm text-gray-500" data-testid="app-drawer-preview-empty">
                    Nothing pinned yet.
                  </p>
                ) : (
                  <ul className="space-y-1" data-testid="app-drawer-preview">
                    {defaultApps.map((app) => (
                      <li
                        key={app.id}
                        className="flex items-center gap-2 text-sm text-brand-slate"
                        data-testid={`app-drawer-preview-${app.id}`}
                      >
                        {app.web && <AppIcon icon={app.web.icon} className="h-4 w-4" />}
                        {app.name}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          )}

          {editing && !defaultsMode && (
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
              <div
                className={cn(
                  'grid gap-3 sm:grid-cols-2',
                  defaultsMode ? 'grid-cols-1' : 'grid-cols-3',
                )}
              >
                {section.apps.map((app) => {
                  const web = app.web;
                  if (!web) return null;
                  const state = states.get(app.id);
                  const pinned = state?.pinned ?? false;
                  const byDefault = defaults.defaultIds.has(app.id);
                  const tag =
                    state?.source === 'pinned'
                      ? 'Pinned by you'
                      : state?.source === 'unpinned'
                        ? 'Unpinned by you'
                        : null;
                  const tiles = !defaultsMode;
                  return (
                    <div
                      key={app.id}
                      className={cn(
                        'relative flex items-start gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm',
                        tiles && 'max-sm:flex-col max-sm:items-center max-sm:gap-3 max-sm:p-3',
                      )}
                      data-testid={`app-drawer-item-${app.id}`}
                    >
                      <Link
                        to={web.basePath}
                        data-testid={`app-drawer-card-${app.id}`}
                        className={cn(
                          'flex min-w-0 flex-1 items-start gap-4 text-left',
                          tiles && 'max-sm:flex-col max-sm:items-center max-sm:gap-2 max-sm:text-center',
                        )}
                      >
                        <span
                          className={cn(
                            'flex shrink-0 items-center justify-center pt-1',
                            tiles && 'max-sm:h-14 max-sm:w-14 max-sm:rounded-2xl max-sm:pt-0',
                            tiles && (pinned || !editing ? 'max-sm:bg-accent-terracotta/10' : 'max-sm:bg-gray-100'),
                          )}
                        >
                          <AppIcon
                            icon={web.icon}
                            className={cn(
                              'h-6 w-6 text-accent-terracotta',
                              tiles && editing && !pinned && 'max-sm:text-gray-400',
                            )}
                          />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span
                              className={cn(
                                'font-semibold leading-tight text-gray-900',
                                tiles && 'max-sm:text-sm',
                              )}
                            >
                              {app.name}
                            </span>
                            {!defaultsMode && tag && (
                              <span
                                className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-900 max-sm:hidden"
                                data-testid={`app-drawer-tag-${app.id}`}
                              >
                                {tag}
                              </span>
                            )}
                          </span>
                          <span
                            className={cn(
                              'mt-1 block text-sm text-gray-600',
                              tiles && 'max-sm:hidden',
                            )}
                          >
                            {app.description}
                          </span>
                        </span>
                      </Link>

                      {defaultsMode ? (
                        <button
                          type="button"
                          role="switch"
                          aria-checked={byDefault}
                          aria-label={`${app.name} in the sidebar by default`}
                          disabled={saving}
                          onClick={() => toggleDefault(app)}
                          data-testid={`app-drawer-default-${app.id}`}
                          className="flex shrink-0 items-center gap-2 rounded-lg px-2 py-1 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60"
                        >
                          <span className="hidden sm:inline">
                            {byDefault ? 'In sidebar by default' : 'Not by default'}
                          </span>
                          <span
                            aria-hidden="true"
                            className={cn(
                              'relative h-5 w-9 rounded-full transition-colors',
                              byDefault ? 'bg-accent-terracotta' : 'bg-gray-300',
                            )}
                          >
                            <span
                              className={cn(
                                'absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
                                byDefault && 'translate-x-4',
                              )}
                            />
                          </span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          aria-pressed={pinned}
                          aria-label={`${pinned ? 'Unpin' : 'Pin'} ${app.name}`}
                          disabled={saving}
                          onClick={() => togglePin(app.id)}
                          data-testid={`app-drawer-pin-${app.id}`}
                          className={cn(
                            'flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors disabled:opacity-60',
                            // Phone: a round badge on the tile, only while editing.
                            'max-sm:absolute max-sm:-top-2 max-sm:-right-2 max-sm:w-9 max-sm:rounded-full max-sm:px-0 max-sm:shadow-sm',
                            !editing && 'max-sm:hidden',
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
                      )}
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
