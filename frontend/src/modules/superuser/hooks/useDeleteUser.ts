import { AepCollections } from '@/core/api/aepbase';
import { queryKeys } from '@/core/api/queryClient';
import { useAepRemove } from '@/core/api/resourceHooks';

export function useDeleteUser() {
  return useAepRemove(AepCollections.USERS, {
    moduleId: 'superuser',
    invalidateKeys: [queryKeys.users.all()],
  });
}
