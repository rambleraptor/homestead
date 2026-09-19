import { useEffect, useState } from 'react';
import { Bell, BellOff, Laptop, Send, Trash2 } from 'lucide-react';
import { Card } from '@rambleraptor/homestead-core/shared/components/Card';
import { Button } from '@rambleraptor/homestead-core/shared/components/Button';
import { Spinner } from '@rambleraptor/homestead-core/shared/components/Spinner';
import { ConfirmDialog } from '@rambleraptor/homestead-core/shared/components/ConfirmDialog';
import { useToast } from '@rambleraptor/homestead-core/shared/components/ToastProvider';
import { getAepErrorMessage } from '@rambleraptor/homestead-core/api/errorMessage';
import {
  describeCurrentDevice,
  getCurrentPushSubscription,
  isNotificationSupported,
  requestNotificationPermission,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
} from '@rambleraptor/homestead-core/utils/notifications';
import {
  useNotificationSubscriptions,
  type AepNotificationSubscription,
} from '../hooks/useNotificationSubscriptions';
import { useUpdateNotificationSubscription } from '../hooks/useUpdateNotificationSubscription';
import { useDeleteNotificationSubscription } from '../hooks/useDeleteNotificationSubscription';
import { useSendTestNotification } from '../hooks/useSendTestNotification';

export function NotificationDevices() {
  const toast = useToast();
  const {
    data: subscriptions = [],
    isLoading,
    isError,
    error: loadError,
  } = useNotificationSubscriptions();
  const updateSubscription = useUpdateNotificationSubscription();
  const deleteSubscription = useDeleteNotificationSubscription();
  const sendTestNotification = useSendTestNotification();

  const [currentEndpoint, setCurrentEndpoint] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] =
    useState<AepNotificationSubscription | null>(null);

  const isBrowserSupported = isNotificationSupported();

  // Learn this browser's push endpoint so we can flag its row as "This device".
  useEffect(() => {
    if (!isBrowserSupported) return;
    let active = true;
    getCurrentPushSubscription()
      .then((sub) => {
        if (active) setCurrentEndpoint(sub?.endpoint ?? null);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [isBrowserSupported]);

  const isThisDevice = (sub: AepNotificationSubscription) =>
    !!currentEndpoint && sub.subscription_data?.endpoint === currentEndpoint;

  const thisDeviceRegistered = subscriptions.some(isThisDevice);

  const handleEnableThisDevice = async () => {
    try {
      const granted = await requestNotificationPermission();
      if (!granted) {
        toast.error(
          'Notification permission was denied. Please enable it in your browser settings.',
        );
        return;
      }
      const pushSubscription = await subscribeToPushNotifications();
      await updateSubscription.mutateAsync({
        subscription: pushSubscription,
        enabled: true,
        deviceLabel: describeCurrentDevice(),
      });
      setCurrentEndpoint(pushSubscription.endpoint);
      toast.success('Notifications enabled on this device.');
    } catch (error) {
      // The subscription hooks opt out of the global mutation toast, so this
      // is the one place the failure is shown. The browser's own message
      // ("not supported", a denied permission) is more useful than a generic
      // one here, so pass the error through rather than restating it.
      toast.error(error);
    }
  };

  const handleSendTest = async (sub: AepNotificationSubscription) => {
    setTestingId(sub.id);
    try {
      const result = await sendTestNotification.mutateAsync(sub.id);
      toast.success(result.message || 'Test notification sent.');
    } catch (error) {
      toast.error(error);
    } finally {
      setTestingId(null);
    }
  };

  const handleDeregister = async (sub: AepNotificationSubscription) => {
    try {
      // Tear down the browser subscription only for the device we're on;
      // remote devices just lose their server-side record.
      if (isThisDevice(sub)) {
        await unsubscribeFromPushNotifications();
        setCurrentEndpoint(null);
      }
      await deleteSubscription.mutateAsync(sub.id);
      toast.success('Device removed.');
    } catch (error) {
      toast.error(error);
    } finally {
      setConfirmTarget(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!isBrowserSupported) {
    return (
      <Card>
        <div className="flex items-start gap-4">
          <BellOff className="w-6 h-6 text-gray-400 mt-1" />
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">
              Notifications Not Supported
            </h3>
            <p className="text-sm text-gray-600">
              Your browser does not support web push notifications. Please use a
              modern browser like Chrome, Firefox, or Edge to enable this
              feature.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="space-y-4" data-testid="notification-devices">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <Bell className="w-6 h-6 text-blue-500 mt-1" />
            <div>
              <h3 className="font-semibold text-gray-900">
                Web Push Notifications
              </h3>
              <p className="text-sm text-gray-600">
                Manage the devices that receive your push notifications.
              </p>
            </div>
          </div>
          {!thisDeviceRegistered && (
            <Button
              onClick={handleEnableThisDevice}
              disabled={updateSubscription.isPending}
              data-testid="enable-this-device"
            >
              {updateSubscription.isPending
                ? 'Enabling...'
                : 'Enable on this device'}
            </Button>
          )}
        </div>

        {isError ? (
          <p className="text-sm text-red-600" role="alert" data-testid="devices-error">
            Couldn&apos;t load your devices: {getAepErrorMessage(loadError)}
          </p>
        ) : subscriptions.length === 0 ? (
          <p className="text-sm text-gray-500" data-testid="no-devices">
            No devices are registered for notifications yet.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {subscriptions.map((sub) => {
              const mine = isThisDevice(sub);
              return (
                <li
                  key={sub.id}
                  className="flex items-center justify-between gap-4 py-3"
                  data-testid="notification-device"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <Laptop className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 truncate">
                          {sub.device_label || 'Unknown device'}
                        </span>
                        {mine && (
                          <span
                            className="text-xs font-medium text-blue-700 bg-blue-50 rounded px-1.5 py-0.5"
                            data-testid="this-device-badge"
                          >
                            This device
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">
                        {sub.enabled ? 'Active' : 'Paused'}
                        {sub.create_time
                          ? ` · Registered ${new Date(
                              sub.create_time,
                            ).toLocaleDateString()}`
                          : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleSendTest(sub)}
                      disabled={testingId === sub.id}
                      data-testid="send-test-device"
                    >
                      <Send className="w-4 h-4 mr-1" />
                      {testingId === sub.id ? 'Sending...' : 'Send test'}
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => setConfirmTarget(sub)}
                      data-testid="deregister-device"
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      Deregister
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ConfirmDialog
        isOpen={confirmTarget !== null}
        onClose={() => setConfirmTarget(null)}
        onConfirm={() => confirmTarget && handleDeregister(confirmTarget)}
        title="Deregister device"
        message={
          confirmTarget && isThisDevice(confirmTarget)
            ? 'Stop sending push notifications to this device? You can re-enable it at any time.'
            : `Stop sending push notifications to "${
                confirmTarget?.device_label || 'this device'
              }"?`
        }
        confirmLabel="Deregister"
        variant="danger"
        isLoading={deleteSubscription.isPending}
      />
    </Card>
  );
}
