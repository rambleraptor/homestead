import { Bell, BellOff } from 'lucide-react';
import { Card } from '@/shared/components/Card';
import { Button } from '@/shared/components/Button';
import { Spinner } from '@/shared/components/Spinner';
import { useNotificationSubscription } from '../hooks/useNotificationSubscription';
import { useUpdateNotificationSubscription } from '../hooks/useUpdateNotificationSubscription';
import { useDeleteNotificationSubscription } from '../hooks/useDeleteNotificationSubscription';
import {
  isNotificationSupported,
  requestNotificationPermission,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
} from '@/core/utils/notifications';

export function SettingsHome() {
  const { data: subscription, isLoading } = useNotificationSubscription();
  const updateSubscription = useUpdateNotificationSubscription();
  const deleteSubscription = useDeleteNotificationSubscription();

  const isBrowserSupported = isNotificationSupported();
  const isEnabled = subscription?.enabled || false;

  const handleEnableNotifications = async () => {
    try {
      // Request permission
      const granted = await requestNotificationPermission();
      if (!granted) {
        alert('Notification permission was denied. Please enable it in your browser settings.');
        return;
      }

      // Subscribe to push notifications
      const pushSubscription = await subscribeToPushNotifications();

      // Save subscription to database
      await updateSubscription.mutateAsync({
        subscription: pushSubscription,
        enabled: true,
      });
    } catch (error) {
      console.error('Failed to enable notifications:', error);
      alert('Failed to enable notifications. Please try again.');
    }
  };

  const handleDisableNotifications = async () => {
    try {
      // Unsubscribe from push notifications
      await unsubscribeFromPushNotifications();

      // Delete subscription from database
      await deleteSubscription.mutateAsync();
    } catch (error) {
      console.error('Failed to disable notifications:', error);
      alert('Failed to disable notifications. Please try again.');
    }
  };

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
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Settings
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Manage your preferences and notifications
        </p>
      </div>

      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Notifications
        </h2>

        {!isBrowserSupported ? (
          <Card>
            <div className="flex items-start gap-4">
              <BellOff className="w-6 h-6 text-gray-400 mt-1" />
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                  Notifications Not Supported
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Your browser does not support web push notifications. Please
                  use a modern browser like Chrome, Firefox, or Edge to enable
                  this feature.
                </p>
              </div>
            </div>
          </Card>
        ) : (
          <Card>
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-4">
                {isEnabled ? (
                  <Bell className="w-6 h-6 text-blue-500 mt-1" />
                ) : (
                  <BellOff className="w-6 h-6 text-gray-400 mt-1" />
                )}
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                    Web Push Notifications
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    {isEnabled
                      ? 'You will receive push notifications for important events and reminders.'
                      : 'Enable notifications to receive reminders for birthdays, anniversaries, and other important events.'}
                  </p>
                  {isEnabled && subscription && (
                    <div className="text-xs text-gray-500 dark:text-gray-500 mb-4">
                      <p>Status: Active</p>
                      <p>
                        Enabled since:{' '}
                        {new Date(subscription.created).toLocaleDateString()}
                      </p>
                    </div>
                  )}
                  <div>
                    {isEnabled ? (
                      <Button
                        variant="secondary"
                        onClick={handleDisableNotifications}
                        disabled={deleteSubscription.isPending}
                      >
                        {deleteSubscription.isPending
                          ? 'Disabling...'
                          : 'Disable Notifications'}
                      </Button>
                    ) : (
                      <Button
                        onClick={handleEnableNotifications}
                        disabled={updateSubscription.isPending}
                      >
                        {updateSubscription.isPending
                          ? 'Enabling...'
                          : 'Enable Notifications'}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </Card>
        )}

        {isBrowserSupported && (
          <Card>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                How Notifications Work
              </h3>
              <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
                <li>
                  • You'll receive notifications based on your event reminder
                  preferences
                </li>
                <li>
                  • Notifications can be sent the day of, day before, or week
                  before an event
                </li>
                <li>
                  • You can manage notification preferences for each event
                  individually
                </li>
                <li>
                  • All notifications are stored in the Notification Center for
                  later review
                </li>
              </ul>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
