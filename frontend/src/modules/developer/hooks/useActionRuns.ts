import { useQuery } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import type { ActionRun } from '../types';

interface AepActionRun extends ActionRun {
  path: string;
  create_time: string;
  update_time: string;
}

export function useActionRuns(actionId: string) {
  return useQuery({
    queryKey: ['actions', 'runs', actionId],
    queryFn: async () => {
      const runs = await aepbase.list<AepActionRun>(AepCollections.ACTION_RUNS, {
        parent: [AepCollections.ACTIONS, actionId],
      });
      return runs
        .map((rec) => ({
          ...rec,
          action: actionId,
          created: rec.create_time || '',
          updated: rec.update_time || '',
        }))
        .sort((a, b) => (b.created || '').localeCompare(a.created || ''));
    },
    enabled: !!actionId,
  });
}
