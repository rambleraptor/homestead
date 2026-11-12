# Resource Syncs

A **resource sync** keeps a resource's records in step with an external system.
It has up to two sides, declared together under one id:

- **push** — when a record is created, updated, or deleted, Homestead fires a
  handler you write — *after* the write has committed — so you can send the
  change to a CRM, a mapping service, a calendar, an accounting system, or
  anything else with an API.
- **pull** — on a schedule, per *connection* (each person's calendar account,
  each feed), Homestead calls a handler that brings the external system's
  changes in. See [Pulling changes in](#pulling-changes-in).

The two sides share the sync's write origin, `sync:<id>`, so what the pull
brings in is never pushed straight back out.

A sync is asynchronous and durable: the write that triggered it returns to the
caller first, then the mirror runs out-of-band, and the change waits in a
database outbox until your handler succeeds — across restarts. A sync can never
block or fail the write it observes.

## Pushing changes out

- **Post-commit.** The handler runs after the record change is durable, so the
  snapshots it sees are the real committed state.
- **Durable, at-least-once.** Each change is written to an outbox before it
  runs and stays there until the handler succeeds. A failing handler is retried
  quickly, then redelivered on a growing backoff for about a day — through
  restarts — before the change is given up on. Each delivery is recorded as an
  operation you can inspect. **Write handlers to be idempotent.**
- **Knows who wrote it.** Each change carries its writer and the writer's origin
  tag, so a sync can ignore its own writes and those of an import job.
- **Handler-owned mapping.** Homestead stays agnostic about external ids; your
  handler owns the id mapping and the idempotency that at-least-once delivery
  requires.

## Declaring one

A sync names the resource it watches by its `singular`. Because the target is
named this way — not nested on a resource definition — a sync can watch **any**
resource, including the built-in **`user`** resource, which no app owns a
`ResourceDefinition` for but which is a real resource in the engine.

There are two places to declare one, merged at boot (ids must be unique across
both):

### In `homestead.config.ts` (operator-level)

This is the place to sync a resource **no app owns** — most importantly `user`.
You author it in the one file you already edit, using types re-exported from the
same module as `HomesteadConfig`; you never touch an app's internals.

```ts
// homestead.config.ts
import type { HomesteadConfig } from '@rambleraptor/homestead-core/apps/config';

const syncs: HomesteadConfig['syncs'] = [
  {
    id: 'users-mirror-to-maps',   // stable, globally unique — the operation key
    resource: 'user',            // any resource singular; 'user' is built-in
    title: 'Mirror user to Maps', // Operations-app label; defaults to id
    push: {
      // on: ['create', 'update', 'delete'],  // subset; default is all three
      load: () => import('./syncs/mirror-user-to-maps'),
    },
  },
];

const config: HomesteadConfig = {
  apps: [/* … */],
  syncs,
};
export default config;
```

Config-level syncs are recorded under the app id `config`.

A push-only sync may also be written flat, with `on`, `when` and `load` at the
top level instead of under `push` — `{ id, resource, load }` is shorthand for
`{ id, resource, push: { load } }`. Use one form or the other, not both.

### On an app (`AppConfig.syncs`)

When the resource is one an app owns, declare the sync alongside that app's
`crons` and `migrations`:

```ts
// packages/homestead-apps/<feature>/app.config.ts
export const myApp: AppConfig = {
  id: 'my-app',
  // …
  syncs: [
    {
      id: 'address-mirror-to-maps',
      resource: 'address',
      push: { load: () => import('./syncs/mirror-address-to-maps') },
    },
  ],
};
```

**Skip changes that don't matter with `when`.** Every firing is recorded as an
operation, so a sync that only cares about some records or some edits should
say so up front: `when` gets the change (`event`, `record`, `previous`, `actor`,
`origin`) and returns whether to fire. It runs synchronously after the commit, before any
operation is started, so keep it pure and cheap; a check that throws fires the
handler anyway. Notes uses it to file `#todo` lines as todos without an
operation for every note saved:

```ts
{
  id: 'notes-todo-tag',
  resource: 'note',
  // the flat, push-only form
  on: ['create', 'update'],
  when: ({ record, previous }) => newTodoTitles(record, previous).length > 0,
  load: () => import('./syncs/note-todos'),
}
```

Either way, keep the handler under a `syncs/` directory (or name it
`*.server.ts`) so the production build stubs it out of the browser bundle.

The `resource` must name a real resource. At boot the server validates every
sync's target against the resources this instance declares (app resources, the
built-ins, and `user`) and **refuses to start** with a
`[resources] sync "…" targets unknown resource "…"` error if one doesn't
exist — so a typo or a sync pointing at an app you haven't installed fails
loudly instead of silently never firing.

