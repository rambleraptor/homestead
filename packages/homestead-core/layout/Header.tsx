/**
 * Header Component
 *
 * Top navigation bar with menu toggle and icon buttons for every app
 * placed on the top bar (`AppConfig.placement: 'topbar'`).
 */

import { lazy, Suspense, type ComponentType, type LazyExoticComponent, type ReactNode } from 'react';
import type { LazyVisibilityHook } from '@rambleraptor/homestead-core/apps/types';
import { useNavigate } from 'react-router-dom';
import { Menu, PanelLeft, PanelLeftClose } from 'lucide-react';
import { getTopBarApps } from '@rambleraptor/homestead-core/apps/registry';
import { AppIcon, getLazyComponent } from '@rambleraptor/homestead-core/apps/lazy';
import { useAppVisible } from '@rambleraptor/homestead-core/apps/useAppVisibility';

type GateProps = { children: ReactNode };
const gateCache = new WeakMap<LazyVisibilityHook, LazyExoticComponent<ComponentType<GateProps>>>();

/**
 * A component that shows its children only when the app's `topBarVisible`
 * hook says so. Hooks can't be called conditionally, so each one runs inside
 * its own lazily-loaded component, cached per hook so it never remounts.
 */
function gateFor(loader: LazyVisibilityHook): LazyExoticComponent<ComponentType<GateProps>> {
  const cached = gateCache.get(loader);
  if (cached) return cached;
  const Gate = lazy(() =>
    loader().then((m) => {
      const useVisible = 'default' in m ? m.default : m;
      function TopBarGate({ children }: GateProps) {
        return useVisible() ? <>{children}</> : null;
      }
      return { default: TopBarGate };
    }),
  );
  gateCache.set(loader, Gate);
  return Gate;
}

interface HeaderProps {
  /** Toggles the mobile drawer. */
  onMenuClick: () => void;
  /** Toggles whether the sidebar is hidden on desktop (lg and up). */
  onDesktopSidebarToggle?: () => void;
  desktopSidebarHidden?: boolean;
}

export function Header({
  onMenuClick,
  onDesktopSidebarToggle,
  desktopSidebarHidden = false,
}: HeaderProps) {
  const navigate = useNavigate();

  // Top-bar apps use the same visibility rule as the sidebar.
  const isVisible = useAppVisible();
  const topBarApps = getTopBarApps().filter(isVisible);

  return (
    <header className="bg-surface-white border-b border-gray-100 sticky top-0 z-30">
      <div className="flex items-center justify-between px-4 py-3 lg:px-6">
        {/* Left side - Menu button */}
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 rounded-lg hover:bg-bg-pearl transition-colors"
          aria-label="Toggle menu"
        >
          <Menu className="w-6 h-6 text-brand-navy" />
        </button>

        {/* Desktop: sidebar show/hide toggle */}
        <div className="hidden lg:flex items-center">
          {onDesktopSidebarToggle && (
            <button
              onClick={onDesktopSidebarToggle}
              className="p-2 rounded-lg hover:bg-bg-pearl transition-colors"
              aria-label={desktopSidebarHidden ? 'Show sidebar' : 'Hide sidebar'}
              aria-expanded={!desktopSidebarHidden}
              aria-controls="app-sidebar"
              title={desktopSidebarHidden ? 'Show sidebar' : 'Hide sidebar'}
              data-testid="desktop-sidebar-toggle"
            >
              {desktopSidebarHidden ? (
                <PanelLeft className="w-5 h-5 text-brand-navy" />
              ) : (
                <PanelLeftClose className="w-5 h-5 text-brand-navy" />
              )}
            </button>
          )}
        </div>

        {/* Right side - Top-bar apps */}
        <div className="flex items-center gap-2 ml-auto">
          {topBarApps.map((app) => {
            const web = app.web;
            if (!web) return null;
            const Badge = web.topBarBadge
              ? getLazyComponent(web.topBarBadge)
              : null;
            const button = (
              <button
                key={app.id}
                onClick={() => navigate(web.basePath)}
                className="p-2 rounded-lg hover:bg-bg-pearl transition-colors relative"
                aria-label={app.name}
                data-testid={`topbar-app-${app.id}`}
              >
                <AppIcon icon={web.icon} className="w-5 h-5 text-brand-navy" />
                {Badge && (
                  <Suspense fallback={null}>
                    <Badge />
                  </Suspense>
                )}
              </button>
            );
            if (!web.topBarVisible) return button;
            const Gate = gateFor(web.topBarVisible);
            return (
              <Suspense key={app.id} fallback={null}>
                <Gate>{button}</Gate>
              </Suspense>
            );
          })}
        </div>
      </div>
    </header>
  );
}
