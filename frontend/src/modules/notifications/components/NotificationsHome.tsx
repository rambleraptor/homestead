'use client';

import { Bell, Check, Calendar } from 'lucide-react';
import { Card } from '@/shared/components/Card';
import { Button } from '@/shared/components/Button';
import { Spinner } from '@/shared/components/Spinner';
import { PageHeader } from '@/shared/components/PageHeader';
import { useNotifications } from '../hooks/useNotifications';
import { useMarkNotificationAsRead } from '../hooks/useMarkNotificationAsRead';
import { logger } from '@/core/utils/logger';
import type { Notification } from '../types';

export function NotificationsHome() {
  const { data: notifications, isLoading } = useNotifications();
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
    // Use source_collection for icon selection (with person_id fallback for backward compatibility)
    if (notification.source_collection === 'people' || notification.person_id) {
      return <Calendar className="w-5 h-5 text-blue-500" />;
    }
    return <Bell className="w-5 h-5 text-gray-500" />;
  };

  const unreadNotifications =
    notifications?.filter((n) => !n.read) || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notification Center"
        subtitle="View and manage your notifications"
      />

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

      {!notifications || unreadNotifications.length === 0 ? (
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
