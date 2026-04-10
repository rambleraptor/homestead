/**
 * Stores list hook — branches on the `groceries` flag.
 */

import { useQuery } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { Collections, getCollection } from '@/core/api/pocketbase';
import { isAepbaseEnabled } from '@/core/api/backend';
import { queryKeys } from '@/core/api/queryClient';
import type { Store } from '../types';

interface AepStore extends Store {
  path: string;
  create_time: string;
  update_time: string;
}

function normalize(rec: AepStore | Store): Store {
  const ae = rec as AepStore;
  return {
    ...rec,
    created: ae.create_time || rec.created || '',
    updated: ae.update_time || rec.updated || '',
  };
}

export function useStores() {
  return useQuery({
    queryKey: queryKeys.module('groceries').detail('stores'),
    queryFn: async () => {
      if (isAepbaseEnabled('groceries')) {
        const stores = await aepbase.list<AepStore>(AepCollections.STORES);
        return stores
          .map(normalize)
          .sort((a, b) => {
            const ao = a.sort_order ?? 0;
            const bo = b.sort_order ?? 0;
            if (ao !== bo) return ao - bo;
            return a.name.localeCompare(b.name);
          });
      }
      return await getCollection<Store>(Collections.STORES).getFullList({
        sort: 'sort_order,name',
      });
    },
  });
}
