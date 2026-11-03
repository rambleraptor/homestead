/**
 * AEP-151 long-running operations — shared types + the store contract the
 * custom-method dispatcher depends on.
 *
 * This module is intentionally **runtime-agnostic**: it holds no server-only
 * imports so the dispatcher (which must run under Bun, Node, or a test
 * harness) can depend on it. The concrete store that actually talks to the
 * engine lives server-side in
 * `packages/homestead-core/server/operations.ts`.
 */

import { toProblem } from './problem';

/**
 * Plural of the `operation` collection. The resource *definition* is owned by
 * the operations app (`@rambleraptor/homestead-core/operations/resources`); the
 * const lives here in the runtime-agnostic contract module so the dispatcher,
 * cron scheduler, and server store can reach it without importing an app dir.
 */
export const OPERATIONS = 'operations' as const;

/** AEP-151 operation status shown in the UI. `done` is the source of truth. */
export type OperationStatus = 'pending' | 'running' | 'succeeded' | 'failed';

/**
 * A stored operation record as returned by the engine. Mirrors the
 * `operation` resource in `builtins.ts` plus the engine-managed fields.
 */
export interface Operation {
  id: string;
  path: string;
  done: boolean;
  status?: OperationStatus;
  method?: string;
  title?: string;
  created_by?: string;
  metadata?: Record<string, unknown>;
  response?: Record<string, unknown>;
  error?: Record<string, unknown>;
  create_time?: string;
  update_time?: string;
}

/** Inputs for creating a fresh (pending) operation. */
export interface CreateOperationInput {
  /** Bearer token of the caller — operations are created on their behalf. */
  token: string;
  /** The `plural:verb` that spawned the operation, e.g. `documents:classify`. */
  method: string;
  /** Human-readable label; defaults to `method`. */
  title?: string;
  /** User id of the initiator (stored as `created_by`). */
  createdBy?: string;
  /**
   * Initial status. Defaults to `running` (the record starts executing
   * immediately). Spawners that queue behind the {@link OperationStore}'s
   * concurrency gate create it as `pending` and later flip it to `running` via
   * {@link OperationStore.start} once a slot frees.
   */
  status?: OperationStatus;
}

/** Inputs for finishing an operation — exactly one of `response`/`error`. */
export interface CompleteOperationInput {
  token: string;
  id: string;
  response?: unknown;
  error?: unknown;
}

/** Inputs for overwriting an operation's `metadata` object. */
export interface UpdateMetadataInput {
  token: string;
  id: string;
  /**
   * The **full** metadata object to store. The engine replaces `metadata`
   * wholesale on PATCH (it does not deep-merge), so callers must send the
   * complete object, not a partial patch. {@link makeOperationLogger} holds the
   * `logs` array in memory precisely so it can re-send it in full each time.
   */
  metadata: Record<string, unknown>;
}

/**
 * A single entry in an operation's `metadata.logs` timeline. The most recent
 * entry doubles as the current status of a still-running operation.
 */
export interface OperationLogEntry {
  /** ISO 8601 timestamp of when the entry was recorded. */
  time: string;
  /** Human-readable status/progress message. */
  message: string;
}

/**
 * The dependency the dispatcher injects to record async work. Kept as an
 * interface so unit tests can supply a fake and the server can supply the
 * real, engine-backed implementation.
 */
export interface OperationStore {
  create(input: CreateOperationInput): Promise<Operation>;
  complete(input: CompleteOperationInput): Promise<void>;
  /** Overwrite the operation's `metadata` (used to append log entries). */
  updateMetadata(input: UpdateMetadataInput): Promise<void>;
  /**
   * Promote a `pending` (queued) operation to `running`. Called once a
   * concurrency slot frees, just before the handler executes. Optional so test
   * fakes and older stores that never queue can omit it.
   */
  start?(input: { token: string; id: string }): Promise<void>;
}

/**
 * A per-operation logger handed to handlers that drive an operation (cron
 * hooks, async custom methods). {@link log} appends a status entry to the
 * operation's `metadata.logs` and persists it.
 */
export interface OperationLogger {
  /**
   * Append `message` to the operation's log timeline and persist it. Resolves
   * when this entry has been written (or its write has failed and been
   * swallowed) — safe to `await` for ordering, and safe to ignore. Never
   * throws: a logging failure must not take down the handler.
   */
  log(message: string): Promise<void>;
  /** The in-memory log timeline accumulated so far. */
  readonly logs: OperationLogEntry[];
}

/**
 * Build an {@link OperationLogger} bound to one operation.
 *
 * The engine replaces `metadata` wholesale on PATCH (no RFC-7386 deep merge),
 * so every append must re-send the entire `logs` array. This logger keeps the
 * array in memory and serializes its writes onto a single FIFO promise chain:
 * `log()` pushes synchronously (so entry order always matches call order, even
 * for rapid/unawaited calls) and enqueues one `updateMetadata` write that runs
 * strictly after the previous one — no two writes for the same operation are
 * ever in flight at once, and they land in call order. Each write is wrapped in
 * try/catch so a persistence failure neither rejects the chain nor propagates
 * to the caller.
 *
 * Runtime-agnostic: depends only on the injected {@link OperationStore}, so both
 * the server cron scheduler and the (Bun/Node/test) custom-method dispatcher can
 * use it without dragging in server-only imports.
 */
export function makeOperationLogger(
  store: OperationStore,
  { token, id }: { token: string; id: string },
): OperationLogger {
  const logs: OperationLogEntry[] = [];
  let chain: Promise<void> = Promise.resolve();

  function log(message: string): Promise<void> {
    logs.push({ time: new Date().toISOString(), message });
    // Snapshot the array at enqueue time so this write carries exactly the
    // entries known when `log()` was called.
    const snapshot = logs.slice();
    chain = chain.then(async () => {
      try {
        await store.updateMetadata({ token, id, metadata: { logs: snapshot } });
      } catch (err) {
        // A logging failure must never crash the handler or break the chain.
        console.error(`[operation-logger] failed to persist log for ${id}`, err);
      }
    });
    return chain;
  }

  return {
    log,
    get logs() {
      return logs;
    },
  };
}

/**
 * Coerce an arbitrary thrown value into an AEP-151 `error` payload: an
 * AEP-193 problem (`{ type, title, status, detail }`), the same shape every
 * error response has. A thrown `ProblemError` keeps its status; anything else
 * is a 500. Pure — safe to use anywhere.
 */
export function toOperationError(err: unknown): Record<string, unknown> {
  return { ...toProblem(err) };
}
