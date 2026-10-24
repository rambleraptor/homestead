/**
 * `resource-retention` cron handler: deletes rows past the retention window
 * their resource declares (`ResourceDefinition.retention`). The work lives in
 * `core/resources/retention.ts`; this binds it to the registry and the
 * scheduler's short-lived admin token.
 *
 * Server-only: lives under `crons/`, so vite stubs it out of the browser bundle.
 */

import type { CronHandler } from '@rambleraptor/homestead-core/apps/types';
import { getAllResourceDefs } from '@rambleraptor/homestead-core/apps/registry';
import { BUILTIN_RESOURCE_DEFS } from '@rambleraptor/homestead-core/resources/builtins';
import { sweepRetention } from '@rambleraptor/homestead-core/resources/retention';
import { serverClient } from '@rambleraptor/homestead-core/server/client';

const handler: CronHandler = async ({ token, firedAt, log }) => {
  // The same union the schema sync applies (builtins aren't owned by an app).
  const defs = [...BUILTIN_RESOURCE_DEFS, ...getAllResourceDefs()];
  const results = await sweepRetention({ client: serverClient(token), defs, firedAt, log });
  if (results.length === 0) await log('no resource declares a retention window');
  return {
    resources: results.length,
    deleted: results.reduce((n, r) => n + r.deleted, 0),
    blocked: results.reduce((n, r) => n + r.blocked, 0),
    failed: results.reduce((n, r) => n + r.failed, 0),
    capped: results.filter((r) => r.capped).map((r) => r.resource),
  };
};

export default handler;
