/**
 * Pull scheduler — runs the inbound side of the syncs apps declare
 * (`ResourceSync.pull`): one loop per connection record (or one household-wide
 * loop), each pulling an external system's changes in on a schedule.
 *
 * **What runs when.** A connection is pulled when it's created or edited (an
 * edit clears its cursor, so the next run is a full sync — the edit may have
 * pointed it somewhere else), every `pull.every` seconds after a run that
 * succeeded, on its `:sync` method, and at boot for anything due. A run that
 * fails is retried on the same growing backoff as a failed push (1m … 12h,
 * then every 12h); a connection is never given up on, it just shows the error.
 * Deleting the connection drops its loop. Runs for one connection never
 * overlap: asking for one while it runs queues exactly one more.
 *
 * **A run.** Mints a short-lived admin token, reads the connection fresh,
 * then calls the handler page by page: each page's cursor is saved before the
 * next call, so an interrupted run resumes from its last page. `ResyncRequired`
 * clears the cursor and starts over once. The handler's writes carry the
 * sync's write origin (`sync:<id>`), which the push side never fires on.
 *
 * **What it leaves behind.** Cursors and schedule live in
 * `_homestead_sync_state` (cursors encrypted with the master key when one is
 * set). The connection's `sync_status` field — a system field only Homestead
 * can write — is updated after every run, through the engine, so open tabs
 * see it live. A run is recorded as an operation only when it wrote something
 * or failed: a quiet pull every 15 minutes per connection would bury
 * everything else in the Operations app.
 */

import type { Database } from './engine/sqlite';
import { nowRFC3339 } from './engine/ids';
import { decryptText, encryptionEnabled, encryptText } from './engine/crypto';
import { currentRequestContext, runAsOwner, runAsSystemWrite } from './engine/request-context';
import { createLogger } from './log';
import { mintAdminToken } from './bootstrap';
import type { SyncDispatcher, SyncDispatchInput } from './sync';
import { syncWriteOrigin } from './sync';
import {
  createHomesteadClient,
  bearerToken,
  HomesteadError,
  type HomesteadClient,
} from '@rambleraptor/homestead-client';
import type { RegisteredResourceSync } from '@rambleraptor/homestead-core/apps/registry';
import {
  SYNC_STATUS_FIELD,
  type PullContext,
  type PullResult,
  type SyncPull,
  type SyncStatus,
} from '@rambleraptor/homestead-core/apps/sync';
import type { ResourceDefinition } from '@rambleraptor/homestead-core/resources/types';
import type {
  OperationLogEntry,
  OperationStore,
} from '@rambleraptor/homestead-core/resources/operations';
import {
  operationRunner,
  operationTimeoutMs,
  withTimeout,
} from '@rambleraptor/homestead-core/resources/operation-runner';
import type { PullTriggerResult } from '@rambleraptor/homestead-core/server/sync-pulls';

const pullLog = createLogger('sync-pull');

export const STATE_TABLE = '_homestead_sync_state';
const CURSOR_KEY_ID = STATE_TABLE;

/** Default wait before each retry of a failing connection, in ms (as for pushes). */
const DEFAULT_RETRY_MS = [
  60_000,
  5 * 60_000,
  30 * 60_000,
  2 * 3_600_000,
  6 * 3_600_000,
  12 * 3_600_000,
];
/** Most pages one run will fetch before stopping (the next run carries on). */
const MAX_PAGES_PER_RUN = 500;
/** Longest error message kept in the status. */
const MAX_ERROR_LENGTH = 500;

/**
 * Wait (ms) before each retry of a failing pull — the same knob as push
 * redeliveries, `HOMESTEAD_SYNC_REDELIVERY_MS`. The last entry repeats.
 */
function retryMs(): number[] {
  const raw = process.env.HOMESTEAD_SYNC_REDELIVERY_MS;
  if (raw === undefined) return DEFAULT_RETRY_MS;
  const parsed = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '')
    .map(Number)
    .filter((n) => Number.isFinite(n) && n >= 0);
  return parsed.length > 0 ? parsed : DEFAULT_RETRY_MS;
}

/** The origin tag the scheduler's own status writes carry. */
export function syncStatusOrigin(id: string): string {
  return `sync-status:${id}`;
}

