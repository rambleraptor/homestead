import { useQuery } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import type { Action } from '../types';

interface AepAction extends Action {
  path: string;
  create_time: string;
  update_time: string;
}

export function useActions() {
  return useQuery({
    queryKey: ['actions'],
    queryFn: async () => {
      const records = await aepbase.list<AepAction>(AepCollections.ACTIONS);
      return records
        .map((rec) => ({
          ...rec,
          created: rec.create_time || '',
          updated: rec.update_time || '',
        }))
        .sort((a, b) => (b.created || '').localeCompare(a.created || ''));
    },
  });
}
