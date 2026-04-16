'use client';

/**
 * Header Component
 *
 * Top navigation bar with menu toggle and breadcrumbs
 */

import { useRouter } from 'next/navigation';
import { Menu, Bell, Search } from 'lucide-react';
import { useNotificationStats } from '../../modules/notifications/hooks/useNotificationStats';
import { useCanUseOmnibox } from '@/shared/omnibox/useCanUseOmnibox';

interface HeaderProps {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const router = useRouter();
  const { data: stats } = useNotificationStats();
  const canUseOmnibox = useCanUseOmnibox();

  const handleNotificationsClick = () => {
    router.push('/notifications');
  };

  const handleSearchClick = () => {
    router.push('/search');
  };

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

        {/* Desktop: Placeholder for breadcrumbs or page title */}
        <div className="hidden lg:block">
          {/* Breadcrumbs or additional navigation can go here */}
        </div>

        {/* Right side - Actions */}
        <div className="flex items-center gap-2 ml-auto">
          {/* Omnibox search (gated by settings.omnibox_access) */}
          {canUseOmnibox && (
            <button
              onClick={handleSearchClick}
              className="p-2 rounded-md hover:bg-gray-100 transition-colors"
              aria-label="Open natural-language search"
              data-testid="header-search-button"
            >
              <Search className="w-5 h-5 text-gray-600" />
            </button>
          )}

          {/* Notifications */}
          <button
            onClick={handleNotificationsClick}
            className="p-2 rounded-lg hover:bg-bg-pearl transition-colors relative"
            aria-label="Notifications"
          >
            <Bell className="w-5 h-5 text-brand-navy" />
            {/* Notification badge */}
            {stats && stats.unread > 0 && (
              <span className="absolute top-1 right-1 min-w-[18px] h-[18px] bg-accent-terracotta text-white text-xs font-semibold rounded-full flex items-center justify-center px-1">
                {stats.unread > 99 ? '99+' : stats.unread}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
