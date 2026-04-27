import { AepCollections } from '@/core/api/aepbase';
import { useAepRemove } from '@/core/api/resourceHooks';

export function useDeleteHSAReceipt() {
  return useAepRemove(AepCollections.HSA_RECEIPTS, { moduleId: 'hsa' });
}
