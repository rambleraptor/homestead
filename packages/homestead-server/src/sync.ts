/**
 * Resource-sync dispatcher — fires the mirrors apps declare via
 * `AppConfig.syncs` after a resource record changes.
 *
 * The engine's write handlers (dynamic-resource CRUD in `engine/crud.ts` and
 * the built-in user writes in `engine/users.ts`) call {@link SyncDispatcher.dispatch}
 * *after* a create/update/delete has committed, then return to the caller
 * immediately. `dispatch` never awaits or throws: it finds the syncs the change
 * concerns, writes one outbox row per sync (`./sync-outbox.ts`), and wakes the
 * drainer. A mirror can never block or fail the write that triggered it.
 *
 * **Who wrote it.** `dispatch` runs synchronously inside the engine request, so
 * it reads the writer and their `X-Homestead-Client` origin tag from the
 * request context — the same source the change feed uses — and stores them on
 * the row. A sync never fires on a change tagged with its own write origin
 * (`sync:<id>`), so a handler that writes back to the record it's mirroring
 * (an external id, a last-synced stamp) doesn't loop.
 *
 * **Delivery is durable and at-least-once.** A change stays in the outbox until
 * its handler succeeds. Each delivery runs the handler up to three times in
 * quick succession (1s then 4s apart); a delivery that still fails is retried
 * later on a growing backoff — minutes, then hours, across restarts — and after
 * the last one the row is parked as `dead` (kept 30 days for inspection). The
 * one gap is the instant between the write's commit and the outbox insert; a
 * crash exactly there loses the change. Changes to the same
 * `(syncId, resource, recordId)` are delivered strictly in order — a later one
 * waits behind an earlier one that's being retried — while different records
 * run concurrently. Handlers must be idempotent — see {@link SyncHandler}.
 *
 * Each delivery mints a short-lived admin bearer token in the server's own db —
 * the same mechanism the boot-time schema sync and cron scheduler use — and is
 * bracketed by an AEP-151 operation (via the injected {@link OperationStore}),
 * so it leaves a persisted record in the `operations` collection exactly like a
 * cron firing. Creating the operation is best-effort: if it fails (e.g. the
 * schema isn't synced yet), the handler still runs. Deliveries go through the
 * shared {@link runOperationJob} pool, so sync work competes for the same
 * `HOMESTEAD_MAX_OPERATIONS` slots as everything else.
 */

import type { Database } from './engine/sqlite';
import { nowRFC3339 } from './engine/ids';
import { currentRequestContext } from './engine/request-context';
import { createLogger } from './log';
import { mintAdminToken } from './bootstrap';
import { SyncOutbox, outboxKey, type OutboxEntry } from './sync-outbox';
import type { RegisteredResourceSync } from '@rambleraptor/homestead-core/apps/registry';
import { syncPushOf, type SyncEvent } from '@rambleraptor/homestead-core/apps/sync';
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

/** Handler attempts within one delivery (one initial try + quick retries). */
const MAX_ATTEMPTS = 3;
/** Default backoff before each quick retry, in ms — index 0 precedes attempt 2. */
const DEFAULT_RETRY_BACKOFF_MS = [1000, 4000];
/**
 * Default wait before each redelivery of a failed change, in ms — index 0
 * precedes delivery 2. 1m, 5m, 30m, 2h, 6h, 12h: seven deliveries over about
 * 21 hours, long enough to ride out an external service's bad day.
 */
const DEFAULT_REDELIVERY_MS = [
  60_000,
  5 * 60_000,
  30 * 60_000,
  2 * 3_600_000,
  6 * 3_600_000,
  12 * 3_600_000,
];
/** How long a dead change stays in the outbox for inspection. */
const DEAD_RETENTION_MS = 30 * 24 * 3_600_000;
/** Most deliveries the drainer starts per pass (the operation pool caps concurrency). */
const DRAIN_BATCH = 50;

/** Parse a comma-separated list of non-negative millisecond delays. */
function parseDelays(raw: string | undefined, fallback: number[]): number[] {
  if (raw === undefined) return fallback;
  const parsed = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '')
    .map(Number)
    .filter((n) => Number.isFinite(n) && n >= 0);
  return parsed.length > 0 ? parsed : fallback;
}

