/**
 * HSA Receipts list hook — branches on the `hsa-receipts` flag.
 */

import { useQuery } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { Collections, getCollection } from '@/core/api/pocketbase';
import { isAepbaseEnabled } from '@/core/api/backend';
import { queryKeys } from '@/core/api/queryClient';
import type { HSAReceipt } from '../types';

interface AepHSAReceipt extends HSAReceipt {
  path: string;
  create_time: string;
  update_time: string;
}

function normalize(rec: AepHSAReceipt | HSAReceipt): HSAReceipt {
  const ae = rec as AepHSAReceipt;
  return {
    ...rec,
    created: ae.create_time || rec.created || '',
    updated: ae.update_time || rec.updated || '',
  };
}

export function useHSAReceipts() {
  return useQuery({
    queryKey: queryKeys.module('hsa').list(),
    queryFn: async () => {
      if (isAepbaseEnabled('hsa-receipts')) {
        const receipts = await aepbase.list<AepHSAReceipt>(AepCollections.HSA_RECEIPTS);
        return receipts
          .map(normalize)
          .sort((a, b) =>
            (b.service_date || '').localeCompare(a.service_date || ''),
          );
      }
      return await getCollection<HSAReceipt>(Collections.HSA_RECEIPTS).getFullList({
        sort: '-service_date',
      });
    },
  });
}
