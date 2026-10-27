import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { useResourceList } from '@rambleraptor/homestead-core/api/resourceHooks';
import { CREDENTIALS } from '../resources';
import type { Credential } from '../types';

const APP = 'credentials';

/** Every credential, by name. Values come back as descriptors only. */
export function useCredentials() {
  return useResourceList<Credential>(APP, 'credential', CREDENTIALS, { orderBy: 'name' });
}

/**
 * Credential writes, deliberately *not* the generic resource mutations: those
 * write optimistically into the (persisted) query cache and queue offline in
 * localStorage, which would leave a typed secret sitting in the browser. These
 * go straight to the server, carry no `['app', …]` key (so nothing persists
 * them), and refetch the list — descriptors only — when they land.
 */
function useCredentialMutation<V>(mutationFn: (vars: V) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['credentials-write'],
    mutationFn,
    gcTime: 0,
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.app(APP).resource('credential').all() }),
  });
}

export interface CreateCredentialVars {
  name: string;
  description?: string;
  value: string;
}

export function useCreateCredential() {
  return useCredentialMutation((vars: CreateCredentialVars) => {
    const userId = aepbase.getCurrentUser()?.id;
    return aepbase.create<Credential>(CREDENTIALS, {
      ...vars,
      ...(userId ? { created_by: `users/${userId}` } : {}),
    });
  });
}

/** `data.value`: a new secret replaces it, `null` clears it, absent keeps it. */
export interface UpdateCredentialVars {
  id: string;
  data: { name?: string; description?: string | null; value?: string | null };
}

export function useUpdateCredential() {
  return useCredentialMutation(({ id, data }: UpdateCredentialVars) =>
    aepbase.update<Credential>(CREDENTIALS, id, data),
  );
}

export function useDeleteCredential() {
  return useCredentialMutation((id: string) => aepbase.remove(CREDENTIALS, id));
}