/**
 * Backoff schedule (ms) between quick retries within a delivery. Read from
 * `HOMESTEAD_SYNC_RETRY_BACKOFF_MS` (e.g. `"0,0"` to retry immediately in
 * tests); defaults to 1s then 4s. Read per-call so a host or test can change it
 * live.
 */
function retryBackoffMs(): number[] {
  return parseDelays(process.env.HOMESTEAD_SYNC_RETRY_BACKOFF_MS, DEFAULT_RETRY_BACKOFF_MS);
}

/**
 * Wait (ms) before each redelivery of a failed change. Read from
 * `HOMESTEAD_SYNC_REDELIVERY_MS`; its length sets how many redeliveries there
 * are (a change gets `length + 1` deliveries). Read per-call.
 */
function redeliveryMs(): number[] {
  return parseDelays(process.env.HOMESTEAD_SYNC_REDELIVERY_MS, DEFAULT_REDELIVERY_MS);
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
  /**
   * The writer as `users/{id}`. When omitted (the engine never sets it), read
   * from the current request context.
   */
  actor?: string | null;
  /** The writer's origin tag. When omitted, read from the request context. */
  origin?: string | null;
}

/** One delivery of a change to a sync handler. */
export interface SyncDelivery {
  event: SyncEvent;
  resource: string;
  recordId: string;
  record: Record<string, unknown> | null;
  previous: Record<string, unknown> | null;
  actor: string | null;
  origin: string | null;
  /** Which delivery this is, from 1. */
  delivery: number;
}

/** How one delivery went. */
export type SyncDeliveryResult = { ok: true } | { ok: false; error: string };

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

/** The origin tag a sync's own writes carry (see `SyncContext.writeOrigin`). */
export function syncWriteOrigin(id: string): string {
  return `sync:${id}`;
}

/** Await a delay without keeping the process alive on the timer alone. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    unref(timer);
  });
}

function unref(timer: ReturnType<typeof setTimeout>): void {
  if (typeof (timer as { unref?: () => void }).unref === 'function') {
    (timer as { unref: () => void }).unref();
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Whether a change passes the sync's `when` check (a throwing check passes). */
function concerns(
  sync: RegisteredResourceSync,
  change: Omit<SyncDelivery, 'resource' | 'recordId' | 'delivery'>,
): boolean {
  const when = syncPushOf(sync)?.when;
  if (!when) return true;
  try {
    return when(change);
  } catch (error) {
    syncLog.warn('when check threw; firing anyway', {
      syncId: sync.id,
      error: messageOf(error),
    });
    return true;
  }
}

/** The events a sync fires on, defaulting to all three when unset. */
function firesOn(sync: RegisteredResourceSync, event: SyncEvent): boolean {
  return (syncPushOf(sync)?.on ?? ['create', 'update', 'delete']).includes(event);
}

/**
 * Run one delivery of a change: mint an admin token, open an operation, invoke
 * the handler (with quick retries), record the outcome, revoke the token.
 * Resolves with whether the handler succeeded; never rejects.
 */