## Writing a push handler

A handler is a plain async function that default-exports. It receives a
`SyncContext`:

| Field       | What it is |
|-------------|------------|
| `id`        | The sync's declared id. |
| `appId`     | The app that declared it. |
| `resource`  | The target resource singular (e.g. `'user'`). |
| `event`     | `'create'`, `'update'`, or `'delete'`. |
| `recordId`  | Id of the record that changed. |
| `record`    | Post-change state — `null` on `delete`. For `user`, the wire shape (never the password hash). |
| `previous`  | Pre-change state — `null` on `create`. |
| `actor`     | Who made the change, as `users/{id}`; `null` with no signed-in caller. Crons and syncs write as the superuser, so tell them apart by `origin`. |
| `origin`    | The writer's origin tag (its `X-Homestead-Client` header): a per-tab id from the app, `cron:<id>` / `sync:<id>` from a cron or sync that tagged its client, or `null`. |
| `writeOrigin` | The tag for this handler's own writes: `sync:<id>`. Pass it to `serverClient`. |
| `delivery`  | Which delivery this is, from 1. Above 1, an earlier delivery failed — part of it may already have reached the external system. |
| `token`     | A short-lived admin bearer token, minted for this firing and revoked after. Pair it with `serverClient(token)`. |
| `firedAt`   | RFC3339 timestamp of the firing. |
| `log`       | Append a progress line to the firing's operation log. |

The handler is server-only code. Import its types from the config module (the
same one you import `HomesteadConfig` from) and `serverClient` from the server
entry — both resolve at runtime and are stubbed out of the browser bundle:

```ts
// ./syncs/mirror-user-to-maps.ts (next to homestead.config.ts)
import type { SyncHandler } from '@rambleraptor/homestead-core/apps/config';
import { serverClient } from '@rambleraptor/homestead-core/server/client';

const mirror: SyncHandler = async (ctx) => {
  const maps = mapsClient(); // your external SDK

  if (ctx.event === 'delete') {
    // The row is gone — clean up from the pre-state.
    await maps.deleteByKey(`user:${ctx.previous!.id}`);
    return;
  }

  // create | update: upsert from the post-state. The idempotency key ties the
  // external object to this record, so a retry upserts the same object instead
  // of duplicating it.
  const user = ctx.record!;
  const { placeId } = await maps.upsertPlace({
    key: `user:${user.id}`,
    name: (user.display_name as string) || (user.email as string),
  });
  // Persist your own id mapping (e.g. through serverClient(ctx.token)).
  await ctx.log(`mirrored user ${user.id} → ${placeId}`);
  return { mirrored: user.id, placeId };
};

export default mirror;
```

A commented starting point ships in `homestead.config.ts` (the `syncs` block
near the top) — uncomment it and drop your handler at
`./syncs/mirror-user-to-maps.ts`.

## Telling writers apart

Every write can carry an origin tag in its `X-Homestead-Client` header, and the
change a sync sees carries it as `origin`. Server code sets it with
`serverClient(token, undefined, { origin })`, and crons and syncs are handed a
ready-made one as `ctx.writeOrigin` (`cron:<id>`, `sync:<id>`).

