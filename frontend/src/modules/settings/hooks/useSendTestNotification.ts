import { useMutation } from '@tanstack/react-query';
import { pb } from '@/core/api/pocketbase';

interface TestNotificationResponse {
  success: boolean;
  message: string;
  timestamp: string;
}

export function useSendTestNotification() {
  return useMutation({
    mutationFn: async () => {
      const token = pb.authStore.token;
      const res = await fetch('/api/notifications/send-test', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const response = await res.json() as TestNotificationResponse;
      return response;
    },
  });
}
