# One tool per resource on `/api/mcp` — Design

**Status:** Implemented · **Audience:** contributors

> Adds a third MCP tool surface — `resource` — that mints **one tool per
> resource**, with the verb as an `action` parameter. It sits between the two
> surfaces we shipped before: it keeps the per-resource field schemas that make
> `typed` good, at a tool count that fits every client, and it recovers the
> per-resource typing that `generic` gives up.

> **What landed, and where it differs from this document.** All of §2–§9 as
> written, with `resource` as the new default (§6, the flip taken now). Two
> deviations, both small:
>
> - The instruction builders stayed in their own surface modules rather than
>   moving to `surface.ts` (§5). Making `homesteadInstructions` mode-aware there
>   would have created a value cycle for no benefit; instead `instructions` is a
>   field on the `ToolSurface` contract, which each builder fills in. That also
>   removed a double build: the route needs the string before it can construct
>   the MCP server, so it builds the surface once and passes it to registration.
> - Validating a custom method's body against its declared `request` schema
>   (§2.3) landed on **both** derived surfaces, not just this one. Splitting it
>   would have meant a call that works on `generic` failing on `resource`, which
>   is exactly the divergence the shared translation exists to prevent.
>
> §11's first open question is settled (the default flipped). The other two are
> still open and still not worth solving yet.

---

## 1. The problem

Before this change, `/api/mcp` served one of two surfaces, chosen by the
`settings` app's `mcp_tools` flag:

| Surface   | Tools on a stock instance | What the model sees |
|---|---|---|
| `typed` (the default then) | ~167 — 4 per resource (~40 resources), plus ~40 custom methods and `search_documents` | Full Zod→JSON-Schema for every field, per verb |
| `generic` | 6 — `describe_resources`, `read_records`, `create_record`, `update_record`, `delete_record`, `run_custom_method` | A `resource` enum and an untyped `fields` record; field schemas only on request |

Both are extremes, and each pays for the other's virtue:

- **`typed` is over-fanned.** Four tools per resource is a *verb × resource*
  cross-product, and the verb axis is the one that carries almost no
  information: `delete_gift_card` and `delete_recipe` differ only in a name.
  Meanwhile the expensive axis — the field set — is emitted **twice** per
  resource, since `create_x` and `update_x` both enumerate every field. The
  result is ~167 tools, past the tool cap some clients enforce, and tens of
  thousands of schema tokens in the client's context on every request.
- **`generic` is under-typed.** Collapsing to six tools makes `fields` a
  `Record<string, unknown>`. The model cannot see that `gift-cards.amount` is a
  number, that `status` is one of `active | spent`, or that `created_by` holds a
  user id, without spending a round trip on `describe_resources`.
  `generic` works hard to compensate — a catalog in the `resource` enum, a
  catalog in the initialize `instructions`, and errors that name the accepted
  fields — and that machinery exists precisely because the schema no longer
  says what the data is.

The missing rung is the one that drops the *uninformative* axis and keeps the
informative one: **one tool per resource, with the verb as a parameter.**
`gift_cards` is a tool; `create`/`read`/`update`/`delete` are values it takes.

That gives ~40 resource tools + `search_documents` — comfortably under every
client's cap — while each tool carries its own resource's real field schema,
typed, with enums, descriptions, and reference hints. It emits the field set
**once** per resource instead of twice, so it is *cheaper than `typed`* as well
as smaller.

---

## 2. The tool

### 2.1 Name

The tool is named for the resource: `snake(def.plural)` — `gift_cards`,
`credit_cards`, `recipes`, `transactions`. No verb prefix, because the verb is a
parameter. Clients namespace tools by server, so the model sees these as
`homestead:gift_cards`, which reads correctly.

Names are unique by construction — `plural` is globally unique in the registry,
and kebab→snake is injective over kebab-case names.

### 2.2 Shape

A single flat `z.object` shape, because that is what `server.registerTool`
accepts (`register.ts` hands the SDK a `ZodRawShape`; a top-level
discriminated union is not expressible there). Four params:

