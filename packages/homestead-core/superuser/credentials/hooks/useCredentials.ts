import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { useResourceList } from '@rambleraptor/homestead-core/api/resourceHooks';
import { CREDENTIALS } from '../resources';
import type { Credential, CredentialSlotStatus } from '../types';

const APP = 'credentials';
const SLOTS_KEY = ['credential-slots'] as const;

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
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.app(APP).resource('credential').all() }),
        queryClient.invalidateQueries({ queryKey: SLOTS_KEY }),
        // A stored AI key turns the assistant on (`useAiConfigured`).
        queryClient.invalidateQueries({ queryKey: ['chat', 'status'] }),
      ]);
    },
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

/** The credentials Homestead needs and where each comes from (`GET /api/credential-slots`). */
export function useCredentialSlots() {
  return useQuery({
    queryKey: SLOTS_KEY,
    queryFn: async (): Promise<CredentialSlotStatus[]> => {
      const res = await fetch('/api/credential-slots', {
        headers: { Authorization: `Bearer ${aepbase.authStore.token ?? ''}` },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      return ((await res.json()) as { slots: CredentialSlotStatus[] }).slots;
    },
  });
}

/**
 * Store a slot's value: the credential whose id is the slot id, created the
 * first time (named after the slot) and replaced after.
 */
export function useSetSlotCredential() {
  return useCredentialMutation(
    ({ slot, value, exists }: { slot: CredentialSlotStatus; value: string; exists: boolean }) => {
      if (exists) return aepbase.update<Credential>(CREDENTIALS, slot.id, { value });
      const userId = aepbase.getCurrentUser()?.id;
      return aepbase.create<Credential>(
        CREDENTIALS,
        {
          name: slot.label,
          description: `Used by ${slot.used_by}.`,
          value,
          ...(userId ? { created_by: `users/${userId}` } : {}),
        },
        { id: slot.id },
      );
    },
  );
}
