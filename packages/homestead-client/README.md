# @rambleraptor/homestead-client

An isomorphic (browser / Node ≥ 18 / Bun), **zero-dependency** TypeScript client
for a [Homestead](https://github.com/rambleraptor/homestead) server — the
AEP-over-SQLite engine reachable under the same-origin `/api/aep` surface.

It consolidates what were three hand-rolled clients (the SPA's browser wrapper,
the server's loopback helper, and the CLI's OpenAPI client) into one fluent API
whose **only** per-caller difference is a pluggable *auth strategy*.

## Install

```bash
npm install @rambleraptor/homestead-client
```

## Quick start

```ts
import { createHomesteadClient, password } from '@rambleraptor/homestead-client';

const hs = createHomesteadClient({
  baseUrl: 'https://home.example.com', // '' → same origin (/api/aep)
  auth: password({ email, password }), // lazy login on first call
});

// CRUD with transparent pagination
const cards = hs.collection('gift-cards');
for await (const card of cards.list({ filter: 'archived = false' })) {
  console.log(card);
}
const all = await cards.listAll();
const one = await cards.get(id);

// Create (file fields auto-assemble into multipart)
const created = await cards.create({ merchant: 'REI', front_image: file });

// Update (merge-patch) + delete
await cards.record(created.id).update({ balance: 40 });
await cards.record(created.id).delete({ force: true }); // AEP-135 cascade

// Nested / parented resources read naturally
const txns = cards.record(created.id).collection('transactions');
await txns.create({ amount: -12.5 });
```

## Auth strategies

The seam that adapts the client to each caller. Pass one as `auth`:

| Strategy | Use | Notes |
|---|---|---|
| `bearerToken(token, userId?)` | server routes | forwards a user's token; static |
| `password({ email, password })` | scripts / integrations | lazy login, cached, re-auths on 401 |
| `profile({ token, userId })` | CLI | matches the CLI's stored login profiles |
| `browserSession(opts?)` | SPA | localStorage-backed, exposes `onChange` |
| `anonymous()` | public reads | default; only `/users/:login`, `/oauth/*` work |

```ts
import { browserSession } from '@rambleraptor/homestead-client';

const auth = browserSession();
auth.onChange((token, user) => { /* re-render */ });
const hs = createHomesteadClient({ auth });

await hs.auth.login(email, pw);   // persists into the strategy
await hs.auth.me();
await hs.auth.logout();
```

## Custom methods (AEP-136) & operations (AEP-151)

`X-User-Id` (which the custom-method gateway requires) is attached
automatically from the auth strategy.

```ts
// collection- and item-target custom verbs
await hs.collection('groceries').invoke('process-image', { image }); // a File/Blob → multipart
await hs.collection('hsa-receipts').record(id).invoke('parse-receipt');

// async method (202 + Operation): poll to completion
const op = await hs.collection('hsa-receipts').record(id).invoke('parse-receipt');
const result = await hs.operations.await(op.id, { timeoutMs: 60_000 });
```

## Bulk import & export

A collection that declares bulk import answers `:bulk-import`; the client wraps
it — files go as multipart `$upload` parts, the operation is awaited:

```ts
const recipes = hs.collection('recipes');

// Preview (AEP-163 validate_only), pick rows, import exactly those:
const preview = await recipes.bulkImport.preview({ format: 'paprika', files: [file] });
await recipes.bulkImport.importPreview({
  format: 'paprika',
  previewId: preview.preview_id,
  selected: [0, 2],
});

// Or parse and write everything importable in one call:
await recipes.bulkImport.run({ format: 'text', text: pasted });

// Export as a file:
const csv = await hs.collection('people').bulkExport({ format: 'csv' });
```

The request and response types (`BulkImportRequest`, `BulkImportPreview`,
`BulkImportResult`, `ParsedItem`, …) are exported; the server compiles against
the same definitions.

## Files

```ts
const blob = await hs.collection('gift-cards').record(id).download('front_image');
```

`create`/`update` accept a plain object, a `FormData`, or an object with
`Blob`/`File` fields (auto-assembled into multipart).

## Errors

Every call rejects with a single `HomesteadError` (`code`, `message`, `path`,
`body`). The `AepbaseError` alias is exported for a soft migration from the
older clients.

## Escape hatches

```ts
await hs.request('/some/engine/path', { method: 'POST', body });
const res = await hs.raw('/streaming/path'); // raw Response
```

## Design

- **One transport, one error path.** `src/http.ts` resolves the token, encodes
  the body, and normalizes errors for every operation.
- **Fluent refs** (`src/refs.ts`) replace the old alternating
  `[plural, id, plural, id]` parent arrays with `collection().record().collection()`.
- **Strategies** (`src/auth/*`) are the only thing that differs between the
  browser, server, and CLI callers.

This package is intentionally standalone. The server (routes, crons, migrations,
app workers) and the e2e suite talk to the engine exclusively through it;
adopting it inside the SPA and CLI is still a follow-up.