```ts
z.object({
  action: z.enum([...crudActions, ...customVerbs]),
  // one required param per ancestor, statically known for this resource
  gift_card_id: z.string().describe('id of the parent gift-cards record'),
  id: z.string().describe('id of the transaction record').optional(),
  fields: z.object({ /* this resource's real field schemas */ }).optional(),
  body: z.record(z.string(), z.unknown()).optional(), // custom methods only
})
```

Worked example — `gift_cards` (top-level, no custom methods):

```jsonc
{
  "name": "gift_cards",
  "description":
    "Gift cards. A stored-value gift card owned by the household.\n" +
    "Actions: list · get(id) · create(fields) · update(id, fields) · delete(id).\n" +
    "create requires: merchant, card_number, amount.",
  "inputSchema": {
    "action": { "enum": ["list", "get", "create", "update", "delete"] },
    "id":     { "type": "string" },
    "fields": {
      "merchant":    { "type": "string" },
      "card_number": { "type": "string" },
      "pin":         { "type": "string" },
      "amount":      { "type": "number" },
      "notes":       { "type": "string" },
      "archived":    { "type": "boolean" },
      "created_by":  { "type": "string", "description": "id of a user record" }
    }
  }
}
```

`transactions` (nested under `gift-card`) adds a **required** `gift_card_id`,
because every action on a nested resource needs its ancestor path — including
`list`. This is a real typing win over `generic`, whose `parent_ids` is an
opaque `Record<string, string>` the model has to be told about in prose.

`documents` (three item-target async custom methods) folds them into the enum:

```jsonc
"action": { "enum": ["list", "get", "create", "update", "delete",
                     ":classify", ":split", ":reembed"] }
```

### 2.3 Custom methods use AEP's `:verb` notation

A custom verb enters the `action` enum prefixed with a colon — `:classify`,
`:process-image`. Two reasons, one of them load-bearing:

1. It matches how AEP-136 writes custom methods
   (`POST /documents/{id}:classify`), so the enum reads like the API it stands
   for.
2. **It makes collisions impossible.** A resource that declared a custom method
   named `list` or `delete` would otherwise silently shadow a CRUD action. With
   the prefix, the two namespaces cannot overlap, and no skip-with-a-warning
   guard is needed — unlike the typed surface, where
   `buildCustomMethodTools(defs, taken)` has to defend a shared flat name
   space.

A verb's declared `request` schema cannot be a typed top-level param (one
schema serves every action), so it goes in `body` and is described in the tool
description as `:classify(document_id: string, force?: boolean)`. The executor
validates `body` against the declared schema and returns a teaching error, so
the typing is enforced even though it is not advertised in JSON Schema.

### 2.4 Why `fields` is nested rather than flat

`typed` puts field params at the top level (`create_gift_card({ merchant,
amount })`). On this surface that would let a field named `action`, `id`, or
`<parent>_id` shadow an addressing param — unreachable, and silently so.
Nesting the record body under `fields` separates addressing from payload and
removes the hazard by construction.

### 2.5 Required-ness

One schema serves five-plus actions with different requirements, so
requiredness that varies by action moves from JSON Schema to the executor.
The matrix:

| action | parent ids | `id` | `fields` | `body` |
|---|---|---|---|---|
| `list` | required | — | — | — |
| `get` | required | required | — | — |
| `create` | required | — | required; the resource's required fields enforced | — |
| `update` | required | required | required, ≥1 field (merge patch) | — |
| `delete` | required | required | — | — |
| `:verb` (item) | required | required | — | per declared `request` |
| `:verb` (collection) | required | — | — | per declared `request` |

What is *statically* typed stays statically typed: parent ids are required in
the schema (they are required for every action), each field keeps its type,
enum, and description, and `id` is a string. Only the cross-action requiredness
is deferred — and it is stated twice: in the description (`create requires:
merchant, card_number, amount`) and in the rejection message.

This is the same "errors teach" contract `generic` already relies on, and it is
enforced the same way: the executor validates against **the typed surface's own
create/update Zod schema**, so the guarantee is identical, not merely similar.

Rejections name what was accepted:

```
gift-cards: action "get" needs "id"
gift-cards: create is missing required field(s) merchant, amount — it accepts:
  merchant, card_number, pin, amount, notes, archived, created_by
gift-cards: unknown field "vendor" — it accepts: merchant, card_number, …
gift-cards: unknown action ":redeem" — it has: list, get, create, update, delete
```

