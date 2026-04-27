import { aepbase, AepCollections } from '@/core/api/aepbase';
import { useAepList } from '@/core/api/resourceHooks';
import type { HSAReceipt } from '../types';

interface AepHSAReceipt extends HSAReceipt {
  path: string;
  create_time: string;
  update_time: string;
}

export function useHSAReceipts() {
  return useAepList<HSAReceipt>(AepCollections.HSA_RECEIPTS, {
    moduleId: 'hsa',
    // The aepbase shape carries `create_time`/`update_time`; the module type
    // expects `created`/`updated`, so normalize after fetch.
    queryFn: async () => {
      const receipts = await aepbase.list<AepHSAReceipt>(
        AepCollections.HSA_RECEIPTS,
      );
      return receipts.map((rec) => ({
        ...rec,
        created: rec.create_time || '',
        updated: rec.update_time || '',
      }));
    },
    sort: (a, b) => (b.service_date || '').localeCompare(a.service_date || ''),
  });
}
