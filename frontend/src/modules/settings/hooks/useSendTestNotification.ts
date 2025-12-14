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
      const response = await pb.send<TestNotificationResponse>(
        '/api/send-test-notification',
        {
          method: 'POST',
        }
      );
      return response;
    },
  });
}
