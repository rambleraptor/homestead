import { AepCollections } from '@/core/api/aepbase';
import { queryKeys } from '@/core/api/queryClient';
import { useAepUpdate } from '@/core/api/resourceHooks';
import type { ManagedUser, UserFormData } from '../types';

interface UpdateArgs {
  id: string;
  data: Partial<UserFormData>;
}

export function useUpdateUser() {
  return useAepUpdate<ManagedUser, UpdateArgs>(AepCollections.USERS, {
    moduleId: 'superuser',
    invalidateKeys: [queryKeys.users.all()],
    transform: ({ data }) => {
      const body: Record<string, unknown> = {};
      if (data.email !== undefined) body.email = data.email;
      if (data.display_name !== undefined) body.display_name = data.display_name;
      if (data.type !== undefined) body.type = data.type;
      if (data.password) body.password = data.password;
      return body;
    },
  });
}
