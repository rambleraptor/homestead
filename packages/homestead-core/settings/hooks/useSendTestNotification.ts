import { useMutation } from '@tanstack/react-query';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';

interface TestNotificationResponse {
  success: boolean;
  message: string;
  timestamp: string;
}

export function useSendTestNotification() {
  return useMutation({
    mutationFn: async () => {
      const token = aepbase.authStore.token;
      const userId = aepbase.getCurrentUser()?.id || '';
      const res = await fetch('/api/notifications/send-test', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-User-Id': userId,
        },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      return (await res.json()) as TestNotificationResponse;
    },
  });
}
