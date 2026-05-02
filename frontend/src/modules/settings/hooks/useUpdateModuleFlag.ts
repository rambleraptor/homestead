/**
 * Upsert a single module flag on the household-wide singleton.
 *
 * Internal plumbing — components should use `useModuleFlag`. The
 * mutation flattens `(moduleId, key)` into the aepbase field name,
 * then either PATCHes the existing record or POSTs a new one if none
 * exists yet.
 *
 * If the `module-flags` resource definition hasn't been registered in
 * aepbase yet (e.g. the Next.js server booted without
 * `AEPBASE_ADMIN_EMAIL` / `AEPBASE_ADMIN_PASSWORD` so the instrumentation
 * hook skipped the sync), the first request 404s. We recover by
 * registering the schema on the fly with the caller's token — Flag
 * Management is superuser-gated, so the token already has the
 * permissions needed — and then retrying the upsert.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aepbase, AepCollections, AepbaseError } from '@rambleraptor/homestead-core/api/aepbase';
import { syncModuleFlagsSchema } from '@rambleraptor/homestead-core/module-flags/sync';
import { getAllModuleFlagDefs } from '@/modules/registry';
import type { ModuleFlagValue } from '../../types';
import { fieldName } from '../flags';
import {
  MODULE_FLAGS_QUERY_KEY,
  type ModuleFlagsRecord,
} from './useModuleFlags';

export interface UpdateModuleFlagArgs {
  moduleId: string;
  key: string;
  value: ModuleFlagValue;
}

async function upsertFlag(
  payload: Record<string, ModuleFlagValue>,
): Promise<ModuleFlagsRecord> {
  const existing = await aepbase.list<ModuleFlagsRecord>(
    AepCollections.MODULE_FLAGS,
  );
  if (existing.length > 0) {
    return await aepbase.update<ModuleFlagsRecord>(
      AepCollections.MODULE_FLAGS,
      existing[0].id,
      payload,
    );
  }
  return await aepbase.create<ModuleFlagsRecord>(
    AepCollections.MODULE_FLAGS,
    payload,
  );
}

export function useUpdateModuleFlag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ moduleId, key, value }: UpdateModuleFlagArgs) => {
      const flat = fieldName(moduleId, key);
      const payload = { [flat]: value };

      try {
        return await upsertFlag(payload);
      } catch (error) {
        if (!(error instanceof AepbaseError) || error.code !== 404) {
          throw error;
        }
        await syncModuleFlagsSchema({
          aepbaseUrl: '/api/aep',
          token: aepbase.authStore.token,
          defs: getAllModuleFlagDefs(),
        });
        return await upsertFlag(payload);
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: MODULE_FLAGS_QUERY_KEY,
      });
    },
  });
}
