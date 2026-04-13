import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aepbase } from '@/core/api/aepbase';

export function useProvideInput() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      runId,
      input,
    }: {
      runId: string;
      input: Record<string, unknown>;
    }) => {
      const userId = aepbase.getCurrentUser()?.id || '';
      const response = await fetch(`/api/actions/runs/${runId}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${aepbase.authStore.token}`,
          'X-User-Id': userId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ input }),
      });
      if (!response.ok) throw new Error('Failed to provide input');
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['action-run', variables.runId] });
    },
  });
}
