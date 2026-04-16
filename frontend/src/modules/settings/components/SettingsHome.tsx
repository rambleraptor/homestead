'use client';

import { Bell, BellOff, Bug, GitCommit, Map } from 'lucide-react';
import { Card } from '@/shared/components/Card';
import { Button } from '@/shared/components/Button';
import { Spinner } from '@/shared/components/Spinner';
import { useAuth } from '@/core/auth/useAuth';
import { useNotificationSubscription } from '../hooks/useNotificationSubscription';
import { useUpdateNotificationSubscription } from '../hooks/useUpdateNotificationSubscription';
import { useDeleteNotificationSubscription } from '../hooks/useDeleteNotificationSubscription';
import { useSendTestNotification } from '../hooks/useSendTestNotification';
import { useUpdateMapProvider } from '../hooks/useUpdateMapProvider';
import {
  isNotificationSupported,
  requestNotificationPermission,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
} from '@/core/utils/notifications';
import { ChangePasswordForm } from './ChangePasswordForm';
import { ModuleFlagsSection } from './ModuleFlagsSection';
import { useToast } from '@/shared/components/ToastProvider';
import { PageHeader } from '@/shared/components/PageHeader';
import { logger } from '@/core/utils/logger';
import type { MapProvider } from '@/core/auth/types';

export function SettingsHome() {
  const toast = useToast();
  const { user } = useAuth();
  const { data: subscription, isLoading } = useNotificationSubscription();
  const updateSubscription = useUpdateNotificationSubscription();
  const deleteSubscription = useDeleteNotificationSubscription();
  const sendTestNotification = useSendTestNotification();
  const updateMapProvider = useUpdateMapProvider();

  const isBrowserSupported = isNotificationSupported();
  const isEnabled = subscription?.enabled || false;
  const currentMapProvider = user?.map_provider || 'google';

  const handleEnableNotifications = async () => {
    try {
      // Request permission
      const granted = await requestNotificationPermission();
      if (!granted) {
        toast.error('Notification permission was denied. Please enable it in your browser settings.');
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
      logger.error('Failed to enable notifications', error);
      toast.error('Failed to enable notifications. Please try again.');
    }
  };

  const handleDisableNotifications = async () => {
    try {
      // Unsubscribe from push notifications
      await unsubscribeFromPushNotifications();

      // Delete subscription from database
      await deleteSubscription.mutateAsync();
    } catch (error) {
      logger.error('Failed to disable notifications', error);
      toast.error('Failed to disable notifications. Please try again.');
    }
  };

  const handleSendTestNotification = async () => {
    try {
      const result = await sendTestNotification.mutateAsync();
      toast.success(result.message || 'Test notification sent successfully!');
    } catch (error) {
      logger.error('Failed to send test notification', error);
      toast.error('Failed to send test notification. Make sure you have admin access.');
    }
  };

  const handleMapProviderChange = async (provider: MapProvider) => {
    try {
      await updateMapProvider.mutateAsync(provider);
      toast.success('Map provider updated successfully!');
    } catch (error) {
      logger.error('Failed to update map provider', error);
      toast.error('Failed to update map provider. Please try again.');
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
      <PageHeader
        title="Settings"
        subtitle="Manage your preferences and notifications"
      />

      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Notifications
        </h2>

        {!isBrowserSupported ? (
          <Card>
            <div className="flex items-start gap-4">
              <BellOff className="w-6 h-6 text-gray-400 mt-1" />
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">
                  Notifications Not Supported
                </h3>
                <p className="text-sm text-gray-600">
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
                  <h3 className="font-semibold text-gray-900 mb-2">
                    Web Push Notifications
                  </h3>
                  <p className="text-sm text-gray-600 mb-4">
                    {isEnabled
                      ? 'You will receive push notifications for important events and reminders.'
                      : 'Enable notifications to receive reminders for birthdays, anniversaries, and other important events.'}
                  </p>
                  {isEnabled && subscription && (
                    <div className="text-xs text-gray-500 mb-4">
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
              <h3 className="font-semibold text-gray-900 mb-2">
                How Notifications Work
              </h3>
              <ul className="text-sm text-gray-600 space-y-2">
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

      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Map Provider
        </h2>

        <Card>
          <div className="flex items-start gap-4">
            <Map className="w-6 h-6 text-blue-500 mt-1" />
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 mb-2">
                Preferred Map Service
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Choose which map service to use when viewing addresses in the People module.
              </p>
              <div className="flex gap-3">
                <Button
                  onClick={() => handleMapProviderChange('google')}
                  disabled={updateMapProvider.isPending}
                  variant={currentMapProvider === 'google' ? 'primary' : 'secondary'}
                  data-testid="map-provider-google"
                >
                  {currentMapProvider === 'google' && '✓ '}
                  Google Maps
                </Button>
                <Button
                  onClick={() => handleMapProviderChange('apple')}
                  disabled={updateMapProvider.isPending}
                  variant={currentMapProvider === 'apple' ? 'primary' : 'secondary'}
                  data-testid="map-provider-apple"
                >
                  {currentMapProvider === 'apple' && '✓ '}
                  Apple Maps
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Debug Mode
        </h2>

        <Card>
          <div className="flex items-start gap-4">
            <Bug className="w-6 h-6 text-purple-500 mt-1" />
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 mb-2">
                Test Push Notifications
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Send an immediate test push notification to verify that your notification system is working correctly.
              </p>
              <Button
                onClick={handleSendTestNotification}
                disabled={sendTestNotification.isPending}
                variant="secondary"
              >
                {sendTestNotification.isPending
                  ? 'Sending...'
                  : 'Send Test Notification'}
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <ModuleFlagsSection />

      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Security
        </h2>
        <ChangePasswordForm />
      </div>

      <AboutSection />
    </div>
  );
}

function AboutSection() {
  const commitHash = process.env.NEXT_PUBLIC_COMMIT_HASH || 'unknown';
  const commitDate = process.env.NEXT_PUBLIC_COMMIT_DATE || 'unknown';
  const commitMessage = process.env.NEXT_PUBLIC_COMMIT_MESSAGE || 'unknown';

  const shortHash =
    commitHash && commitHash !== 'unknown' ? commitHash.slice(0, 7) : commitHash;
  const formattedDate =
    commitDate && commitDate !== 'unknown'
      ? new Date(commitDate).toLocaleString()
      : commitDate;

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900 mb-4">About</h2>

      <Card>
        <div className="flex items-start gap-4">
          <GitCommit className="w-6 h-6 text-gray-500 mt-1" />
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900 mb-2">Build Info</h3>
            <dl className="text-sm text-gray-600 space-y-2">
              <div className="flex gap-2">
                <dt className="font-medium text-gray-700 w-24 shrink-0">
                  Commit:
                </dt>
                <dd
                  className="font-mono break-all"
                  data-testid="settings-commit-hash"
                  title={commitHash}
                >
                  {shortHash}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="font-medium text-gray-700 w-24 shrink-0">
                  Date:
                </dt>
                <dd data-testid="settings-commit-date">{formattedDate}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="font-medium text-gray-700 w-24 shrink-0">
                  Message:
                </dt>
                <dd data-testid="settings-commit-message">{commitMessage}</dd>
              </div>
            </dl>
          </div>
        </div>
      </Card>
    </div>
  );
}
