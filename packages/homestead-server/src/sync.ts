/**
 * Resource-sync dispatcher — fires the mirrors apps declare via
 * `AppConfig.syncs` after a resource record changes.
 *
 * The engine's write handlers (dynamic-resource CRUD in `engine/crud.ts` and
 * the built-in user writes in `engine/users.ts`) call {@link SyncDispatcher.dispatch}
 * *after* a create/update/delete has durably committed, then return to the
 * caller immediately. `dispatch` is fire-and-forget: it finds the matching
 * syncs synchronously and enqueues each run, but never awaits or throws, so a
 * mirror can never block or fail the write that triggered it.
 *
 * Each run mints a short-lived admin bearer token in the server's own db — the
 * same mechanism the boot-time schema sync and cron scheduler use — invokes the
 * lazily-imported handler with it, and revokes the token when the handler
 * settles. Every run is bracketed by an AEP-151 operation (via the injected
 * {@link OperationStore}) so it leaves a persisted record — status, timing, and
 * the handler's result or error — in the `operations` collection, exactly like
 * a cron firing. Creating the operation is best-effort: if it fails (e.g. the
 * schema isn't synced yet), the handler still runs.
 *
 * **Delivery is best-effort and at-least-once.** A throwing handler is retried a
 * few times with backoff before its operation records the failure; there is no
 * durable outbox, so a change is not replayed if the process dies mid-retry.
 * Runs for the same `(syncId, resource, recordId)` are serialized onto a
 * per-key promise chain so two rapid edits mirror in order; different records
 * run concurrently. Handlers must be idempotent — see {@link SyncHandler}.
 *
 * Each firing runs through the shared {@link runOperationJob}, the same
 * process-wide concurrency pool every other operation uses, so sync work
 * competes for the same `HOMESTEAD_MAX_OPERATIONS` slots as everything else.
 */

import type { Database } from './engine/sqlite';
import { nowRFC3339 } from './engine/ids';
import { createLogger } from './log';
import { mintAdminToken } from './bootstrap';
import type { RegisteredResourceSync } from '@rambleraptor/homestead-core/apps/registry';
import type { SyncEvent } from '@rambleraptor/homestead-core/apps/sync';
import {
  makeOperationLogger,
  type Operation,
  type OperationLogger,
  type OperationStore,
} from '@rambleraptor/homestead-core/resources/operations';
import { runOperationJob } from '@rambleraptor/homestead-core/resources/operation-runner';

// Named `syncLog` (not `log`) because `runResourceSync` has a local `log` — the
// per-operation message function — that would otherwise shadow it.
const syncLog = createLogger('sync');

/** Total handler attempts (one initial try + retries) before giving up. */
const MAX_ATTEMPTS = 3;
/** Default backoff before each retry, in ms — index 0 precedes attempt 2, etc. */
const DEFAULT_RETRY_BACKOFF_MS = [1000, 4000];

/**
 * Backoff schedule (ms) between handler retries. Read from
 * `HOMESTEAD_SYNC_RETRY_BACKOFF_MS` (a comma-separated list, e.g. `"0,0"` to
 * retry immediately in tests) so it's tunable without a code change; defaults to
 * a 1s then 4s backoff. Read per-call so a host or test can change it live.
 */
function retryBackoffMs(): number[] {
  const raw = process.env.HOMESTEAD_SYNC_RETRY_BACKOFF_MS;
  if (raw === undefined) return DEFAULT_RETRY_BACKOFF_MS;
  const parsed = raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n >= 0);
  return parsed.length > 0 ? parsed : DEFAULT_RETRY_BACKOFF_MS;
}

/** A record-change event handed to the dispatcher. */
export interface SyncDispatchInput {
  event: SyncEvent;
  /** Target resource singular (e.g. `'user'`, `'address'`). */
  resource: string;
  recordId: string;
  /** Post-change state; `null` on delete. */
  record: Record<string, unknown> | null;
  /** Pre-change state; `null` on create. */
  previous: Record<string, unknown> | null;
}

/**
 * The seam the engine's write handlers call after a commit. Kept as an
 * interface so the engine depends only on the type (no import cycle) and tests
 * can inject a fake that records calls.
 */
export interface SyncDispatcher {
  /**
   * Fire the syncs registered for `input.resource`/`input.event`, out-of-band.
   * Returns immediately and never throws — matching, run scheduling, and the
   * mirror itself all happen off the caller's stack.
   */
  dispatch(input: SyncDispatchInput): void;
  /**
   * Called just before a dynamic-resource delete commits, while the row still
   * exists — for an observer that must evaluate something against it (the
   * change feed decides who could read the record). Optional; synchronous and
   * must not throw.
   */
  beforeDelete?(input: PreDeleteInput): void;
}

/** The record a delete is about to remove. */
export interface PreDeleteInput {
  resource: string;
  recordId: string;
  path: string;
}

/** The `method` recorded on the operation a sync firing spawns. */
export function syncOperationMethod(id: string): string {
  return `sync:${id}`;
}

