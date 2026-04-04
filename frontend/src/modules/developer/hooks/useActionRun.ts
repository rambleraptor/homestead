/**
 * Hook to fetch and poll action run status
 */

import { useQuery } from '@tanstack/react-query';
import { usePocketBase } from '@/core/api/pocketbase';
import type { ActionRun } from '../types';

export function useActionRun(runId: string | null, options?: { enabled?: boolean }) {
  const pb = usePocketBase();

  return useQuery({
    queryKey: ['action-run', runId],
    queryFn: async () => {
      if (!runId) return null;

      const response = await fetch(`/api/actions/runs/${runId}`, {
        headers: {
          'Authorization': pb.authStore.token,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch run');
      }

      return response.json() as Promise<ActionRun>;
    },
    enabled: !!runId && (options?.enabled !== false),
    refetchInterval: (query) => {
      // Poll every 2 seconds while running or awaiting input
      const run = query.state.data;
      if (run && (run.status === 'pending' || run.status === 'running' || run.status === 'awaiting_input')) {
        return 2000;
      }
      // Stop polling when done
      return false;
    },
  });
}
