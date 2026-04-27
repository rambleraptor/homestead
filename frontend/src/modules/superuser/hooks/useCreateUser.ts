import { AepCollections } from '@/core/api/aepbase';
import { queryKeys } from '@/core/api/queryClient';
import { useAepCreate } from '@/core/api/resourceHooks';
import type { ManagedUser, UserFormData } from '../types';

export function useCreateUser() {
  return useAepCreate<ManagedUser, UserFormData>(AepCollections.USERS, {
    moduleId: 'superuser',
    invalidateKeys: [queryKeys.users.all()],
    transform: (data) => {
      if (!data.password) throw new Error('Password is required');
      return {
        email: data.email,
        display_name: data.display_name,
        type: data.type,
        password: data.password,
      };
    },
  });
}
