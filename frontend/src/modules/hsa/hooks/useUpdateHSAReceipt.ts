import { AepCollections } from '@/core/api/aepbase';
import { useAepUpdate } from '@/core/api/resourceHooks';
import type { HSAReceipt } from '../types';

interface UpdateHSAReceiptParams {
  id: string;
  data: Partial<HSAReceipt>;
}

export function useUpdateHSAReceipt() {
  return useAepUpdate<HSAReceipt, UpdateHSAReceiptParams>(
    AepCollections.HSA_RECEIPTS,
    { moduleId: 'hsa' },
  );
}
