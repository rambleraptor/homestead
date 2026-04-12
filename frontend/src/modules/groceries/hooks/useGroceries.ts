/**
 * Groceries list hook — branches on the `groceries` flag.
 */

import { useQuery } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { Collections, getCollection } from '@/core/api/pocketbase';
import { isAepbaseEnabled } from '@/core/api/backend';
import { queryKeys } from '@/core/api/queryClient';
import type { GroceryItem } from '../types';

interface AepGroceryItem extends GroceryItem {
  path: string;
  create_time: string;
  update_time: string;
}

function normalize(rec: AepGroceryItem | GroceryItem): GroceryItem {
  const ae = rec as AepGroceryItem;
  return {
    ...rec,
    created: ae.create_time || rec.created || '',
    updated: ae.update_time || rec.updated || '',
  };
}

export function useGroceries() {
  return useQuery({
    queryKey: queryKeys.module('groceries').list(),
    queryFn: async () => {
      if (isAepbaseEnabled('groceries')) {
        const items = await aepbase.list<AepGroceryItem>(AepCollections.GROCERIES);
        return items
          .map(normalize)
          .sort((a, b) => {
            if (a.checked !== b.checked) return a.checked ? 1 : -1;
            return a.name.localeCompare(b.name);
          });
      }
      return await getCollection<GroceryItem>(Collections.GROCERIES).getFullList({
        sort: 'checked,category,name',
      });
    },
  });
}
