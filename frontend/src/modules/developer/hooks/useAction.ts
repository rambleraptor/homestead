import { useQuery } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import type { Action } from '../types';

interface AepAction extends Action {
  path: string;
  create_time: string;
  update_time: string;
}

export function useAction(actionId: string) {
  return useQuery({
    queryKey: ['actions', 'detail', actionId],
    queryFn: async () => {
      const rec = await aepbase.get<AepAction>(AepCollections.ACTIONS, actionId);
      return {
        ...rec,
        created: rec.create_time || '',
        updated: rec.update_time || '',
      };
    },
    enabled: !!actionId,
  });
}
