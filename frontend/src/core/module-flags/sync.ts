/**
 * Push the aggregated module-flags schema to aepbase.
 *
 * Called from `src/instrumentation.ts` when the Next.js server boots.
 * Idempotent: on repeat runs it PATCHes the existing resource
 * definition when the schema has drifted.
 *
 * Implementation lives in `@/core/aep/sync` — this file just wraps the
 * generic syncer with the module-flags-specific resource shape.
 */

import { syncResourceDefinition } from '@/core/aep/sync';
import type { SyncResult } from '@/core/aep/sync';
import {
  buildModuleFlagsResourceDefinition,
  type ModuleFlagDefs,
} from '@/modules/settings/flags';

export interface SyncOptions {
  /** Base URL of the aepbase instance (no trailing slash). */
  aepbaseUrl: string;
  /** Admin bearer token with permission to manage resource definitions. */
  token: string;
  /** Defs from `getAllModuleFlagDefs()`. */
  defs: ModuleFlagDefs;
  /** Optional logger; defaults to console. */
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
}

export async function syncModuleFlagsSchema(
  options: SyncOptions,
): Promise<{ action: SyncResult['action'] }> {
  const { aepbaseUrl, token, defs, logger } = options;
  const def = buildModuleFlagsResourceDefinition(defs);
  const result = await syncResourceDefinition({
    aepbaseUrl,
    token,
    def,
    logger,
  });
  return { action: result.action };
}
