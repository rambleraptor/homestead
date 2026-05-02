import { useMutation } from '@tanstack/react-query';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';

interface GroceryNotificationResponse {
  success: boolean;
  message: string;
  timestamp: string;
}

export function useSendGroceryNotification() {
  return useMutation({
    // Notifications make no sense queued — fail fast offline.
    networkMode: 'online',
    mutationFn: async () => {
      const token = aepbase.authStore.token;
      const userId = aepbase.getCurrentUser()?.id || '';
      const res = await fetch('/api/notifications/send-grocery', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-User-Id': userId,
        },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      return (await res.json()) as GroceryNotificationResponse;
    },
  });
}
