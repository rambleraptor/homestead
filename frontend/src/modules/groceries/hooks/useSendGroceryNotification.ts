import { useMutation } from '@tanstack/react-query';
import { pb } from '@/core/api/pocketbase';

interface GroceryNotificationResponse {
  success: boolean;
  message: string;
  timestamp: string;
}

export function useSendGroceryNotification() {
  return useMutation({
    mutationFn: async () => {
      const token = pb.authStore.token;
      const res = await fetch('/api/notifications/send-grocery', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const response = await res.json() as GroceryNotificationResponse;
      return response;
    },
  });
}
