import { useQuery } from '@tanstack/react-query';
import { aepbase } from '@/core/api/aepbase';
import type { ActionRun } from '../types';

export function useActionRun(runId: string | null, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['action-run', runId],
    queryFn: async () => {
      if (!runId) return null;
      const userId = aepbase.getCurrentUser()?.id || '';
      const response = await fetch(`/api/actions/runs/${runId}`, {
        headers: {
          Authorization: `Bearer ${aepbase.authStore.token}`,
          'X-User-Id': userId,
        },
      });
      if (!response.ok) throw new Error('Failed to fetch run');
      return (await response.json()) as ActionRun;
    },
    enabled: !!runId && options?.enabled !== false,
    refetchInterval: (query) => {
      const run = query.state.data;
      if (
        run &&
        (run.status === 'pending' ||
          run.status === 'running' ||
          run.status === 'awaiting_input')
      ) {
        return 2000;
      }
      return false;
    },
  });
}