- **A sync never fires on its own writes.** A change tagged with the sync's own
  `writeOrigin` is skipped before it's queued, so a handler can store the
  external id or a last-synced time back on the record it's mirroring without
  mirroring it again:

  ```ts
  const hs = serverClient(ctx.token, undefined, { origin: ctx.writeOrigin });
  await hs.collection('calendar-events').update(ctx.recordId, { external_id });
  ```

- **A pull's writes don't bounce back out.** The pull side of a sync writes
  with the same `writeOrigin` as its push side, so nothing is needed. Writes from
  some *other* job — a cron that imports into the same resource — can be skipped
  with `when`:

  ```ts
  when: ({ origin }) => origin !== 'cron:legacy-import',
  ```

## How it runs

- **After the commit.** The engine's write path fires the dispatcher after a
  create/update/delete is durable, writes the change to the outbox
  (`_homestead_sync_outbox` in the engine database), then returns to the caller.
  The outbox insert happens right after the commit, not inside it, so a crash in
  that instant can still lose a change.
- **Inside an operation.** Every firing runs inside an AEP-151 operation (like a
  cron firing), so its status, timing, result, and any `log()` lines land in the
  `operations` collection and show up in the Operations app. The operation's
  `method` is `sync:<id>`.
- **Retried, then redelivered.** Within one delivery, a throwing handler is
  retried up to 3 total attempts (default 1s then 4s apart, tunable with
  `HOMESTEAD_SYNC_RETRY_BACKOFF_MS`); if they all fail, the delivery's
  operation records the error. The change stays in the outbox and is delivered
  again after 1m, 5m, 30m, 2h, 6h and 12h (tunable with
  `HOMESTEAD_SYNC_REDELIVERY_MS`, a comma-separated list of milliseconds whose
  length sets the number of redeliveries). Pending changes survive a restart and
  are picked up at boot. The triggering write is never affected.
- **Given up on, visibly.** After its last delivery a change is parked as
  `dead` in the outbox (with the last error) and the server logs
  `giving up on change`. Dead changes are kept for 30 days. A change whose sync
  is no longer installed is parked the same way. With a master key configured,
  queued snapshots are stored encrypted.
- **In order per record.** Changes to the same `(sync, resource, recordId)` are
  delivered in the order they were made: a later change waits while an earlier
  one is being retried, and goes once that one succeeds or is given up on.
  Different records run concurrently, under the same `HOMESTEAD_MAX_OPERATIONS`
  pool as every other operation.

## Rules

1. **Idempotent handlers.** Delivery is at-least-once — a retry or a duplicate
   event can re-invoke the handler for the same change. Own the external-id
   mapping and guard against mirroring the same state twice.
2. **The `id` is the operation key** — keep it stable and globally unique.
3. **Never sync secrets.** For `user`, the snapshots are the wire shape and
   never include the password hash — don't reintroduce one by reading it
   yourself.
4. **Return a small summary** (`{ mirrored, placeId }`) — it's stored as the
   operation's response and makes the log useful.
5. **Write back with `writeOrigin`.** A push handler may write its own
   bookkeeping back (an external id, a sync stamp); bringing external changes
   in is the pull side's job.

## Pulling changes in

