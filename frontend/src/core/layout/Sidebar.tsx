'use client';

/**
 * Sidebar Navigation Component
 *
 * Dynamically generates navigation from module registry
 * based on user permissions and role.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, LogOut, X } from 'lucide-react';
import { useAuth } from '../auth/useAuth';
import { getNavigationModules } from '../../modules/registry';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  // Get modules available to current user
  const modules = user ? getNavigationModules() : [];

  // Group modules by section
  const modulesBySection = modules.reduce((acc, module) => {
    const section = module.section || '';
    if (!acc[section]) {
      acc[section] = [];
    }
    acc[section].push(module);
    return acc;
  }, {} as Record<string, typeof modules>);

  // Get sections in order: named sections first (sorted alphabetically), then unsectioned
  const sections = Object.keys(modulesBySection).sort((a, b) => {
    if (a === '') return 1; // Empty section (unsectioned) goes last
    if (b === '') return -1;
    return a.localeCompare(b);
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
              sections.map((section) => (
                <div key={section || 'unsectioned'} className="mb-4 last:mb-0">
                  {/* Section Header */}
                  {section && (
                    <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      {section}
                    </div>
                  )}

                  {/* Section Modules */}
                  <div className="space-y-1">
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
                </div>
              ))
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
