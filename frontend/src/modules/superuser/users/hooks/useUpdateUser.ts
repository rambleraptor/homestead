import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@rambleraptor/homestead-core/api/aepbase';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import type { ManagedUser, UserFormData } from '../types';

interface UpdateArgs {
  id: string;
  data: Partial<UserFormData>;
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: UpdateArgs) => {
      const body: Record<string, unknown> = {};
      if (data.email !== undefined) body.email = data.email;
      if (data.display_name !== undefined) body.display_name = data.display_name;
      if (data.type !== undefined) body.type = data.type;
      if (data.password) body.password = data.password;
      return aepbase.update<ManagedUser>(AepCollections.USERS, id, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.users.all() });
    },
  });
}
