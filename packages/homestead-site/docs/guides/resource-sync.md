# Resource Syncs

A **resource sync** mirrors a resource's records to an external system, one
way, after they change. When a record is created, updated, or deleted, Homestead
fires a handler you write — *after* the write has committed — so you can push the
change to a CRM, a mapping service, a search index, an accounting system, or
anything else with an API.

A sync is best-effort and asynchronous: the write that triggered it returns to
the caller first, then the mirror runs out-of-band. A sync can never block or
fail the write it observes.

## What it is (and isn't)

- **One-way.** Homestead → external. It does not pull changes back.
- **Post-commit.** The handler runs after the record change is durable, so the
  snapshots it sees are the real committed state.
- **Best-effort, at-least-once.** A failing handler is retried a few times with
  backoff, and each firing is recorded as an operation you can inspect. There is
  no durable outbox, though — if the process dies mid-retry, that change is not
  replayed. **Write handlers to be idempotent.**
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
say so up front: `when` gets the change (`event`, `record`, `previous`) and
returns whether to fire. It runs synchronously after the commit, before any
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

## How it runs

- **After the commit.** The engine's write path fires the dispatcher after a
  create/update/delete is durable, then returns to the caller. Dispatch is
  fire-and-forget.
- **Inside an operation.** Every firing runs inside an AEP-151 operation (like a
  cron firing), so its status, timing, result, and any `log()` lines land in the
  `operations` collection and show up in the Operations app. The operation's
  `method` is `sync:<id>`.
- **Retried with backoff.** A throwing handler is retried up to 3 total attempts
  (default 1s then 4s backoff, tunable with
  `HOMESTEAD_SYNC_RETRY_BACKOFF_MS`). If every attempt fails, the operation
  records the error — the triggering write is unaffected.
- **Serialized per record.** Runs for the same `(sync, resource, recordId)` are
  chained so two rapid edits mirror in order. Different records run
  concurrently, under the same `HOMESTEAD_MAX_OPERATIONS` pool as every other
  operation.

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
5. **One-way only.** A sync mirrors out; it never writes external state back
   into Homestead as part of the same flow.
