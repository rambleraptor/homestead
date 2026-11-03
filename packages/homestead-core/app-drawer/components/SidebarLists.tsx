/**
 * The two lists a sidebar is edited with: the entries in it on the left, in
 * sidebar order, and everything else on the right as tiles. One button moves
 * an entry between them; tapping an entry's icon or name opens the app.
 *
 * A parent with visible children is a folder tile (a mini grid of its
 * children's icons); its children are tiles of their own, labelled with the
 * parent, so a person can put Bridge in the sidebar without all of Games.
 *
 * Used twice: the drawer edits the signed-in person's sidebar, and the
 * superuser's Sidebar defaults page edits a new member's.
 */

import { Link } from 'react-router-dom';
import { Minus, Plus } from 'lucide-react';
import { AppIcon } from '@rambleraptor/homestead-core/apps/lazy';
import { groupEntriesBySection } from '@rambleraptor/homestead-core/apps/sections';
import type { SidebarEntry } from '@rambleraptor/homestead-core/apps/sidebarPins';
import { cn } from '@rambleraptor/homestead-core/shared/lib/utils';

export interface SidebarListsProps {
  /** Every entry the viewer can reach, in nav order. */
  entries: readonly SidebarEntry[];
  /** Ids of the entries in the left list. */
  inSidebar: ReadonlySet<string>;
  /** Heading of the left list. */
  leftTitle: string;
  /** Shown in the left list when it's empty. */
  leftEmpty: string;
  /** Rendered under the left list (a reset link, say). */
  leftFooter?: React.ReactNode;
  /** A search string narrowing both lists; children match through their parent. */
  query?: string;
  onAdd: (entry: SidebarEntry) => void;
  onRemove: (entry: SidebarEntry) => void;
  /** Disables the move buttons while a write is in flight. */
  busy?: boolean;
  /** Which sidebar the move buttons speak of, for their labels. */
  whose: 'your' | 'the default';
}

function matches(entry: SidebarEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const { app } = entry;
  if (app.name.toLowerCase().includes(q) || app.description.toLowerCase().includes(q)) return true;
  return (app.children ?? []).some((c) => c.name.toLowerCase().includes(q));
}

function visibleChildren(entry: SidebarEntry, entries: readonly SidebarEntry[]): SidebarEntry[] {
  return entries.filter((e) => e.parent?.id === entry.app.id);
}

