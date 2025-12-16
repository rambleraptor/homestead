import { Bell, BellOff, Check, Calendar } from 'lucide-react';
import { Card } from '@/shared/components/Card';
import { Button } from '@/shared/components/Button';
import { Spinner } from '@/shared/components/Spinner';
import { useNotifications } from '../hooks/useNotifications';
import { useMarkNotificationAsRead } from '../hooks/useMarkNotificationAsRead';
import { useNotificationStats } from '../hooks/useNotificationStats';
import { logger } from '@/core/utils/logger';
import type { Notification } from '../types';

export function NotificationsHome() {
  const { data: notifications, isLoading } = useNotifications();
  const { data: stats } = useNotificationStats();
  const markAsRead = useMarkNotificationAsRead();

  const handleMarkAsRead = async (id: string) => {
    try {
      await markAsRead.mutateAsync(id);
    } catch (error) {
      logger.error('Failed to mark notification as read', error);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    });
  };

  const getNotificationIcon = (notification: Notification) => {
    if (notification.event_id) {
      return <Calendar className="w-5 h-5 text-blue-500" />;
    }
    return <Bell className="w-5 h-5 text-gray-500" />;
  };

  const unreadNotifications =
    notifications?.filter((n) => !n.read) || [];
  const readNotifications = notifications?.filter((n) => n.read) || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">
          Notification Center
        </h1>
        <p className="mt-2 text-gray-600">
          View and manage your notifications
        </p>
      </div>

      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <div className="flex items-center">
              <Bell className="w-8 h-8 text-blue-500" />
              <div className="ml-4">
                <p className="text-sm text-gray-600">
                  Total Notifications
                </p>
                <p className="text-2xl font-bold text-gray-900">
                  {stats.total}
                </p>
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex items-center">
              <BellOff className="w-8 h-8 text-orange-500" />
              <div className="ml-4">
                <p className="text-sm text-gray-600">
                  Unread
                </p>
                <p className="text-2xl font-bold text-gray-900">
                  {stats.unread}
                </p>
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex items-center">
              <Check className="w-8 h-8 text-green-500" />
              <div className="ml-4">
                <p className="text-sm text-gray-600">
                  Read
                </p>
                <p className="text-2xl font-bold text-gray-900">
                  {stats.read}
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {unreadNotifications.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Unread Notifications
          </h2>
          <div className="space-y-3">
            {unreadNotifications.map((notification) => (
              <Card key={notification.id}>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    {getNotificationIcon(notification)}
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900">
                        {notification.title}
                      </h3>
                      <p className="text-sm text-gray-600 mt-1">
                        {notification.message}
                      </p>
                      <p className="text-xs text-gray-500 mt-2">
                        {formatDate(notification.created)}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleMarkAsRead(notification.id)}
                    disabled={markAsRead.isPending}
                  >
                    <Check className="w-4 h-4 mr-1" />
                    Mark as Read
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {readNotifications.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Read Notifications
          </h2>
          <div className="space-y-3">
            {readNotifications.map((notification) => (
              <Card key={notification.id}>
                <div className="flex items-start gap-3 opacity-60">
                  {getNotificationIcon(notification)}
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900">
                      {notification.title}
                    </h3>
                    <p className="text-sm text-gray-600 mt-1">
                      {notification.message}
                    </p>
                    <p className="text-xs text-gray-500 mt-2">
                      {formatDate(notification.created)}
                      {notification.read_at && (
                        <>
                          {' '}
                          • Read {formatDate(notification.read_at)}
                        </>
                      )}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {!notifications || notifications.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <Bell className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-600">
              No notifications yet
            </p>
            <p className="text-sm text-gray-500 mt-2">
              You'll receive notifications for upcoming events here
            </p>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
