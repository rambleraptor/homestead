/**
 * Upsert a single module flag on the household-wide singleton.
 *
 * Internal plumbing — components should use `useModuleFlag`. The
 * mutation flattens `(moduleId, key)` into the aepbase field name,
 * then either PATCHes the existing record or POSTs a new one if none
 * exists yet.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@/core/api/aepbase';
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

export function useUpdateModuleFlag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ moduleId, key, value }: UpdateModuleFlagArgs) => {
      const flat = fieldName(moduleId, key);
      const payload = { [flat]: value };

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
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: MODULE_FLAGS_QUERY_KEY,
      });
    },
  });
}