export function SidebarLists({
  entries,
  inSidebar,
  leftTitle,
  leftEmpty,
  leftFooter,
  query = '',
  onAdd,
  onRemove,
  busy = false,
  whose,
}: SidebarListsProps) {
  const shown = entries.filter((e) => matches(e, query));
  const left = shown.filter((e) => inSidebar.has(e.app.id));
  const right = shown.filter((e) => !inSidebar.has(e.app.id));
  const leftSections = groupEntriesBySection(left);
  const count = (n: number) => `${n} ${n === 1 ? 'app' : 'apps'}`;

  return (
    <div className="flex flex-wrap items-start gap-6">
      <section
        aria-label={leftTitle}
        className="flex w-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm lg:w-80"
        data-testid="sidebar-lists-left"
      >
        <div className="flex items-baseline justify-between gap-2 px-5 pt-4 pb-2">
          <h2 className="text-base font-semibold text-gray-900">{leftTitle}</h2>
          <span className="text-xs text-text-muted">{count(left.length)}</span>
        </div>
        {left.length === 0 ? (
          <p className="px-5 py-6 text-sm text-text-muted" data-testid="sidebar-lists-left-empty">
            {query ? 'No apps match that search.' : leftEmpty}
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5 px-2 pb-2">
            {leftSections.map((section) =>
              section.entries.map((entry, index) => {
                const { app, parent } = entry;
                const web = app.web;
                if (!web) return null;
                const first = index === 0 && section.name;
                return (
                  <li key={app.id}>
                    {first && (
                      <p className="px-2 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                        {section.name}
                      </p>
                    )}
                    <div
                      className={cn(
                        'flex min-h-11 items-center gap-3 rounded-lg py-1.5 pr-2 hover:bg-bg-pearl',
                        parent ? 'pl-7' : 'pl-2',
                      )}
                      data-testid={`app-drawer-row-${app.id}`}
                    >
                      <Link
                        to={web.basePath}
                        aria-label={`Open ${app.name}`}
                        data-testid={`app-drawer-open-${app.id}`}
                        className="flex min-w-0 flex-1 items-center gap-3 text-brand-slate"
                      >
                        <AppIcon icon={web.icon} className="h-5 w-5 shrink-0 text-accent-terracotta" />
                        <span className="truncate font-medium">{app.name}</span>
                        {parent && (
                          <span className="shrink-0 text-xs text-text-muted">in {parent.name}</span>
                        )}
                      </Link>
                      <button
                        type="button"
                        aria-label={`Move ${app.name} out of ${whose} sidebar`}
                        disabled={busy}
                        onClick={() => onRemove(entry)}
                        data-testid={`app-drawer-remove-${app.id}`}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-text-muted transition-colors hover:border-brand-navy hover:bg-brand-navy hover:text-white disabled:opacity-60"
                      >
                        <Minus className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </li>
                );
              }),
            )}
          </ul>
        )}
        {leftFooter && <div className="border-t border-gray-100 px-5 py-3">{leftFooter}</div>}
      </section>

      <section
        aria-label="More apps"
        className="flex min-w-0 flex-1 basis-80 flex-col gap-3"
        data-testid="sidebar-lists-right"
      >
        <div className="flex items-baseline justify-between gap-2 px-1">
          <h2 className="text-base font-semibold text-gray-900">More apps</h2>
          <span className="text-xs text-text-muted">{count(right.length)}</span>
        </div>
        {right.length === 0 ? (
          <p
            className="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-8 text-center text-sm text-text-muted"
            data-testid="sidebar-lists-right-empty"
          >
            {query ? 'No apps match that search.' : 'Everything you can use is already there.'}
          </p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(150px,100%),1fr))] gap-3">
            {right.map((entry) => {
              const { app, parent } = entry;
              const web = app.web;
              if (!web) return null;
              const children = visibleChildren(entry, entries);
              const folder = children.length > 0;
              return (
                <div
                  key={app.id}
                  className="relative flex flex-col items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 pt-4 pb-3 transition-colors hover:border-gray-300"
                  data-testid={folder ? `app-drawer-folder-${app.id}` : `app-drawer-tile-${app.id}`}
                >
                  <Link
                    to={web.basePath}
                    aria-label={`Open ${app.name}`}
                    data-testid={`app-drawer-open-${app.id}`}
                    className="flex w-full flex-col items-center gap-2 text-inherit"
                  >
                    {folder ? (
                      <span className="grid h-14 w-14 grid-cols-2 gap-1 rounded-2xl bg-gray-100 p-2">
                        {children.slice(0, 4).map((child) =>
                          child.app.web ? (
                            <AppIcon
                              key={child.app.id}
                              icon={child.app.web.icon}
                              className="h-full w-full text-accent-terracotta"
                            />
                          ) : null,
                        )}
                      </span>
                    ) : (
                      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-terracotta/10">
                        <AppIcon icon={web.icon} className="h-6 w-6 text-accent-terracotta" />
                      </span>
                    )}
                    <span className="text-center text-sm font-semibold leading-tight text-gray-900">
                      {app.name}
                    </span>
                    <span className="text-center text-[11px] text-text-muted">
                      {folder ? count(children.length) : parent ? `in ${parent.name}` : ' '}
                    </span>
                  </Link>
                  <button
                    type="button"
                    aria-label={`Add ${app.name} to ${whose} sidebar`}
                    disabled={busy}
                    onClick={() => onAdd(entry)}
                    data-testid={`app-drawer-add-${app.id}`}
                    className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 bg-white text-text-muted transition-colors hover:border-brand-navy hover:bg-brand-navy hover:text-white disabled:opacity-60"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
