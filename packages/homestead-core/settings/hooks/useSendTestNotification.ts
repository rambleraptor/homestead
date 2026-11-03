import { useMutation } from '@tanstack/react-query';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';

interface TestNotificationResponse {
  success: boolean;
  message: string;
  timestamp: string;
}

/**
 * Send a test notification. Pass a `subscriptionId` to target a single device;
 * omit it to send to every enabled device.
 */
export function useSendTestNotification() {
  return useMutation({
    // SettingsHome shows its own admin-access hint on failure, so skip the
    // global mutation error toast here.
    meta: { skipErrorToast: true },
    mutationFn: async (subscriptionId?: string) => {
      const userId = aepbase.getCurrentUser()?.id || '';
      const res = await aepbase.authorizedFetch('/api/notifications/send-test', {
        method: 'POST',
        headers: { 'X-User-Id': userId, 'Content-Type': 'application/json' },
        body: JSON.stringify(subscriptionId ? { subscriptionId } : {}),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      return (await res.json()) as TestNotificationResponse;
    },
  });
}