/** Await a delay without keeping the process alive on the timer alone. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    if (typeof (timer as { unref?: () => void }).unref === 'function') {
      (timer as { unref: () => void }).unref();
    }
  });
}

/** The events a sync fires on, defaulting to all three when unset. */
function firesOn(sync: RegisteredResourceSync, event: SyncEvent): boolean {
  return (sync.on ?? ['create', 'update', 'delete']).includes(event);
}

/**
 * Run a single sync firing once, end to end: mint a short-lived admin token,
 * open an operation for the firing, run the lazily-imported handler (with
 * bounded retries) through the shared concurrency pool, and complete the
 * operation (succeeded with the handler's result, or failed with its final
 * error) before revoking the token. Never rejects — a missing admin, a failed
 * operation create, or a persistently throwing handler is logged and swallowed
 * so the dispatcher's fire-and-forget contract holds. Exposed (rather than
 * inlined) so the per-firing contract can be unit-tested without the dispatcher.
 *
 * The firing is bracketed with a `started` log entry, a `retry N/M …` entry per
 * retry, and a terminal `succeeded` / `failed: …` entry; the handler gets a
 * `log` function to add its own progress entries in between.
 */
export async function runResourceSync(
  db: Database,
  sync: RegisteredResourceSync,
  input: SyncDispatchInput,
  operations: OperationStore,
): Promise<void> {
  let admin: ReturnType<typeof mintAdminToken>;
  try {
    admin = mintAdminToken(db);
  } catch (error) {
    syncLog.error('no admin available; skipping', { sync: sync.id, err: error });
    return;
  }

  // Open the operation up front so the run is visible while it's queued. Best
  // effort: if it can't be created, still run the handler with a no-op logger.
  const firedAt = nowRFC3339();
  let operation: Operation | undefined;
  try {
    operation = await operations.create({
      token: admin.token,
      method: syncOperationMethod(sync.id),
      title: sync.title ?? sync.id,
      createdBy: admin.userId,
      status: 'pending',
    });
  } catch (error) {
    syncLog.error('could not open an operation; running without one', {
      sync: sync.id,
      err: error,
    });
  }

  const logger: OperationLogger | undefined = operation
    ? makeOperationLogger(operations, { token: admin.token, id: operation.id })
    : undefined;
  const log = logger ? (m: string) => logger.log(m) : async () => {};

  try {
    await runOperationJob({
      store: operations,
      token: admin.token,
      operationId: operation?.id,
      log,
      work: async () => {
        // Retry the handler on throw up to MAX_ATTEMPTS with backoff. The
        // resolved value of the first successful attempt is the operation's
        // response; the last error is rethrown so the operation records it.
        const backoff = retryBackoffMs();
        let lastError: unknown;
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
          try {
            const mod = await sync.load();
            return await mod.default({
              id: sync.id,
              appId: sync.appId,
              resource: sync.resource,
              event: input.event,
              recordId: input.recordId,
              record: input.record,
              previous: input.previous,
              token: admin.token,
              firedAt,
              log,
            });
          } catch (error) {
            lastError = error;
            if (attempt >= MAX_ATTEMPTS) break;
            const message = error instanceof Error ? error.message : String(error);
            await log(`retry ${attempt + 1}/${MAX_ATTEMPTS} after error: ${message}`);
            await delay(backoff[attempt - 1] ?? 0);
          }
        }
        throw lastError;
      },
      timeoutLabel: `sync "${sync.id}"`,
      onError: (error) => syncLog.error('failed', { sync: sync.id, err: error }),
    });
  } finally {
    admin.revoke();
  }
}

/**
 * Build the dispatcher the engine fires into. It holds the aggregated sync list
 * and a per-key promise chain (`${syncId}:${resource}:${recordId}`) so runs for
 * the same record serialize while different records run concurrently. The chain
 * map self-prunes when a key's chain drains.
 */
export function createSyncDispatcher(
  db: Database,
  syncs: RegisteredResourceSync[],
  operations: OperationStore,
): SyncDispatcher {
  // Index by resource so `dispatch` does no scanning on the hot path when a
  // resource has no syncs (the common case).
  const byResource = new Map<string, RegisteredResourceSync[]>();
  for (const sync of syncs) {
    const list = byResource.get(sync.resource) ?? [];
    list.push(sync);
    byResource.set(sync.resource, list);
  }

  // Per-(sync, record) tail of the serialization chain. Absent = idle.
  const chains = new Map<string, Promise<void>>();

  const enqueue = (sync: RegisteredResourceSync, input: SyncDispatchInput): void => {
    const key = `${sync.id}:${input.resource}:${input.recordId}`;
    const prior = chains.get(key) ?? Promise.resolve();
    const next = prior
      .catch(() => {})
      .then(() => runResourceSync(db, sync, input, operations));
    chains.set(key, next);
    // Drop the entry once this run settles, but only if it's still the tail —
    // a later enqueue for the same key will have replaced it.
    void next.finally(() => {
      if (chains.get(key) === next) chains.delete(key);
    });
  };

  return {
    dispatch(input: SyncDispatchInput): void {
      const matches = byResource.get(input.resource);
      if (!matches) return;
      for (const sync of matches) {
        if (!firesOn(sync, input.event)) continue;
        enqueue(sync, input);
      }
    },
  };
}
