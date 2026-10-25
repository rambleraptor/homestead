/**
 * Upsert a single app flag on the household-wide singleton.
 *
 * Internal plumbing — components should use `useAppFlag`. The
 * mutation flattens `(appId, key)` into the aepbase field name,
 * then either PATCHes the existing record or POSTs a new one if none
 * exists yet.
 *
 * If the `app-flags` resource definition hasn't been registered in
 * aepbase yet (e.g. the Next.js server booted without
 * `AEPBASE_ADMIN_EMAIL` / `AEPBASE_ADMIN_PASSWORD` so the instrumentation
 * hook skipped the sync), the first request 404s. We recover by
 * registering the schema on the fly with the caller's token — Flag
 * Management is superuser-gated, so the token already has the
 * permissions needed — and then retrying the upsert.
 */

import { APP_FLAGS } from '@rambleraptor/homestead-core/app-flags/sync';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aepbase, AepbaseError } from '@rambleraptor/homestead-core/api/aepbase';
import { syncAppFlagsSchema } from '@rambleraptor/homestead-core/app-flags/sync';
import { getAllAppFlagDefs } from '@rambleraptor/homestead-core/apps/registry';
import type { AppFlagValue } from '@rambleraptor/homestead-core/apps/types';
import { audienceFieldName, encodeAudience, fieldName, type FlagAudience } from '../flags';
import {
  APP_FLAGS_QUERY_KEY,
  type AppFlagsRecord,
} from './useAppFlags';

/** A flag's new value, its new audience, or both. */
export interface UpdateAppFlagArgs {
  appId: string;
  key: string;
  value?: AppFlagValue;
  audience?: FlagAudience;
}

async function upsertFlag(
  payload: Record<string, AppFlagValue>,
): Promise<AppFlagsRecord> {
  const existing = await aepbase.list<AppFlagsRecord>(
    APP_FLAGS,
  );
  if (existing.length > 0) {
    return await aepbase.update<AppFlagsRecord>(
      APP_FLAGS,
      existing[0].id,
      payload,
    );
  }
  return await aepbase.create<AppFlagsRecord>(
    APP_FLAGS,
    payload,
  );
}

export function useUpdateAppFlag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ appId, key, value, audience }: UpdateAppFlagArgs) => {
      const payload: Record<string, AppFlagValue> = {};
      if (value !== undefined) payload[fieldName(appId, key)] = value;
      if (audience !== undefined) payload[audienceFieldName(appId, key)] = encodeAudience(audience);
      if (Object.keys(payload).length === 0) throw new Error('nothing to change on the flag');

      try {
        return await upsertFlag(payload);
      } catch (error) {
        if (!(error instanceof AepbaseError) || error.code !== 404) {
          throw error;
        }
        await syncAppFlagsSchema({
          aepbaseUrl: '/api/aep',
          token: aepbase.authStore.token,
          defs: getAllAppFlagDefs(),
        });
        return await upsertFlag(payload);
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: APP_FLAGS_QUERY_KEY,
      });
    },
  });
}
