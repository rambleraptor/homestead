/**
 * `operations-cleanup` cron handler.
 *
 * Finished operations (`done: true`) are never otherwise deleted, so the
 * `operations` collection grows unbounded — one record per async method,
 * bulk import, and cron firing. This job runs daily (and once on boot) and
 * deletes every finished operation whose `create_time` is older than the
 * retention window, keeping the collection bounded. Still-running operations
 * are always left alone; the boot-time `sweepStaleOperations` is what rescues
 * those, not this.
 *
 * Lists the full collection and filters in memory — mirroring
 * `sweepStaleOperations` — rather than pushing predicates down as a server-side
 * filter.
 *
 * Server-only: lives under `crons/`, so vite stubs it out of the browser
 * bundle. Runs headless with a short-lived admin token from the scheduler.
 */

import type { CronHandler } from '@rambleraptor/homestead-core/apps/types';
import { serverClient } from '@rambleraptor/homestead-core/server/client';
import { OPERATIONS } from '@rambleraptor/homestead-core/resources/operations';

/** Delete finished operations older than this many days. */
export const RETENTION_DAYS = 3;
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;

/** The engine-managed fields this job reads off each operation record. */
interface StoredOperation {
  id: string;
  done?: boolean;
  create_time?: string;
}

const handler: CronHandler = async ({ token, firedAt, log }) => {
  // Anchor "now" to the firing time so the cutoff is deterministic.
  const cutoff = new Date(new Date(firedAt).getTime() - RETENTION_MS);

  const operations = serverClient(token).collection<StoredOperation>(OPERATIONS);

  const all = await operations.listAll();
  const stale = all.filter(
    (op) => op.done && op.create_time && new Date(op.create_time) < cutoff,
  );
  await log(
    `${all.length} operation(s); ${stale.length} finished and older than ${RETENTION_DAYS} days`,
  );

  let deleted = 0;
  for (const op of stale) {
    try {
      await operations.record(op.id).delete();
      deleted++;
    } catch (error) {
      // Best-effort: a single failed delete shouldn't abort the sweep.
      console.error(`[operations-cleanup] failed to delete ${op.id}`, error);
    }
  }

  await log(`deleted ${deleted} operation(s)`);
  return { scanned: all.length, eligible: stale.length, deleted };
};

export default handler;