/** The `method` recorded on a pull run's operation. */
export function pullOperationMethod(id: string): string {
  return `sync:${id}:pull`;
}

/** What the scheduler needs of the engine: its db, and in-process requests. */
export interface PullEngine {
  db: Database;
  fetch: (req: Request) => Promise<Response>;
}

export interface PullSchedulerOptions {
  /** Clock, in epoch ms. */
  now?: () => number;
}

export interface PullScheduler extends SyncDispatcher {
  /**
   * Find every connection, drop state for ones that are gone, and start
   * running what's due. Call once the schema is in place.
   */
  start(): Promise<void>;
  /** Stop scheduling runs. In-flight ones finish but record nothing. */
  stop(): void;
  /** Run a connection's pull now (its `:sync` method). */
  trigger(connectionResource: string, path: string): PullTriggerResult;
  /** Resolves once nothing is running and nothing is due. */
  idle(): Promise<void>;
}

interface StateRow {
  sync_id: string;
  connection: string;
  cursor: string | null;
  failures: number;
  next_run_at: number;
  last_success_time: string | null;
}

/** A pull and how to reach its connection records. */
interface Puller {
  sync: RegisteredResourceSync;
  pull: SyncPull;
  /** The connection resource's definition, or null for a household-wide pull. */
  connections: Pick<ResourceDefinition, 'singular' | 'plural' | 'parents'> | null;
}

function ensureStateTable(db: Database): void {
  db.run(
    `CREATE TABLE IF NOT EXISTS ${STATE_TABLE} (
       sync_id           TEXT NOT NULL,
       connection        TEXT NOT NULL,
       cursor            TEXT,
       failures          INTEGER NOT NULL DEFAULT 0,
       next_run_at       INTEGER NOT NULL,
       last_success_time TEXT,
       last_error        TEXT,
       update_time       TEXT NOT NULL,
       PRIMARY KEY (sync_id, connection)
     )`,
  );
}

function sealCursor(cursor: string | null): string | null {
  if (cursor === null) return null;
  return encryptionEnabled() ? encryptText(cursor, CURSOR_KEY_ID) : cursor;
}

function openCursor(stored: string | null): string | null {
  return stored === null ? null : decryptText(stored, CURSOR_KEY_ID);
}

function messageOf(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > MAX_ERROR_LENGTH ? `${message.slice(0, MAX_ERROR_LENGTH)}…` : message;
}

function isResyncRequired(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { resyncRequired?: unknown }).resyncRequired === true
  );
}

function unref(timer: ReturnType<typeof setTimeout>): void {
  if (typeof (timer as { unref?: () => void }).unref === 'function') {
    (timer as { unref: () => void }).unref();
  }
}

const stateKey = (syncId: string, connection: string): string => `${syncId}\u0000${connection}`;

/**
 * A client that talks to the engine in-process (no loopback socket). With
 * `owner`, what it creates belongs to that user rather than to `token`'s
 * holder (see `runAsOwner`) — in-process is what makes that possible.
 */
function engineClient(engine: PullEngine, token: string, origin: string, owner?: string): HomesteadClient {
  return createHomesteadClient({
    baseUrl: 'http://homestead.internal',
    auth: bearerToken(token),
    origin,
    fetch: (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url);
      url.pathname = url.pathname.replace(/^\/api\/aep/, '') || '/';
      const send = () => engine.fetch(new Request(url, init));
      return owner ? runAsOwner(owner, send) : send();
    }) as typeof fetch,
  });
}

/**
 * Build the scheduler over `engine` for every sync with a pull side. `defs`
 * resolves each pull's connection resource (plural, parents).
 */