### 2.6 `list` and `get` are separate actions

`typed` and `generic` both use one `read` with an optional `id`. Splitting it
here costs nothing and buys two things: the description can state exactly what
each needs, and `get` can *require* `id` instead of silently listing the
collection when the model forgets it. Both map to the same `read` binding.

---

## 3. Scopes

`homestead:read` vs. `homestead:write` works differently on this surface, and
better. On `typed`, a read-only authorization is expressed by **not registering**
the write tools; on `generic`, by not registering four of six. Here the tool
*is* the resource, so it cannot be withheld — instead the `action` enum
narrows:

| Scope | `action` enum |
|---|---|
| `homestead:read` | `list`, `get`, plus `:verb` for `GET`-declared custom methods |
| `homestead:write` | all of the above, plus `create`, `update`, `delete`, and the remaining verbs |

The read-only surface therefore becomes **self-describing**: a model holding a
read-only token sees an enum with no write actions in it, rather than inferring
the restriction from absent tools. The executor still rejects a write under a
read-only token (defense in depth, matching `generic`'s
`` `${name} needs write access` ``).

`:bulk-import` / `:bulk-export` stay unexposed on this surface too — they move
files, not model-composable JSON.

---

## 4. Execution: no new paths

Like `generic`, this surface **translates rather than reimplements**. A call to
`gift_cards({action: 'create', fields})` is flattened into exactly the args
`create_gift_card` takes, validated against that tool's Zod schema, and handed
to `executeToolCall`. A `:verb` call goes to `executeCustomMethod`. So
permissions, reference existence-checks, list caps, JSON-string field handling,
and AEP-151 operation bookkeeping behave identically on all three surfaces,
because there is one implementation of each.

Concretely, `generic.ts`'s `typedArgs()` already does this translation for a
resource resolved at call time. The resource-scoped surface needs the same
function with the resource resolved at **build** time — so the translation
moves to a shared module and both surfaces call it.

---

## 5. Module layout

The surface is shared with the AI chat (`POST /api/chat`), which runs its
model on it too, so the surface and everything it depends on live in
`homestead-core` next to the typed tool builder — `homestead-server` imports
from core, never the reverse:

```
packages/homestead-core/server/chat/
├── tools.ts                buildTools (typed CRUD tools) + the list params every
│                           surface shares (filter / order_by / limit, their
│                           grammar, LIST_CAP)
├── execute.ts              executeToolCall; a list is one engine page sized by
│                           `limit`, filtered and ordered server-side
├── surface.ts              ToolSurface + SurfaceResult contract
├── translate.ts            call → typed-call translation both derived surfaces
│                           share (toTypedCall carries the list params)
├── custom-methods.ts       one tool per AEP-136 custom method + executor
├── per-resource.ts         buildResourceTools(defs, { write }): ToolSurface
└── handler.ts              the chat turn: buildChatToolSet over the per-resource
                            surface (+ document search)

packages/homestead-server/src/mcp/
├── generic.ts              six resource-parameterized tools + catalog
└── register.ts             registers typed directly, or either derived surface
                            through registerSurface(server, surface, token)
```

Originally (as planned below) all of this sat under `homestead-server/src/mcp/`;
it moved to core when chat adopted the surface, since core cannot import from
the server package.

`registerGenericTools` and the new registration are byte-for-byte the same loop
over `{ tools, execute }`, so collapsing them into `registerSurface` removes the
duplication rather than adding a third copy:

```ts
export function registerHomesteadTools(server, defs, token, opts = {}) {
  const write = opts.write ?? true;
  const mode = opts.mode ?? 'typed';
  if (mode !== 'typed') {
    registerSurface(
      server,
      mode === 'generic' ? buildGenericTools(defs, { write })
                         : buildResourceTools(defs, { write }),
      token,
    );
    registerSearchTool(server, defs, token);
    return;
  }
  /* …existing typed registration… */
}
```

Route changes (`routes/mcp.ts`):

```ts
const flag = readAppFlag(engine, 'settings', 'mcp_tools');
const mode: McpToolMode =
  flag === 'generic' ? 'generic' : flag === 'typed' ? 'typed' : 'resource';
```