export async function runResourceSync(
  db: Database,
  sync: RegisteredResourceSync,
  change: SyncDelivery,
  operations: OperationStore,
): Promise<SyncDeliveryResult> {
  let admin: ReturnType<typeof mintAdminToken>;
  try {
    admin = mintAdminToken(db);
  } catch (error) {
    syncLog.error('no admin available; skipping', { sync: sync.id, err: error });
    return { ok: false, error: `no admin available: ${messageOf(error)}` };
  }

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

  // `runOperationJob` records a failure on the operation and swallows it, so
  // the outcome is captured here for the outbox.
  let result: SyncDeliveryResult = { ok: false, error: 'did not run' };
  try {
    await runOperationJob({
      store: operations,
      token: admin.token,
      operationId: operation?.id,
      log,
      work: async () => {
        if (change.delivery > 1) {
          await log(`delivery ${change.delivery} of ${redeliveryMs().length + 1}`);
        }
        const backoff = retryBackoffMs();
        let lastError: unknown;
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
          try {
            const push = syncPushOf(sync);
            if (!push) throw new Error(`sync "${sync.id}" has no push side`);
            const mod = await push.load();
            const response = await mod.default({
              id: sync.id,
              appId: sync.appId,
              resource: change.resource,
              event: change.event,
              recordId: change.recordId,
              record: change.record,
              previous: change.previous,
              actor: change.actor,
              origin: change.origin,
              writeOrigin: syncWriteOrigin(sync.id),
              delivery: change.delivery,
              token: admin.token,
              firedAt,
              log,
            });
            result = { ok: true };
            return response;
          } catch (error) {
            lastError = error;
            if (attempt >= MAX_ATTEMPTS) break;
            await log(`retry ${attempt + 1}/${MAX_ATTEMPTS} after error: ${messageOf(error)}`);
            await delay(backoff[attempt - 1] ?? 0);
          }
        }
        throw lastError;
      },
      timeoutLabel: `sync "${sync.id}"`,
      onError: (error) => {
        result = { ok: false, error: messageOf(error) };
        syncLog.error('failed', { sync: sync.id, err: error });
      },
    });
  } finally {
    admin.revoke();
  }
  return result;
}

/** Knobs for tests; production uses the defaults. */
export interface SyncDispatcherOptions {
  /** Clock, in epoch ms. */
  now?: () => number;
}

/** The dispatcher plus the lifecycle hooks the server and tests need. */
export interface DurableSyncDispatcher extends SyncDispatcher {
  /** Stop scheduling deliveries. In-flight ones finish but aren't recorded. */
  stop(): void;
  /**
   * Resolves once nothing is being delivered and nothing pending is due — the
   * outbox is empty, or every row left is waiting for a later redelivery.
   */
  idle(): Promise<void>;
}

/**
 * Build the dispatcher the engine fires into, over the outbox in `db`. It
 * delivers whatever an earlier process left pending as soon as it's built.
 */
