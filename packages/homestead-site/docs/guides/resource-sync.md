# Resource Syncs

A **resource sync** mirrors a resource's records to an external system, one
way, after they change. When a record is created, updated, or deleted, Homestead
fires a handler you write — *after* the write has committed — so you can push the
change to a CRM, a mapping service, a search index, an accounting system, or
anything else with an API.

A sync is asynchronous and durable: the write that triggered it returns to the
caller first, then the mirror runs out-of-band, and the change waits in a
database outbox until your handler succeeds — across restarts. A sync can never
block or fail the write it observes.

## What it is (and isn't)

- **One-way.** Homestead → external. It does not pull changes back.
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
    // on: ['create', 'update', 'delete'],  // subset; default is all three
    load: () => import('./syncs/mirror-user-to-maps'),
  },
];

const config: HomesteadConfig = {
  apps: [/* … */],
  syncs,
};
export default config;
```

Config-level syncs are recorded under the app id `config`.

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
      load: () => import('./syncs/mirror-address-to-maps'),
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

## Writing a handler

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

- **Skip an import's writes with `when`.** A cron that pulls changes *in* tags
  its writes with its own `writeOrigin`; the outbound sync leaves them alone so
  they don't bounce back out:

  ```ts
  when: ({ origin }) => origin !== 'cron:calendar-pull',
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
5. **One-way only.** A sync mirrors out. It may write its own bookkeeping back
   (an external id, a sync stamp) with `writeOrigin`, but bringing external
   changes in is a separate job — a cron that tags its writes so the sync can
   skip them.
