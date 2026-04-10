/**
 * Single action hook — branches on the `actions` flag.
 */

import { useQuery } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { pb } from '@/core/api/pocketbase';
import { isAepbaseEnabled } from '@/core/api/backend';
import type { Action } from '../types';

interface AepAction extends Action {
  path: string;
  create_time: string;
  update_time: string;
}

function normalize(rec: AepAction | Action): Action {
  const ae = rec as AepAction;
  return {
    ...rec,
    created: ae.create_time || rec.created || '',
    updated: ae.update_time || rec.updated || '',
  };
}

export function useAction(actionId: string) {
  return useQuery({
    queryKey: ['actions', 'detail', actionId],
    queryFn: async () => {
      if (isAepbaseEnabled('actions')) {
        const rec = await aepbase.get<AepAction>(AepCollections.ACTIONS, actionId);
        return normalize(rec);
      }
      return await pb.collection('actions').getOne<Action>(actionId);
    },
    enabled: !!actionId,
  });
}