Note that `readAppFlag` returns `undefined` for an unset flag, so **the route's
fallback is the real default** — the `default: 'typed'` declared in
`settings/app.config.ts` only seeds the Flag Management UI. Both must change
together, or the two disagree.

### Instructions

`homesteadInstructions()` exists because `generic`'s tool names no longer name
the resources. On this surface they do, so the initialize `instructions` shrink
to a short preamble rather than a full catalog:

> Each tool is one resource; the verb is its `action` parameter. Call with
> `action: "list"` to see what a collection holds. Nested resources take their
> ancestor ids as `<parent>_id` params. Every call runs with the signed-in
> user's own permissions.

Generalize the export to `homesteadInstructions(defs, mode)` so the surface
picks its own, and move it out of `generic.ts` into `surface.ts`.

---

## 6. The flag, and which surface should be default

`settings.mcp_tools` grows a third option:

```ts
mcp_tools: {
  type: 'enum',
  label: 'MCP tool surface',
  options: ['resource', 'typed', 'generic'],
  default: 'resource',
  description:
    'How /api/mcp exposes your data. "resource" gives one tool per resource ' +
    'with the verb as a parameter (~41 tools, full field schemas) — the right ' +
    'choice for almost every client. "typed" gives four tools per resource plus ' +
    'one per custom method (~167 tools; richest schemas, largest context). ' +
    '"generic" collapses everything to six resource-parameterized tools for ' +
    'clients on a tight budget.',
}
```

**Recommendation: make `resource` the default.** It is not a compromise pick —
it is strictly better than `typed` on both axes that matter (fewer tools *and*
fewer schema tokens, since the field set is emitted once instead of twice)
while losing only cross-action requiredness, which the executor enforces
anyway.

The cost is honest and should be stated in the release notes: **this changes
behavior for instances that never set the flag**, because `undefined` currently
resolves to `typed`. An MCP client with a saved tool list will see the tool
names change on its next `tools/list`. Nothing breaks — the client re-lists —
but a user who has told their assistant "use `read_recipe`" will notice.

The conservative alternative is to ship `resource` as opt-in and flip the
default a release later. That is a reasonable call and costs only a line in the
route; I'd take the flip now, because the flag is two clicks in Flag Management
and takes effect with no restart, so an operator who dislikes it is never
stuck.

---

## 7. Budget

| Surface | Tools (stock: ~40 resources, ~40 custom methods) | Field set emitted | Read-only tool count |
|---|---|---|---|
| `typed` | ~167 | twice per resource (create + update) | ~41 |
| **`resource`** | **~41** (one per resource, plus `search_documents`) | **once per resource** | ~41, narrowed enums |
| `generic` | 6–7 | never (on demand) | 3 |

`test/mcp/per-resource.test.ts` pins this rather than leaving it as a comment
that rots: it asserts one tool per resource, and that a field name appears in
*one* tool's schema on this surface where it appears in two on `typed`.

---

## 8. Test plan

Mirror `test/mcp/generic.test.ts` in `test/mcp/per-resource.test.ts` — same
`GIFT_CARD` / `TRANSACTION` fixtures, same `captureFetch` stub, since both
surfaces execute against the engine over loopback.

1. **Surface** — one tool per def, named `snake(plural)`; `search_documents`
   still registered.
2. **Schema** — `action` enum holds the CRUD actions plus `:redeem`; `fields`
   carries `merchant: string`, `status: enum(active, spent)`, `balance: number`;
   `receipt` (file) and `legacy_code` (deprecated) are absent; `created_by`
   carries the reference hint.
3. **Nesting** — `transactions` requires `gift_card_id` for *every* action,
   `list` included.
4. **Read-only** — `buildResourceTools(defs, { write: false })` registers the
   same tools with enums narrowed to `list`/`get` (+`GET` verbs), and executing
   `create` under it is rejected.
5. **Requiredness** — `get`/`update`/`delete` without `id`, `create` missing a
   required field, `update` with an empty `fields` — each rejects with a message
   naming what was accepted.
