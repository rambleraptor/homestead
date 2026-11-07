/**
 * Resource syncs — best-effort, one-way mirroring of a resource's records to an
 * external system after they change.
 *
 * An app declares `syncs: ResourceSync[]` on its {@link AppConfig}; each entry
 * names the resource it watches by `singular` (e.g. `'user'`, `'address'`).
 * When a record of that resource is created, updated, or deleted, the server's
 * dispatcher (`packages/homestead-server/src/sync.ts`) fires the
 * lazily-imported handler **after** the write has committed, so the CRUD (or
 * user) call returns to the caller immediately and the mirror happens
 * out-of-band. A sync never blocks or fails the write it observes.
 *
 * Because it names the target resource at the app level rather than nesting on
 * a {@link ResourceDefinition}, a sync can watch the built-in `user` resource —
 * which no app owns a definition for, but which lives in the engine registry —
 * just as easily as an app-owned collection.
 *
 * **Semantics.** Best-effort and asynchronous: the dispatcher retries the
 * handler a small number of times with backoff, but there is no durable outbox
 * — if the process dies mid-retry the change is not replayed. Runs for the same
 * `(sync, resource, recordId)` are serialized so two rapid edits mirror in
 * order; different records run concurrently. The framework is agnostic about
 * how the external side maps ids: the **handler owns** the external-id mapping
 * and idempotency, so write handlers to tolerate being re-run for the same
 * change (an at-least-once delivery model).
 *
 * Every firing runs inside an AEP-151 **operation** — the dispatcher creates
 * one before invoking the handler and completes it (succeeded/failed)
 * afterwards — exactly like a cron firing, so each mirror leaves a persisted
 * record (status, timing, result, or error) in the `operations` collection,
 * visible in the Operations app.
 *
 * Handlers run without a user request, so the dispatcher mints a short-lived
 * admin bearer token per firing (like the boot-time schema sync and cron runs)
 * and hands it to the handler on {@link SyncContext.token}. Pair it with the
 * shared client (`serverClient(token)` from
 * `@rambleraptor/homestead-core/server/client`) to read engine data (e.g. to
 * resolve references) alongside the record snapshots the context already
 * carries.
 *
 * The handler is referenced through a lazy `import()` — the same convention as
 * cron handlers, migrations, and AEP-136 custom methods — so the server-only
 * code stays out of the client bundle. Keep handler modules under the app's
 * `syncs/` directory, or name them `*.server.ts`, so the production build stubs
 * them out of the browser bundle (see `packages/homestead-app/vite.config.ts`).
 */

/**
 * The kind of record change that triggered a sync. `delete` carries the
 * pre-state on {@link SyncContext.previous} (there is no post-state); `create`
 * carries only the post-state on {@link SyncContext.record}.
 */
export type SyncEvent = 'create' | 'update' | 'delete';

/**
 * Context passed to a sync handler each time the dispatcher fires it.
 */
export interface SyncContext {
  /** The firing sync's declared {@link ResourceSync.id}. */
  id: string;
  /** Id of the app that declared the sync. */
  appId: string;
  /** Target resource singular being mirrored (e.g. `'user'`, `'address'`). */
  resource: string;
  /** Which change triggered this firing. */
  event: SyncEvent;
  /** Id of the record that changed. */
  recordId: string;
  /**
   * The record's post-change state, or `null` on a `delete` (the row is gone).
   * For the built-in `user` resource this is the `User` wire shape — never the
   * password hash.
   */
  record: Record<string, unknown> | null;
  /**
   * The record's pre-change state, or `null` on a `create` (there was none).
   * Present on `update` and `delete` so a handler can diff or clean up by the
   * old value.
   */
  previous: Record<string, unknown> | null;
  /**
   * Short-lived admin bearer token for engine access via the server-side
   * aepbase helpers. Minted for this firing and revoked once the handler
   * settles — don't retain it past the handler's lifetime.
   */
  token: string;
  /** RFC3339 timestamp of this firing. */
  firedAt: string;
  /**
   * Append a status/progress entry to this firing's operation log
   * (`metadata.logs`). The most recent entry surfaces as the operation's
   * current status in the Operations app while it runs. Never throws — a
   * logging failure is swallowed — and is safe to `await` (for ordering) or
   * ignore.
   *
   * The dispatcher brackets each firing with a `started` entry and a terminal
   * `succeeded` / `failed: …` entry automatically, and logs each retry; use
   * this for the steps in between (e.g. `await ctx.log('mirrored to Maps')`).
   */
  log: (message: string) => Promise<void>;
}

/**
 * A sync handler. Runs to completion (or rejection); the dispatcher retries a
 * throwing handler a few times with backoff before giving up, and records the
 * final error on the firing's operation — a failed mirror never propagates back
 * to the write that triggered it.
 *
 * **Write handlers to be idempotent.** Delivery is at-least-once (a retry, or a
 * duplicate change, can re-invoke the handler for the same record), so guard
 * against mirroring the same state twice — the handler owns the external-id
 * mapping and is the only place idempotency can live.
 *
 * The resolved value is recorded as the firing's operation `response` (return a
 * small summary object — e.g. `{ mirrored: 'addr_123' }` — for useful
 * logging), and a thrown value becomes the operation `error`. Returning nothing
 * is fine; the operation still records success and timing.
 */
export type SyncHandler = (
  ctx: SyncContext,
) => Promise<Record<string, unknown> | void>;

/**
 * Declarative description of a single resource sync an app declares.
 */
export interface ResourceSync {
  /**
   * Stable id, unique across every app's syncs. Used as the operation
   * method/label key and to serialize per-record runs. The registry drops a
   * sync whose id collides with one already seen.
   */
  id: string;

  /**
   * The `singular` of the resource this sync watches (e.g. `'user'`,
   * `'address'`). May name the built-in `user` resource or any app-declared
   * resource. The registry drops a sync missing this field.
   */
  resource: string;

  /**
   * Human-readable label for the operation each firing spawns, shown in the
   * Operations app (e.g. `'Mirror user to Maps'`). Defaults to the sync's
   * {@link id}.
   */
  title?: string;

  /**
   * The subset of events this sync fires on. Defaults to all three
   * (`['create', 'update', 'delete']`) when omitted — a mirror that only cares
   * about deletions can narrow to `['delete']`, etc.
   */
  on?: SyncEvent[];

  /**
   * Whether this change concerns the sync at all — checked before a firing is
   * started, so a change it would ignore spawns no operation (most notes
   * contain no `#todo`; most edits don't touch the field a mirror cares
   * about). Pure and cheap: it runs on the write's path, after the commit. A
   * check that throws counts as `true`, so a bug fires the handler rather than
   * silently skipping a change. Omit to fire on every change.
   */
  when?: (change: {
    event: SyncEvent;
    record: Record<string, unknown> | null;
    previous: Record<string, unknown> | null;
  }) => boolean;

  /**
   * Lazy import of the handler module. The dispatcher awaits this on demand and
   * invokes the default export.
   */
  load: () => Promise<{ default: SyncHandler }>;
}
