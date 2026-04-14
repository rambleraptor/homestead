'use client';

/**
 * Sidebar Navigation Component
 *
 * Dynamically generates navigation from module registry
 * based on user permissions and role.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Home, LogOut, X } from 'lucide-react';
import { useAuth } from '../auth/useAuth';
import { getNavigationModules } from '../../modules/registry';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const COLLAPSED_SECTIONS_STORAGE_KEY = 'homeos.sidebar.collapsedSections';

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { user, logout } = useAuth();
  const pathname = usePathname();

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

  // Get modules available to current user. Modules can opt into a superuser
  // gate via `metadata.requiresSuperuser`, which hides them for regular users.
  const modules = user
    ? getNavigationModules().filter(
        (m) => !m.metadata?.requiresSuperuser || user.type === 'superuser',
      )
    : [];

  // Group modules by section
  const modulesBySection = modules.reduce((acc, module) => {
    const section = module.section || '';
    if (!acc[section]) {
      acc[section] = [];
    }
    acc[section].push(module);
    return acc;
  }, {} as Record<string, typeof modules>);

  // Get sections in a defined order, with any unlisted sections at the end
  const sectionOrder = ['Money', 'Food', 'Relationships', 'Games', 'General'];
  const sections = Object.keys(modulesBySection).sort((a, b) => {
    const aIndex = sectionOrder.indexOf(a);
    const bIndex = sectionOrder.indexOf(b);
    const aOrder = aIndex === -1 ? sectionOrder.length : aIndex;
    const bOrder = bIndex === -1 ? sectionOrder.length : bIndex;
    return aOrder - bOrder || a.localeCompare(b);
  });

  const handleLogout = () => {
    logout();
    onClose();
  };

  const isActive = (basePath: string) => {
    return pathname === basePath || pathname.startsWith(basePath + '/');
  };

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 z-50 h-full w-64 bg-white
          shadow-lg transform transition-transform duration-300 ease-in-out
          lg:translate-x-0 lg:static
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="flex flex-col h-full">
          {/* Logo/Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <Home className="w-6 h-6 text-primary-600" />
              <h1 className="text-xl font-bold text-gray-900">
                HomeOS
              </h1>
            </div>
            <button
              onClick={onClose}
              className="lg:hidden p-1 rounded-md hover:bg-gray-100"
              aria-label="Close sidebar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="flex-1 overflow-y-auto px-4 pt-2 pb-4">
            {modules.length === 0 ? (
              <div className="text-sm text-gray-500 text-center py-4">
                No modules available
              </div>
            ) : (
              sections.map((section) => {
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
                        className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider rounded-md hover:bg-gray-100 transition-colors"
                      >
                        <span>{section}</span>
                        {collapsed ? (
                          <ChevronRight className="w-4 h-4" aria-hidden="true" />
                        ) : (
                          <ChevronDown className="w-4 h-4" aria-hidden="true" />
                        )}
                      </button>
                    )}

                    {/* Section Modules */}
                    {!collapsed && (
                      <div id={contentId} className="space-y-1">
                        {modulesBySection[section].map((module) => {
                          const Icon = module.icon;
                          const active = isActive(module.basePath);
                          return (
                            <Link
                              key={module.id}
                              href={module.basePath}
                              onClick={onClose}
                              className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                                active
                                  ? 'bg-primary-100 text-primary-700'
                                  : 'text-gray-700 hover:bg-gray-100'
                              }`}
                            >
                              <Icon className="w-5 h-5 flex-shrink-0" />
                              <span className="font-medium">{module.name}</span>
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
          <div className="p-4 border-t border-gray-200 space-y-1">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
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
