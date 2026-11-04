/**
 * Sidebar Navigation Component
 *
 * Dynamically generates navigation from app registry
 * based on user permissions and role.
 */

import { Link, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Home, LayoutGrid, LogOut, X } from 'lucide-react';
import { useAuth } from '../auth/useAuth';
import { AppIcon } from '@rambleraptor/homestead-core/apps/lazy';
import { groupEntriesBySection } from '@rambleraptor/homestead-core/apps/sections';
import { useSidebarPins } from '@rambleraptor/homestead-core/apps/useSidebarPins';

/** The drawer every sidebar links to, pinned or not — see `app-drawer/`. */
const ALL_APPS_PATH = '/apps';

interface SidebarProps {
  /** Mobile drawer state (below lg). */
  isOpen: boolean;
  onClose: () => void;
  /** When true, the sidebar is hidden on desktop (lg and up). */
  desktopHidden?: boolean;
}

const COLLAPSED_SECTIONS_STORAGE_KEY = 'homestead.sidebar.collapsedSections';

export function Sidebar({ isOpen, onClose, desktopHidden = false }: SidebarProps) {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();

  // Track which sections are collapsed. Persist to localStorage so the
  // preference survives reloads. Default: all sections expanded.
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
    () => new Set(),
  );
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLLAPSED_SECTIONS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          // Loading persisted preferences post-hydration is a legitimate
          // external-system sync; the setState here is not a cascading render.
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setCollapsedSections(new Set(parsed.filter((s) => typeof s === 'string')));
        }
      }
    } catch {
      // Ignore malformed values; fall back to default (all expanded).
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(
        COLLAPSED_SECTIONS_STORAGE_KEY,
        JSON.stringify(Array.from(collapsedSections)),
      );
    } catch {
      // Ignore storage errors (e.g., quota, privacy mode).
    }
  }, [collapsedSections, hydrated]);

  const toggleSection = (section: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  // The apps this viewer can use (superuser-only apps hidden from regular
  // users, the rest filtered by the permission resolver), narrowed to the ones
  // in their sidebar. The rest are a click away in the drawer. A nested child
  // in the sidebar lists under its parent's section, indented. Superuser and
  // Settings are fixed: always listed, never movable.
  const { pinnedEntries } = useSidebarPins();
  const sections = groupEntriesBySection(pinnedEntries);

  const handleLogout = () => {
    logout();
    onClose();
  };

  const isActive = (basePath: string) => {
    return pathname === basePath || pathname.startsWith(basePath + '/');
  };
  // A parent isn't lit while one of its listed children is the better match.
  const isEntryActive = (basePath: string) =>
    isActive(basePath) &&
    !pinnedEntries.some(
      (e) =>
        e.app.web &&
        e.app.web.basePath !== basePath &&
        e.app.web.basePath.startsWith(basePath + '/') &&
        isActive(e.app.web.basePath),
    );

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 animate-overlay-in lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        id="app-sidebar"
        data-testid="app-sidebar"
        className={`
          fixed top-0 left-0 z-50 h-full w-64 bg-surface-white
          border-r border-gray-100 shadow-sm transform transition-transform duration-(--duration-settle) ease-out-soft
          ${desktopHidden ? 'lg:hidden' : 'lg:translate-x-0 lg:static'}
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="flex flex-col h-full">
          {/* Logo/Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <Link
              to="/dashboard"
              onClick={onClose}
              className="flex items-center gap-2 rounded-md hover:bg-bg-pearl px-1 -mx-1 py-0.5 transition-colors"
              data-testid="sidebar-home-link"
            >
              <Home className="w-6 h-6 text-brand-navy" />
              <h1 className="text-xl font-display font-bold text-brand-navy tracking-tight">
                Homestead
              </h1>
            </Link>
            <button
              onClick={onClose}
              className="lg:hidden p-1 rounded-md hover:bg-bg-pearl"
              aria-label="Close sidebar"
            >
              <X className="w-5 h-5 text-brand-navy" />
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="flex-1 overflow-y-auto px-4 pt-2 pb-4">
            {pinnedEntries.length === 0 ? (
              <div className="text-sm text-text-muted text-center py-4">
                No apps available
              </div>
            ) : (
              sections.map(({ name: section, entries: sectionEntries }) => {
                const collapsed = section ? collapsedSections.has(section) : false;
                const contentId = `sidebar-section-${section || 'unsectioned'}`;
                return (
                  <div key={section || 'unsectioned'} className="mb-4 last:mb-0">
                    {/* Section Header */}
                    {section && (
                      <button
                        type="button"
                        onClick={() => toggleSection(section)}
                        aria-expanded={!collapsed}
                        aria-controls={contentId}
                        data-testid={`sidebar-section-toggle-${section}`}
                        className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-text-muted uppercase tracking-wider rounded-md hover:bg-bg-pearl transition-colors"
                      >
                        <span>{section}</span>
                        {collapsed ? (
                          <ChevronRight className="w-4 h-4" aria-hidden="true" />
                        ) : (
                          <ChevronDown className="w-4 h-4" aria-hidden="true" />
                        )}
                      </button>
                    )}

                    {/* Section Apps */}
                    {!collapsed && (
                      <div id={contentId} className="space-y-1">
                        {sectionEntries.map(({ app, parent }) => {
                          const web = app.web;
                          if (!web) return null;
                          const active = isEntryActive(web.basePath);
                          return (
                            <Link
                              key={app.id}
                              to={web.basePath}
                              onClick={onClose}
                              data-testid={parent ? `sidebar-nested-${app.id}` : undefined}
                              className={`flex items-center gap-3 py-2 pr-3 rounded-lg transition-colors ${
                                parent ? 'pl-9' : 'pl-3'
                              } ${
                                active
                                  ? 'bg-accent-terracotta/10 text-accent-terracotta'
                                  : 'text-brand-slate hover:bg-bg-pearl'
                              }`}
                            >
                              <AppIcon
                                icon={web.icon}
                                className="w-5 h-5 flex-shrink-0"
                              />
                              <span className="font-medium">{app.name}</span>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </nav>

          {/* Bottom Actions */}
          <div className="p-4 border-t border-gray-100 space-y-1">
            {/* The drawer: every app the viewer can use, pinned or not. Fixed
                here so it survives an empty sidebar and can't be unpinned. */}
            {user && (
              <Link
                to={ALL_APPS_PATH}
                onClick={onClose}
                data-testid="sidebar-all-apps-link"
                className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                  isActive(ALL_APPS_PATH)
                    ? 'bg-accent-terracotta/10 text-accent-terracotta'
                    : 'text-brand-slate hover:bg-bg-pearl'
                }`}
              >
                <LayoutGrid className="w-5 h-5 flex-shrink-0" />
                <span className="font-medium">All apps</span>
              </Link>
            )}
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-brand-slate hover:bg-bg-pearl transition-colors"
              data-testid="logout-button"
            >
              <LogOut className="w-5 h-5" />
              <span className="font-medium">Logout</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
