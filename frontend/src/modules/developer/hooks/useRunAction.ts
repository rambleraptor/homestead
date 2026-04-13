import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aepbase } from '@/core/api/aepbase';

export function useRunAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (actionId: string) => {
      const userId = aepbase.getCurrentUser()?.id || '';
      const response = await fetch(`/api/actions/${actionId}/run`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${aepbase.authStore.token}`,
          'X-User-Id': userId,
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) throw new Error('Failed to run action');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['actions'] });
    },
  });
}
