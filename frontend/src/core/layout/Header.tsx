/**
 * Header Component
 *
 * Top navigation bar with menu toggle and breadcrumbs
 */


import { Menu, Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useNotificationStats } from '../../modules/notifications/hooks/useNotificationStats';

interface HeaderProps {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const navigate = useNavigate();
  const { data: stats } = useNotificationStats();

  const handleNotificationsClick = () => {
    navigate('/notifications');
  };

  return (
    <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 sticky top-0 z-30">
      <div className="flex items-center justify-between px-4 py-3">
        {/* Left side - Menu button */}
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          aria-label="Toggle menu"
        >
          <Menu className="w-6 h-6 text-gray-600 dark:text-gray-400" />
        </button>

        {/* Desktop: Placeholder for breadcrumbs or page title */}
        <div className="hidden lg:block">
          {/* Breadcrumbs or additional navigation can go here */}
        </div>

        {/* Right side - Actions */}
        <div className="flex items-center gap-2 ml-auto">
          {/* Notifications */}
          <button
            onClick={handleNotificationsClick}
            className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors relative"
            aria-label="Notifications"
          >
            <Bell className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            {/* Notification badge */}
            {stats && stats.unread > 0 && (
              <span className="absolute top-1 right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-xs font-semibold rounded-full flex items-center justify-center px-1">
                {stats.unread > 99 ? '99+' : stats.unread}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
