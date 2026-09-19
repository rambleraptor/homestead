/**
 * AppShell Component
 *
 * Main application layout wrapper.
 * Combines sidebar, header, and content area. In chromeless mode
 * (`?chrome=none`, see `chromeMode.ts`) the sidebar and header are left out
 * so the active app fills the screen — the mode home-screen installs launch in.
 */

import { useCallback, useEffect, useState } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { ViewAsBanner } from './ViewAsBanner';
import { AuthGuard } from '../auth/AuthGuard';
import { OfflineBanner } from '../shared/components/OfflineBanner';
import { useHomeScreenIcon } from '../shared/pwa';
import { useBuildReload } from '../shared/useBuildReload';
import { useChromeless } from './useChromeless';

interface AppShellProps {
  children: React.ReactNode;
}

/** Persisted preference: is the sidebar hidden on desktop (lg and up)? */
const DESKTOP_HIDDEN_STORAGE_KEY = 'homestead.sidebar.desktopHidden';

function readDesktopHidden(): boolean {
  try {
    return localStorage.getItem(DESKTOP_HIDDEN_STORAGE_KEY) === 'true';
  } catch {
    // Storage unavailable (privacy mode): fall back to a visible sidebar.
    return false;
  }
}

export function AppShell({ children }: AppShellProps) {
  // Mobile drawer state — always starts closed.
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Desktop preference — read synchronously so the sidebar doesn't flash in.
  const [desktopHidden, setDesktopHidden] = useState(readDesktopHidden);

  // Swap the home-screen (PWA) icon to the active app's, when it has one.
  useHomeScreenIcon();

  // `?chrome=none` hides the sidebar + header for the session.
  const chromeless = useChromeless();

  // Reload the tab when the launcher swaps in a new SPA build (config change).
  useBuildReload();

  useEffect(() => {
    try {
      localStorage.setItem(DESKTOP_HIDDEN_STORAGE_KEY, String(desktopHidden));
    } catch {
      // Ignore storage errors (e.g., quota, privacy mode).
    }
  }, [desktopHidden]);

  const toggleSidebar = () => setSidebarOpen((prev) => !prev);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const toggleDesktopSidebar = () => setDesktopHidden((prev) => !prev);

  return (
    <AuthGuard>
      <div
        className="flex h-screen overflow-hidden bg-bg-pearl"
        data-testid="app-shell"
        data-chromeless={chromeless ? 'true' : undefined}
      >
        {/* Sidebar */}
        {!chromeless && (
          <Sidebar
            isOpen={sidebarOpen}
            onClose={closeSidebar}
            desktopHidden={desktopHidden}
          />
        )}

        {/* Main content area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* "View as user" preview banner — pinned above the (scrolling) main
              region, so it stays visible for the whole preview session. */}
          <ViewAsBanner />

          {/* Header */}
          {!chromeless && (
            <Header
              onMenuClick={toggleSidebar}
              onDesktopSidebarToggle={toggleDesktopSidebar}
              desktopSidebarHidden={desktopHidden}
            />
          )}

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
