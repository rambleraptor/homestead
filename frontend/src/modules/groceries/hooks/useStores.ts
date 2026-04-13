/**
 * Stores list hook.
 */

import { useQuery } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { queryKeys } from '@/core/api/queryClient';
import type { Store } from '../types';

interface AepStore extends Store {
  path: string;
  create_time: string;
  update_time: string;
}

export function useStores() {
  return useQuery({
    queryKey: queryKeys.module('groceries').detail('stores'),
    queryFn: async () => {
      const stores = await aepbase.list<AepStore>(AepCollections.STORES);
      return stores
        .map((rec) => ({
          ...rec,
          created: rec.create_time || '',
          updated: rec.update_time || '',
        }))
        .sort((a, b) => {
          const ao = a.sort_order ?? 0;
          const bo = b.sort_order ?? 0;
          if (ao !== bo) return ao - bo;
          return a.name.localeCompare(b.name);
        });
    },
  });
}
