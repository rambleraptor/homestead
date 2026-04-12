/**
 * Actions list hook — branches on the `actions` flag.
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

export function useActions() {
  return useQuery({
    queryKey: ['actions'],
    queryFn: async () => {
      if (isAepbaseEnabled('actions')) {
        const records = await aepbase.list<AepAction>(AepCollections.ACTIONS);
        return records
          .map(normalize)
          .sort((a, b) => (b.created || '').localeCompare(a.created || ''));
      }
      return await pb.collection('actions').getFullList<Action>({ sort: '-created' });
    },
  });
}
