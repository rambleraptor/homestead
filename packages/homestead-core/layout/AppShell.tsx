'use client';

/**
 * AppShell Component
 *
 * Main application layout wrapper.
 * Combines sidebar, header, and content area.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { AuthGuard } from '../auth/AuthGuard';
import { useCanUseOmnibox } from '@rambleraptor/homestead-core/shared/omnibox/useCanUseOmnibox';
import { OfflineBanner } from '../shared/components/OfflineBanner';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const router = useRouter();
  const canUseOmnibox = useCanUseOmnibox();

  const toggleSidebar = () => setSidebarOpen((prev) => !prev);
  const closeSidebar = () => setSidebarOpen(false);

  // Global Cmd/Ctrl+K shortcut to open the omnibox. Gated by
  // settings.omnibox_access — for users without access the shortcut is a
  // no-op, which also prevents accidental discovery.
  useEffect(() => {
    if (!canUseOmnibox) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        router.push('/search');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canUseOmnibox, router]);

  return (
    <AuthGuard>
      <div className="flex h-screen overflow-hidden bg-bg-pearl">
        {/* Sidebar */}
        <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} />

        {/* Main content area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <Header onMenuClick={toggleSidebar} />

          {/* Page content */}
          <main className="flex-1 overflow-y-auto">
            <div className="container mx-auto px-4 py-6 lg:px-6 lg:py-8 max-w-7xl">
              {children}
            </div>
          </main>
        </div>

        <OfflineBanner />
      </div>
    </AuthGuard>
  );
}