A sync's `pull` side brings an external system's changes into the resource on a
schedule — one loop per **connection**: a record that says where to pull from
and as whom (a person's Google account, an iCal feed URL).

```ts
{
  id: 'gcal',
  resource: 'calendar-event',          // what the pull writes
  title: 'Google Calendar',
  push: { load: () => import('./syncs/gcal-push') },
  pull: {
    connections: 'calendar-connection', // one loop per record of this resource
    every: 15 * 60,                     // seconds between pulls; at least 60
    load: () => import('./syncs/gcal-pull'),
  },
}
```

Leave out `connections` for a single household-wide loop (a hauler's pickup
schedule). A connection resource must be top-level or user-parented, and only
one sync may pull per a given connection resource.

### Writing a pull handler

The handler is called a page at a time with a `PullContext`:

| Field         | What it is |
|---------------|------------|
| `connection`  | A fresh read of the connection record, or `null` for a household-wide pull. |
| `cursor`      | Where the last page stopped, as you returned it (a provider sync token, an ETag). `null` means do a full sync. |
| `page`        | Which page of this run, from 1. |
| `token`       | A short-lived admin token for this run. |
| `writeOrigin` | `sync:<id>` — tag your writes with it: `serverClient(ctx.token, undefined, { origin: ctx.writeOrigin })`. |
| `ownedBy(userId)` | A client whose creates belong to that person rather than to the system the run writes as. |
| `id`, `appId`, `resource`, `firedAt`, `log` | As for a push handler. |

A pull writes as the system, and the engine makes a record's creator its owner —
so something filed *for* a person (a link collected into their private
bookmarks) would be the system's and out of their reach. Create it with
`ctx.ownedBy(userId)` instead: the record is theirs. Name only someone the
connection itself belongs to.

It returns `{ cursor, more }`: the cursor to save (omit to keep the current one,
`null` to clear it) and whether to call again straight away for the next page.

```ts
import { ResyncRequired, type PullHandler } from '@rambleraptor/homestead-core/apps/sync';
import { serverClient } from '@rambleraptor/homestead-core/server/client';

const pull: PullHandler = async (ctx) => {
  const hs = serverClient(ctx.token, undefined, { origin: ctx.writeOrigin });
  const page = await google.events.list({ syncToken: ctx.cursor ?? undefined })
    .catch((err) => {
      if (err.status === 410) throw new ResyncRequired(); // token expired
      throw err;
    });
  for (const event of page.items) {
    // upsert / delete calendar-events, keyed on the Google event id
  }
  return { cursor: page.nextSyncToken ?? page.nextPageToken, more: !!page.nextPageToken };
};
export default pull;
```

Write it idempotently — a run that's interrupted resumes from its last saved
cursor, and a full resync revisits everything.

### How it runs

- **When.** At boot for anything due; as soon as a connection is created or
  edited (an edit clears the cursor, so that run is a full sync); every `every`
  seconds after a run that succeeded; and on demand through the connection's
  `:sync` method (`POST <plural>/{id}:sync`, for anyone who may edit the
  connection — a "Sync now" button). Deleting the connection stops its loop.
- **One at a time.** Runs for one connection never overlap; asking for a run
  while one is under way queues exactly one more.
- **Page by page.** The cursor is saved after every page (stored in
  `_homestead_sync_state`, encrypted when a master key is set), so an
  interrupted run picks up where it stopped. A run stops after 500 pages; the
  next carries on.
- **`ResyncRequired`.** Throw it when the cursor is no good: the cursor is
  cleared and the handler is called again at once for a full sync (once per
  run).
- **Failures back off, never give up.** A run that throws is retried on the
  push redelivery schedule (1m, 5m, 30m, 2h, 6h, 12h, then every 12h;
  `HOMESTEAD_SYNC_REDELIVERY_MS`). The connection shows the error until a run
  succeeds.
- **Recorded when it matters.** A run becomes an operation (`sync:<id>:pull`)
  only when it wrote something or failed — a quiet pull every 15 minutes per
  connection would bury everything else in the Operations app.
- **Clearing out with the connection.** Give the synced records a reference to
  their connection with `onDelete: 'cascade'`, and deleting the connection
  deletes what it brought in.

### The connection's `sync_status`

Homestead adds a read-only `sync_status` field to the connection resource (don't
declare one yourself) and updates it after every run:

```ts
{
  state: 'ok' | 'error',
  last_attempt_time: string,   // when the last run finished
  last_success_time?: string,  // when one last succeeded
  last_error?: string,         // while state is 'error'
  next_time: string,           // when the next run is due
}
```

It's a **system field** (`system: true` on a `FieldDef`): the engine drops it
from every client write, forms don't show it, and the model tools don't offer to
write it — only Homestead's own in-process writes set it. It arrives through the
normal list hooks and the change feed, so a screen can show "Synced 3 min ago"
or the error with no extra API. Each status write updates the record's
`update_time`, so avoid `conflicts: 'keep-both'` on a connection resource.