export function createSyncDispatcher(
  db: Database,
  syncs: RegisteredResourceSync[],
  operations: OperationStore,
  options: SyncDispatcherOptions = {},
): DurableSyncDispatcher {
  const now = options.now ?? Date.now;
  const outbox = new SyncOutbox(db);

  // Index by resource so `dispatch` does no scanning on the hot path when a
  // resource has no syncs (the common case).
  const byResource = new Map<string, RegisteredResourceSync[]>();
  const byId = new Map<string, RegisteredResourceSync>();
  for (const sync of syncs) {
    if (!syncPushOf(sync)) continue;
    const list = byResource.get(sync.resource) ?? [];
    list.push(sync);
    byResource.set(sync.resource, list);
    byId.set(sync.id, sync);
  }

  /** Record keys with a delivery under way. */
  const busy = new Set<string>();
  let stopped = false;
  let draining = false;
  let drainAgain = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let idleWaiters: Array<() => void> = [];

  const isIdle = (): boolean => {
    if (draining || busy.size > 0) return false;
    const next = safe(() => outbox.nextDueAt(busy), null);
    return next === null || next > now();
  };

  const settleIdle = (): void => {
    if (idleWaiters.length === 0 || !isIdle()) return;
    const waiters = idleWaiters;
    idleWaiters = [];
    for (const resolve of waiters) resolve();
  };

  /** Run `fn`, logging and returning `fallback` if it throws (e.g. db closed). */
  function safe<T>(fn: () => T, fallback: T): T {
    try {
      return fn();
    } catch (error) {
      if (!stopped) syncLog.error('outbox error', { err: error });
      return fallback;
    }
  }

  const schedule = (): void => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (stopped) return;
    const next = safe(() => outbox.nextDueAt(busy), null);
    if (next === null) return;
    timer = setTimeout(kick, Math.max(0, next - now()));
    unref(timer);
  };

  const deliver = async (entry: OutboxEntry): Promise<void> => {
    const sync = byId.get(entry.syncId);
    const delivery = entry.deliveries + 1;
    let outcome: SyncDeliveryResult;
    if (!sync) {
      // The app that declared it is gone; nothing will ever deliver this.
      outcome = { ok: false, error: `no sync "${entry.syncId}" is installed` };
    } else {
      outcome = await runResourceSync(
        db,
        sync,
        {
          event: entry.event,
          resource: entry.resource,
          recordId: entry.recordId,
          record: entry.record,
          previous: entry.previous,
          actor: entry.actor,
          origin: entry.origin,
          delivery,
        },
        operations,
      );
    }
    if (stopped) return;
    safe(() => {
      if (outcome.ok) {
        outbox.succeeded(entry.seq);
        return;
      }
      const waits = redeliveryMs();
      if (sync && delivery <= waits.length) {
        outbox.retryLater(entry.seq, delivery, outcome.error, now() + waits[delivery - 1]);
      } else {
        outbox.dead(entry.seq, delivery, outcome.error);
        syncLog.error('giving up on change', {
          sync: entry.syncId,
          resource: entry.resource,
          recordId: entry.recordId,
          deliveries: delivery,
          error: outcome.error,
        });
      }
    }, undefined);
  };

  const drain = (): void => {
    draining = true;
    do {
      drainAgain = false;
      if (stopped) break;
      const { entries, unreadable } = safe(
        () => outbox.due(now(), busy, DRAIN_BATCH),
        { entries: [], unreadable: [] },
      );
      for (const bad of unreadable) {
        safe(() => outbox.dead(bad.seq, 0, `unreadable payload: ${bad.error}`), undefined);
        syncLog.error('parked unreadable change', { sync: bad.syncId, error: bad.error });
        drainAgain = true;
      }
      for (const entry of entries) {
        const key = outboxKey(entry.syncId, entry.resource, entry.recordId);
        busy.add(key);
        void deliver(entry)
          .catch((error) => syncLog.error('delivery crashed', { sync: entry.syncId, err: error }))
          .finally(() => {
            busy.delete(key);
            kick();
          });
      }
    } while (drainAgain);
    draining = false;
    schedule();
    settleIdle();
  };

  /** Look for due work now (coalesced: a kick during a drain re-runs it). */
  function kick(): void {
    if (stopped) return;
    if (draining) {
      drainAgain = true;
      return;
    }
    drain();
  }

  // Housekeeping, then pick up whatever an earlier process left behind — on the
  // next tick, so construction itself never runs a handler.
  safe(() => outbox.pruneDead(new Date(now() - DEAD_RETENTION_MS).toISOString()), 0);
  const startup = setTimeout(kick, 0);
  unref(startup);

  return {
    dispatch(input: SyncDispatchInput): void {
      const matches = byResource.get(input.resource);
      if (!matches) return;
      const ctx = currentRequestContext();
      const actor =
        input.actor !== undefined ? input.actor : ctx?.caller ? `users/${ctx.caller.id}` : null;
      const origin = input.origin !== undefined ? input.origin : ctx?.origin ?? null;
      const change = {
        event: input.event,
        record: input.record,
        previous: input.previous,
        actor,
        origin,
      };
      let queued = false;
      for (const sync of matches) {
        if (!firesOn(sync, input.event)) continue;
        // A sync's own writes (tagged with its write origin) never re-fire it.
        if (origin === syncWriteOrigin(sync.id)) continue;
        if (!concerns(sync, change)) continue;
        try {
          outbox.add(
            {
              syncId: sync.id,
              resource: input.resource,
              recordId: input.recordId,
              ...change,
            },
            now(),
          );
          queued = true;
        } catch (error) {
          syncLog.error('could not queue change; it will not be mirrored', {
            sync: sync.id,
            resource: input.resource,
            recordId: input.recordId,
            err: error,
          });
        }
      }
      if (queued) queueMicrotask(kick);
    },

    stop(): void {
      stopped = true;
      clearTimeout(startup);
      if (timer) clearTimeout(timer);
      timer = null;
      const waiters = idleWaiters;
      idleWaiters = [];
      for (const resolve of waiters) resolve();
    },

    idle(): Promise<void> {
      if (stopped || isIdle()) return Promise.resolve();
      return new Promise((resolve) => idleWaiters.push(resolve));
    },
  };
}