6. **Unknowns** — unknown field, unknown action.
7. **Translation parity** — the fetch a `resource` call makes is identical to
   the one the equivalent `typed` call makes (URL, method, body), for a create,
   a nested create, an update, a delete, and an item-target custom method.
8. **Route** — extend `test/mcp/app-flags.test.ts`: the flag unset serves
   `resource`; `typed` and `generic` still serve theirs.

`make ci && make test` gates as usual; nothing here is data-adjacent, so
`make test-e2e` is unaffected.

---

## 9. Docs

- `guides/ai.md` — the "tool surface" section becomes three surfaces, with
  `resource` documented first as the default and a worked `gift_cards` example.
  The "Fewer tools: the generic surface" heading becomes "Choosing a surface".
- `settings/app.config.ts` flag description (above).
- `CLAUDE.md` needs no change — it does not enumerate MCP surfaces.

---

## 10. Alternatives considered

**A tool per resource per *category* (`read_gift_cards` / `write_gift_cards`).**
Halves nothing that matters — 84 tools, and the field set is still emitted once
per write tool. The split's only real benefit, read-only scoping, is already
handled by narrowing the `action` enum.

**A top-level discriminated union on `action`, giving per-action typed
schemas.** This is what we would write if the SDK took an arbitrary Zod schema.
It does not: `McpServer.registerTool` takes a `ZodRawShape` — an object shape —
and `register.ts` already reaches into `(spec.inputSchema as z.ZodObject).shape`
to hand it over. A root-level union has nowhere to go. Rejected on the SDK's
surface, not on taste; worth revisiting if that surface changes, and worth
checking client-side `oneOf` handling before relying on it.

**Per-action sub-objects (`create: {...}`, `update: {...}`) in one flat
shape.** Expressible, and it *would* preserve per-action requiredness. Rejected
because it says "create" twice (once in `action`, once as the key), duplicates
the field set exactly as `typed` does — surrendering the token win — and invites
the model to fill `update` while passing `action: "create"`.

**Keep `generic` and just add `describe_resources` output to the
instructions.** Cheaper, but it does not put field types in front of the model
at the moment it composes a call; it puts them in a system prompt the model may
be summarizing. The schema is the only place typing is *enforced* rather than
suggested.

**Drop `typed` entirely.** Tempting — `resource` dominates it — but `typed` is
the surface the AI chat's own tools are built from (`buildTools` in
`core/server/chat/tools.ts`) and the one whose per-verb schemas are strictest.
Keep all three; the cost is one branch.

---

## 11. Open questions

1. **Default flip now or next release?** §6 recommends now. Operator-visible,
   so worth a second opinion.
2. **Should `search_documents` fold in too?** It is not a resource, so it stays
   its own tool. If a `document`-scoped search ever wants to be `documents({action:
   ":search"})`, that is a custom method on `document`, not a surface change.
3. **Description budget for custom-method request schemas.** Inlining
   `:verb(field: type, …)` is compact for the ~2 verbs a resource has today. A
   resource with a dozen verbs would want them behind a `describe` action
   instead. Not worth solving until something approaches it.

## 12. Adopted by Chat

The built-in chat (`core/server/chat/handler.ts`) originally ran its model on
the typed surface — ~167 tools, with every resource's field set emitted twice
and no way to reach a custom method. It now hands the model the per-resource
surface, so Chat and an MCP client see the same ~41 tools and the same
`:verb` custom methods, and the surface's `instructions` double as the
"Tools" section of Chat's system prompt.

Two things changed on every surface to make a model's reads cheap:

- **`list` takes `filter`, `order_by`, and `limit`.** They pass straight to
  the engine (`GET /<plural>?filter=…&order_by=…&max_page_size=…`), which
  rejects a bad expression with a 400 the model can correct. The grammar is
  stated once — in the typed `filter` param's description, and once in each
  derived surface's instructions — not once per resource.
- **A list is one page, not the whole collection.** `limit` is the page size
  (default and max 100). The result is `{ records, count, truncated }`, with a
  `note` when the engine had more, so the model learns to narrow rather than
  page.

On the SPA side the chat transcript's tool markers show the resource and the
action (`gift_cards · create`), and the hook refetches app data after a
`create`/`update`/`delete` or any `:verb` call.