export function createPullScheduler(
  engine: PullEngine,
  syncs: RegisteredResourceSync[],
  defs: readonly Pick<ResourceDefinition, 'singular' | 'plural' | 'parents'>[],
  operations: OperationStore,
  options: PullSchedulerOptions = {},
): PullScheduler {
  const now = options.now ?? Date.now;
  const db = engine.db;
  ensureStateTable(db);

  const defBySingular = new Map(defs.map((d) => [d.singular, d]));
  const pullers = new Map<string, Puller>();
  const byConnectionResource = new Map<string, Puller>();
  for (const sync of syncs) {
    if (!sync.pull) continue;
    const connections = sync.pull.connections
      ? defBySingular.get(sync.pull.connections) ?? null
      : null;
    if (sync.pull.connections && !connections) {
      pullLog.error('connection resource not declared; pull disabled', {
        sync: sync.id,
        resource: sync.pull.connections,
      });
      continue;
    }
    const puller: Puller = { sync, pull: sync.pull, connections };
    pullers.set(sync.id, puller);
    if (connections) byConnectionResource.set(connections.singular, puller);
  }

  /** Writes made with each sync's write origin, for "did this run write?". */
  const writesBySync = new Map<string, number>();
  /**
   * Connections with a run under way. `again`: run once more when it ends;
   * `reset`: the connection was edited meanwhile, so that run starts over.
   */
  const running = new Map<string, { again: boolean; reset: boolean }>();
  let started = false;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let idleWaiters: Array<() => void> = [];

  const upsertDue = (syncId: string, connection: string, clearCursor: boolean): void => {
    db.query(
      `INSERT INTO ${STATE_TABLE} (sync_id, connection, next_run_at, update_time)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (sync_id, connection) DO UPDATE SET
         next_run_at = excluded.next_run_at,
         failures = 0,
         cursor = CASE WHEN ? THEN NULL ELSE cursor END,
         update_time = excluded.update_time`,
    ).run(syncId, connection, now(), nowRFC3339(), clearCursor ? 1 : 0);
  };

  const removeState = (syncId: string, connection: string): void => {
    db.query(`DELETE FROM ${STATE_TABLE} WHERE sync_id = ? AND connection = ?`).run(syncId, connection);
  };

  const readState = (syncId: string, connection: string): StateRow | null =>
    (db
      .query(
        `SELECT sync_id, connection, cursor, failures, next_run_at, last_success_time
           FROM ${STATE_TABLE} WHERE sync_id = ? AND connection = ?`,
      )
      .get(syncId, connection) as StateRow | null | undefined) ?? null;

  const safe = <T>(fn: () => T, fallback: T): T => {
    try {
      return fn();
    } catch (error) {
      if (!stopped) pullLog.error('state error', { err: error });
      return fallback;
    }
  };

  /** Due rows not already running, earliest first. */
  const dueRows = (): StateRow[] => {
    const rows = db
      .query(
        `SELECT sync_id, connection, cursor, failures, next_run_at, last_success_time
           FROM ${STATE_TABLE} WHERE next_run_at <= ? ORDER BY next_run_at`,
      )
      .all(now()) as StateRow[];
    return rows.filter(
      (r) => pullers.has(r.sync_id) && !running.has(stateKey(r.sync_id, r.connection)),
    );
  };

  const nextDueAt = (): number | null => {
    const rows = db
      .query(`SELECT sync_id, connection, next_run_at FROM ${STATE_TABLE} ORDER BY next_run_at`)
      .all() as Pick<StateRow, 'sync_id' | 'connection' | 'next_run_at'>[];
    for (const row of rows) {
      if (!pullers.has(row.sync_id)) continue;
      if (running.has(stateKey(row.sync_id, row.connection))) continue;
      return row.next_run_at;
    }
    return null;
  };

  const isIdle = (): boolean => {
    if (running.size > 0) return false;
    if (!started || stopped) return true;
    const next = safe(nextDueAt, null);
    return next === null || next > now();
  };

  const settleIdle = (): void => {
    if (idleWaiters.length === 0 || !isIdle()) return;
    const waiters = idleWaiters;
    idleWaiters = [];
    for (const resolve of waiters) resolve();
  };

  const schedule = (): void => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (stopped || !started) return;
    const next = safe(nextDueAt, null);
    if (next === null) return;
    timer = setTimeout(kick, Math.max(0, next - now()));
    unref(timer);
  };

  /** Write the connection's `sync_status` (a system write, skipped by our own dispatch). */
  const writeStatus = async (
    client: HomesteadClient,
    connection: string,
    status: SyncStatus,
  ): Promise<void> => {
    // A merge patch merges nested objects, so a key the new status lacks has
    // to be cleared explicitly or the old value (a stale error) would linger.
    const patch: Record<string, unknown> = { last_error: null, last_success_time: null, ...status };
    try {
      await runAsSystemWrite(() =>
        client.request(`/${connection}`, {
          method: 'PATCH',
          body: { [SYNC_STATUS_FIELD]: patch },
          mergePatch: true,
        }),
      );
    } catch (error) {
      // The connection may have been deleted mid-run; nothing to report on.
      if (!(error instanceof HomesteadError && error.code === 404)) {
        pullLog.warn('could not write sync status', { connection, err: error });
      }
    }
  };

  /** Record a run as an operation, after the fact. */
  const recordOperation = async (
    token: string,
    userId: string,
    puller: Puller,
    logs: OperationLogEntry[],
    outcome: { response: Record<string, unknown> } | { error: unknown },
  ): Promise<void> => {
    try {
      const op = await operations.create({
        token,
        method: pullOperationMethod(puller.sync.id),
        title: `${puller.sync.title ?? puller.sync.id}: pull`,
        createdBy: userId,
      });
      await operations.updateMetadata({ token, id: op.id, metadata: { logs } });
      await operations.complete({ token, id: op.id, ...outcome });
    } catch (error) {
      pullLog.warn('could not record the run', { sync: puller.sync.id, err: error });
    }
  };

  const runOnce = async (puller: Puller, connection: string): Promise<void> => {
    const { sync, pull } = puller;
    let admin: ReturnType<typeof mintAdminToken>;
    try {
      admin = mintAdminToken(db);
    } catch (error) {
      pullLog.error('no admin available; will retry', { sync: sync.id, err: error });
      safe(() => failed(sync.id, connection, 'no admin account yet'), undefined);
      return;
    }

    const writeOrigin = syncWriteOrigin(sync.id);
    const client = engineClient(engine, admin.token, syncStatusOrigin(sync.id));
    const firedAt = nowRFC3339();
    const logs: OperationLogEntry[] = [];
    const log = async (message: string): Promise<void> => {
      logs.push({ time: new Date().toISOString(), message });
    };
    const writesBefore = writesBySync.get(sync.id) ?? 0;
    let pages = 0;

    try {
      let record: Record<string, unknown> | null = null;
      if (connection) {
        try {
          record = await client.request<Record<string, unknown>>(`/${connection}`);
        } catch (error) {
          if (error instanceof HomesteadError && error.code === 404) {
            safe(() => removeState(sync.id, connection), undefined);
            return;
          }
          throw error;
        }
      }

      const work = async (): Promise<void> => {
        const mod = await pull.load();
        let resynced = false;
        for (;;) {
          if (stopped) return;
          const state = readState(sync.id, connection);
          if (!state) return; // connection deleted mid-run
          pages += 1;
          const ctx: PullContext = {
            id: sync.id,
            appId: sync.appId,
            resource: sync.resource,
            connection: record,
            cursor: openCursor(state.cursor),
            page: pages,
            token: admin.token,
            writeOrigin,
            firedAt,
            log,
            ownedBy: (userId) => engineClient(engine, admin.token, writeOrigin, userId),
          };
          let result: PullResult | void;
          try {
            result = await mod.default(ctx);
          } catch (error) {
            if (isResyncRequired(error) && !resynced) {
              resynced = true;
              await log(`full resync: ${messageOf(error)}`);
              saveCursor(sync.id, connection, null);
              continue;
            }
            throw error;
          }
          if (result && 'cursor' in result && result.cursor !== undefined) {
            saveCursor(sync.id, connection, result.cursor);
          }
          if (!result?.more) return;
          if (pages >= MAX_PAGES_PER_RUN) {
            await log(`stopped after ${pages} pages; the next run carries on`);
            return;
          }
        }
      };

      await withTimeout(work(), operationTimeoutMs(), `pull "${sync.id}" exceeded the operation time limit`);
      if (stopped) return;

      const nextAt = now() + pull.every * 1000;
      const attempt = nowRFC3339();
      safe(() => succeeded(sync.id, connection, attempt, nextAt), undefined);
      if (connection) {
        await writeStatus(client, connection, {
          state: 'ok',
          last_attempt_time: attempt,
          last_success_time: attempt,
          next_time: new Date(nextAt).toISOString(),
        });
      }
      const writes = (writesBySync.get(sync.id) ?? 0) - writesBefore;
      if (writes > 0) {
        await recordOperation(admin.token, admin.userId, puller, logs, {
          response: { connection: connection || null, pages, writes },
        });
      }
    } catch (error) {
      if (stopped) return;
      const message = messageOf(error);
      pullLog.error('pull failed', { sync: sync.id, connection: connection || '(household)', error: message });
      const state = safe(() => readState(sync.id, connection), null);
      if (!state) return;
      const nextAt = safe(() => failed(sync.id, connection, message), now());
      if (connection) {
        await writeStatus(client, connection, {
          state: 'error',
          last_attempt_time: nowRFC3339(),
          ...(state.last_success_time ? { last_success_time: state.last_success_time } : {}),
          last_error: message,
          next_time: new Date(nextAt).toISOString(),
        });
      }
      await log(`failed: ${message}`);
      await recordOperation(admin.token, admin.userId, puller, logs, { error });
    } finally {
      admin.revoke();
    }
  };

  function saveCursor(syncId: string, connection: string, cursor: string | null): void {
    db.query(
      `UPDATE ${STATE_TABLE} SET cursor = ?, update_time = ? WHERE sync_id = ? AND connection = ?`,
    ).run(sealCursor(cursor), nowRFC3339(), syncId, connection);
  }

  function succeeded(syncId: string, connection: string, at: string, nextAt: number): void {
    db.query(
      `UPDATE ${STATE_TABLE}
          SET failures = 0, next_run_at = ?, last_success_time = ?, last_error = NULL, update_time = ?
        WHERE sync_id = ? AND connection = ?`,
    ).run(nextAt, at, nowRFC3339(), syncId, connection);
  }

  /** Record a failure and schedule the retry; returns when it's due. */
  function failed(syncId: string, connection: string, error: string): number {
    const state = readState(syncId, connection);
    const failures = (state?.failures ?? 0) + 1;
    const waits = retryMs();
    const nextAt = now() + waits[Math.min(failures, waits.length) - 1];
    db.query(
      `UPDATE ${STATE_TABLE}
          SET failures = ?, next_run_at = ?, last_error = ?, update_time = ?
        WHERE sync_id = ? AND connection = ?`,
    ).run(failures, nextAt, error, nowRFC3339(), syncId, connection);
    return nextAt;
  }

  const launch = (puller: Puller, connection: string): void => {
    const key = stateKey(puller.sync.id, connection);
    const slot = { again: false, reset: false };
    running.set(key, slot);
    void operationRunner
      .submit(() => runOnce(puller, connection))
      .catch((error) => pullLog.error('run crashed', { sync: puller.sync.id, err: error }))
      .finally(() => {
        running.delete(key);
        // Applied after the run so its own bookkeeping can't overwrite them.
        if (slot.again && !stopped) {
          safe(() => {
            if (readState(puller.sync.id, connection)) upsertDue(puller.sync.id, connection, slot.reset);
          }, undefined);
        }
        kick();
      });
  };

  function kick(): void {
    if (stopped || !started) return;
    for (const row of safe(dueRows, [])) {
      const puller = pullers.get(row.sync_id);
      if (puller) launch(puller, row.connection);
    }
    schedule();
    settleIdle();
  }

  /** Every connection record of a pull, by path, read as the admin. */
  const listConnections = async (client: HomesteadClient, puller: Puller): Promise<string[]> => {
    const def = puller.connections!;
    const collections =
      (def.parents ?? []).length === 0
        ? [client.collection(def.plural)]
        : (await client.collection<{ id: string }>('users').listAll()).map((u) =>
            client.collection('users').record(u.id).collection(def.plural),
          );
    const paths: string[] = [];
    for (const collection of collections) {
      for (const record of await collection.listAll()) {
        const path = (record as { path?: unknown }).path;
        if (typeof path === 'string') paths.push(path);
      }
    }
    return paths;
  };

  const reconcile = async (): Promise<void> => {
    const known = new Set<string>();
    let admin: ReturnType<typeof mintAdminToken> | null = null;
    try {
      for (const puller of pullers.values()) {
        if (!puller.connections) {
          known.add(stateKey(puller.sync.id, ''));
          if (!readState(puller.sync.id, '')) upsertDue(puller.sync.id, '', false);
          continue;
        }
        admin ??= mintAdminToken(db);
        const client = engineClient(engine, admin.token, syncStatusOrigin(puller.sync.id));
        let paths: string[];
        try {
          paths = await listConnections(client, puller);
        } catch (error) {
          // Leave this pull's state alone rather than drop it on a bad read.
          pullLog.error('could not list connections', { sync: puller.sync.id, err: error });
          for (const row of db
            .query(`SELECT connection FROM ${STATE_TABLE} WHERE sync_id = ?`)
            .all(puller.sync.id) as { connection: string }[]) {
            known.add(stateKey(puller.sync.id, row.connection));
          }
          continue;
        }
        for (const path of paths) {
          known.add(stateKey(puller.sync.id, path));
          if (!readState(puller.sync.id, path)) upsertDue(puller.sync.id, path, false);
        }
      }
    } catch (error) {
      pullLog.error('could not start pulls', { err: error });
      return;
    } finally {
      admin?.revoke();
    }
    // Drop state for connections that are gone, and for pulls no longer declared.
    for (const row of db.query(`SELECT sync_id, connection FROM ${STATE_TABLE}`).all() as Pick<
      StateRow,
      'sync_id' | 'connection'
    >[]) {
      if (!known.has(stateKey(row.sync_id, row.connection))) removeState(row.sync_id, row.connection);
    }
  };

  return {
    dispatch(input: SyncDispatchInput): void {
      if (pullers.size === 0) return;
      const tagged =
        input.origin !== undefined ? input.origin : currentRequestContext()?.origin ?? null;
      // Count each sync's own writes, so a run knows whether it changed anything.
      if (tagged?.startsWith('sync:')) {
        const id = tagged.slice('sync:'.length);
        if (pullers.has(id)) writesBySync.set(id, (writesBySync.get(id) ?? 0) + 1);
      }
      const puller = byConnectionResource.get(input.resource);
      if (!puller) return;
      const id = puller.sync.id;
      // The scheduler's status writes, and the handler's own writes to its
      // connection, are not edits that call for a fresh pull.
      if (tagged === syncStatusOrigin(id) || tagged === syncWriteOrigin(id)) return;
      const path = (input.record ?? input.previous)?.path;
      if (typeof path !== 'string') return;
      try {
        const slot = running.get(stateKey(id, path));
        if (input.event === 'delete') {
          removeState(id, path);
        } else if (slot) {
          // Mid-run: the edit takes effect when the run ends (see `launch`).
          slot.again = true;
          slot.reset ||= input.event === 'update';
        } else {
          upsertDue(id, path, input.event === 'update');
          queueMicrotask(kick);
        }
      } catch (error) {
        pullLog.error('could not schedule pull', { sync: id, path, err: error });
      }
    },

    async start(): Promise<void> {
      if (started || stopped) return;
      await reconcile();
      if (stopped) return;
      started = true;
      kick();
    },

    stop(): void {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
      const waiters = idleWaiters;
      idleWaiters = [];
      for (const resolve of waiters) resolve();
    },

    trigger(connectionResource: string, path: string): PullTriggerResult {
      if (!started || stopped) return 'unavailable';
      const puller = byConnectionResource.get(connectionResource);
      if (!puller) return 'unknown';
      const id = puller.sync.id;
      if (!safe(() => readState(id, path), null)) return 'unknown';
      const slot = running.get(stateKey(id, path));
      if (slot) {
        slot.again = true;
        return 'queued';
      }
      safe(
        () =>
          db
            .query(`UPDATE ${STATE_TABLE} SET next_run_at = ? WHERE sync_id = ? AND connection = ?`)
            .run(now(), id, path),
        undefined,
      );
      queueMicrotask(kick);
      return 'queued';
    },

    idle(): Promise<void> {
      if (isIdle()) return Promise.resolve();
      return new Promise((resolve) => idleWaiters.push(resolve));
    },
  };
}
