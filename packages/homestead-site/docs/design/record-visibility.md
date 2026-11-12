# Per-record visibility — Design

**Status:** Implemented (the platform half) · **Audience:** contributors

> **What has landed:** `FieldDef.immutable` with engine enforcement,
> `ResourceDefinition.access` with its boot validation, and
> `householdFilterFor` translating the declaration into a grant filter.
> `document` and `collection` declare `access: { model: 'private' }`, which
> retired the hardcoded `PRIVATE_COLLECTIONS` list.
>
> The client surface of §3.0.5 has landed too: `VisibilityPicker` and
> `VisibilityBadge` in `homestead-core/permissions/components/`, reading the
> declaration through `permissions/visibility.ts`. `bookmark` (the Bookmarks app)
> is the resource that declares `per-record` today — `visibility`, `household` /
> `private`, private by default — with its page text in a child that inherits
> the bookmark's access.
>
> **What has not:** the `todo` / `personal-todo` merge (§5), which is
> unscheduled. `reminder` — the motivating example throughout this document —
> has since been replaced by user-parented scheduled notifications, so read its
> declarations below as illustration, as with anything said about `todo`.

> Companion to [Permissions](./permissions). That document answers "who may
> reach this collection". This one answers a narrower question it left open:
> what to do when *the same kind of thing* is sometimes one person's and
> sometimes the whole household's.

---

## 1. The problem

Todos solved it by forking the resource. `todo` is household-wide; `personal-todo`
is `parents: ['user']` and private. Reminders is about to make the same call, and
the same fork would be the same mistake twice.

The fork is not a style preference — it is forced by the architecture. **Privacy
is currently encoded in the URL.** A private record lives at
`/users/{user_id}/personal-todos/{id}`; a shared one at `/todos/{id}`. The router
skips grant enforcement entirely for a user-parented resource — `checkUserScope`
governs it by path instead, and `enforce.ts` says so in its header comment:

> The router skips calling in here only for user-parented resources, where
> `checkUserScope` (subtree ownership by path) is the governing gate.

So the two privacy mechanisms are **mutually exclusive**, and which one applies is
a property of the resource definition, not of a row. There is no way to say "most
reminders belong to the household, this one is mine" — because the answer would
have to change the record's address.

### 1.1 What the fork costs, measured

In the todos app today:

| Duplicated | Detail |
|---|---|
| Two resource definitions | `todo` and `personal-todo` |
| **Duplicated placement fields** | Closing the drift meant copying `project`, `category`, and `in_main` onto `personal-todo` field-for-field. The old *"personal todos never belong to a project"* was a limitation of the workaround presented as a rule; the fix keeps two definitions of the same three fields in step by hand |
| **Referential integrity that stops at the fork** | `todo.project` can declare an `onDelete`; `personal-todo.project` deliberately cannot. A `restrict` would let one member's invisible private todo block another's list delete, with nothing on screen to explain it — so the deleter's client patches the private todos it can see, and the read side rescues the rest (`filterTodosForScope`). One resource would need none of that |
| Two read hooks + a merge | `useTodos`, `usePersonalTodos`, `mergeTodosForScope` |
| A synthetic union type | `TodoItem` carries `kind: 'family' \| 'personal'` to remember which collection a row came from |
| Two write paths | `useCreateTodo` / `useCreatePersonalTodo`, `useUpdateTodo` / `useUpdatePersonalTodo` |
| Two e2e seed helpers, plus an isolation spec | `personal-todos-isolation.spec.ts` |

Two consequences are worse than the line count:

- **The merge is client-side.** `mergeTodosForScope` unions two fetched arrays and
  re-sorts them in the browser, so ordering, filtering, and paging can never be
  pushed to the server across both. Every todo in the household must be fetched to
  show the first ten.
- **You cannot move a todo between the two.** Different collection, different URL,
  different id. "Actually, everyone should see this" is a delete plus a create,
  losing the id, the `create_time`, and anything pointing at it.

---

## 2. The primitives that already exist

Nearly everything this needs is built, shipped, and enforced. Worth listing
precisely, because the conclusion is that **no new enforcement code is required**.

| Primitive | Where | What it already does |
|---|---|---|
| `_owner` column | `engine/db.ts` (`OWNER_COLUMN`, indexed per table) | Stamped on **every** create from the authenticated caller (`ownerFor(caller)`, `crud.ts:462`) |
| Owner ⇒ manage | `permissions/resolve.ts` | A row's owner gets `manage` on it, as an allow a deny can still beat |
| Filtered collection grants | `GrantTarget.filter` | Already used in production: `OWN_ROWS_FILTER = 'created_by == subject.id'` scopes the documents role |
| Filter grammar | `engine/filter.ts` | Comparisons on schema fields, `&&`/`\|\|`, `in`, compiled to **parameterized SQL** |
| Visibility union | `computeVisibility()` → `mode: 'only'` | `{ ownerAllowed, allowRecordIds, allowFilters, deny… }` |
| SQL compilation | `enforce.ts` `visibilityToSql` | Emits exactly `(_owner = ? OR id IN (…) OR (<filter>)) AND NOT …` |
| Record-scope grants | `access-grant`, `ShareRecordDialog` | Share one row with a user, a group, or `everyone` |

Read that `visibilityToSql` line again, because it is the whole argument:

```sql
(_owner = ? OR id IN (...) OR (<compiled allow filter>)) AND NOT (...)
```

**"My own rows, plus every row matching a filter" is already a single WHERE
clause the engine emits today.** Nothing needs to be added to enforcement. What is
missing is only a way for a resource to *ask* for that shape.

---

## 3. The proposal

A resource declares that its rows carry their own visibility:

```ts
{
  singular: 'reminder',
  plural: REMINDERS,
  // New: the household role confers a grant filtered to this field's shared
  // value, instead of an unfiltered collection grant.
  access: { model: 'per-record', field: 'visibility', sharedValue: 'household' },
  fields: {
    visibility: {
      type: 'string',
      enum: ['private', 'household'],
      default: 'household',
      description: 'who can see this row: just its owner, or the whole household',
    },
    // …the rest of the resource, declared once
  },
}
```

The household role builder (`permissions/household.ts`) then emits, for this
collection, a grant filtered `visibility == 'household'` rather than an
unfiltered one. Everything downstream is unchanged:

- **LIST** resolves to `mode: 'only'` with `ownerAllowed: true` and one allow
  filter → `(_owner = ? OR (visibility = ?))`. One indexed clause, server-side.
  No client-side merge, and paging works.
- **GET / PATCH / DELETE** on one row go through `resolve()`: the owner path
  covers private rows, the filter covers household rows.
- **CREATE** is already handled — `filterEval` returns `true` when there is no
  row yet (`enforce.ts:115`), which is exactly why `OWN_ROWS_FILTER` can
  authorize creates without opening anyone else's rows. The same holds here.
- **Sharing one private row with one person** still works through the existing
  record-scope grant and `ShareRecordDialog`, unchanged.

So three tiers live in one collection: `_owner` is *mine*, the filter is *the
household's*, and record grants are *these specific people's*.


### 3.0 The full interface

Everything the proposal adds, in one place. Types slot into the existing
declarations; nothing here replaces an existing field.

#### 3.0.1 The declaration

```ts
// packages/homestead-core/resources/types.ts

/**
 * How a resource's rows are scoped to people. Omitted means `shared` — today's
 * behavior for every resource that isn't user-parented.
 */
export type ResourceAccess =
  /** Household-wide. The role confers an unfiltered collection grant. */
  | { model: 'shared' }
  /**
   * Every row belongs to whoever created it, and is reachable by others only
   * through an explicit grant. Replaced the hardcoded `PRIVATE_COLLECTIONS`
   * list. No options: the grant filter is always `OWN_ROWS_FILTER`, and §3.0.7
   * explains why overriding it would be meaningless.
   */
  | { model: 'private' }
  /**
   * Each row carries its own visibility in a declared field. The household role
   * confers a grant filtered `<field> == <sharedValue>`, which the engine
   * unions with the caller's own `_owner` rows — see §2.
   */
  | {
      model: 'per-record';
      /** snake_case name of the discriminator field, declared in `fields`. */
      field: string;
      /** The value meaning "the whole household". Used to build the filter. */
      sharedValue: string;
      /** The value meaning "only me". Written by `:make-private`. */
      privateValue: string;
    };

export interface ResourceDefinition {
  // …existing fields unchanged…
  /**
   * Row-scoping model. Omit for `shared`. Validated at boot by the schema sync
   * (see §3.0.2); invalid on a user-parented resource or a singleton, both of
   * which are already scoped by other means.
   */
  access?: ResourceAccess;
}
```

Declared on a resource:

```ts
{
  singular: 'reminder',
  plural: REMINDERS,
  access: { model: 'per-record', field: 'visibility',
            sharedValue: 'household', privateValue: 'private' },
  fields: {
    visibility: {
      type: 'string',
      enum: ['private', 'household'],
      default: 'household',
      description: 'who can see this row: just its owner, or the whole household',
    },
    // …the rest of the resource, declared once…
  },
}
```

#### 3.0.2 Boot-time validation

The schema sync already validates names and reference targets and fails fast;
these join it, so a bad declaration can never reach enforcement:

| Rule | Why |
|---|---|
| `field` exists in `fields` | otherwise the grant filter references a missing column |
| that field is `type: 'string'` with an `enum` | the filter compares a string literal |
| the `enum` contains both `sharedValue` and `privateValue` | the two methods must be able to write it |
| the field declares a `default`, and it is one of the two | a row with no value would be invisible to everyone but its owner |
| the field is **not** `required` | it has a default; requiring it would break existing create paths |
| `model: 'per-record'` is absent on a `parents: ['user']` resource | path scoping already governs; grants are never consulted there |
| `model: 'per-record'` is absent on a singleton | a singleton has one household-wide row and no `_owner` |

#### 3.0.3 The grant builder

`HouseholdCollection` needs **no change** — it already carries an arbitrary
`filter?: string`, and `seed.ts` already passes it through verbatim. Only the
function that computes it changes:

```ts
// packages/homestead-core/permissions/household.ts

/** The filter a household role grant carries for this resource, if any. */
export function householdFilterFor(def: ResourceDefinition): string | undefined {
  const access = def.access ?? { model: 'shared' as const };
  switch (access.model) {
    case 'shared':     return undefined;
    case 'private':    return OWN_ROWS_FILTER;
    case 'per-record': return `${access.field} == '${access.sharedValue}'`;
  }
}

export function householdCollections(
  defs: readonly ResourceDefinition[],
): HouseholdCollection[];   // signature unchanged; body consults the above
```

**`PRIVATE_COLLECTIONS` is gone.** `document` and `collection` declare
`access: { model: 'private' }` themselves, so core no longer names any app's
resources. `OWN_ROWS_FILTER` stays — it is the filter the `private` model
carries, which is platform vocabulary rather than app knowledge.

#### 3.0.4 Visibility is immutable — and why that is the arguable part

**Decision: a row's visibility is fixed at create.** To change it, delete the
record and make a new one. No `:share` / `:make-private` methods.

This is the one part of the design where the reasoning deserves spelling out,
because an earlier draft of this section oversold it.

##### The question is smaller than it first looks

The worry that produced the custom methods was: Alice creates a household
reminder (`_owner = alice`), Bob makes it private, and it becomes visible to
Alice alone — hidden from everyone, Bob included.

That reads like a security problem and isn't one. No data leaks; nothing becomes
visible to someone who could not already see it. And Bob, holding write on a
household row, **can already delete it outright**. Hiding it is strictly less
destructive than something he is already permitted to do. So the ceiling on the
harm was never high, which means none of the three options below is *unsafe* —
they differ in ergonomics and in how much machinery they cost.

##### Three options

| | (a) plain mutable field | (b) immutable field | (c) owner-only custom methods |
|---|---|---|---|
| Machinery | none — `PATCH` like any field | one new `FieldDef` option | two synthesized methods + an ownership check |
| Changing your mind | one-field `PATCH` | delete + recreate | one method call |
| Bob-hides-Alice's-row | possible (≤ deleting it) | impossible | possible via raw `PATCH` anyway |
| Offline | one queued mutation | **two**, non-atomic | one |
| Agent/chat behavior | works | silent no-op unless rejected | works |

Option (c) is the one to discard without regret: it pays the most and still
doesn't deliver, because a raw `PATCH` bypasses a custom method and the engine
has no field-level write rules to stop it.

Between (a) and (b), the honest summary is that **(b) buys a simpler write model
and pays for it at the moments a person changes their mind.** The claim that it
"closes a hole" needs qualifying: it prevents unauthorized changes by preventing
*all* changes. That is removing the door, not fixing the lock — legitimate, but
it should be chosen for simplicity, not mistaken for a security fix.

##### What immutability actually costs

Delete-and-recreate is not free, and two of the costs are not obvious:

- **`create_time` resets.** This is invisible for reminders (ordered by
  `due_at`) and *visible* for todos, which sort `byCreateTimeAsc` precisely so
  *"the oldest item stays at the top — todometer-style"*. Making a todo private
  would silently move it to the bottom of the list.
- **It is two writes, and this repo is offline-first.** Every resource mutation
  goes through the offline queue in `registerResourceMutationDefaults.ts`, with
  optimistic updates and temp-id remapping. A delete + create pair queued on a
  flaky connection can half-apply in a way a single-field `PATCH` never can.
- **`_owner` changes** to whoever recreated it. Arguably an improvement — the
  new private row genuinely belongs to the person who made it private — but it
  is a behavior change worth naming.
- **The id changes.** Cheap *today*: nothing in the repo declares a `reference`
  to `todo` or `reminder`. Revisit if a per-record resource becomes a reference
  target.

##### The engine change it needs

`stripReadOnlyFields` (`engine/validate.ts:227`) already drops any wire property
marked `readOnly`, but `preparePayload` (`crud.ts:331`) runs it on **create,
update, and apply alike** — so `readOnly` means *never settable*, not *settable
once*. Immutability needs the create-only variant:

```ts
// packages/homestead-core/resources/types.ts — FieldDef
/**
 * Settable at create, refused on every later write. The translator emits
 * `x-aepbase-immutable`; the engine enforces it in `handleUpdate` /
 * `handleApply` but not `handleCreate`.
 */
immutable?: boolean;
```

**Reject with `400`, do not silently strip.** The existing strip behavior is
right for `readOnly` (a client was never meant to send it) and wrong here: the
chat tool builder derives `update_<resource>` parameters from the schema's
fields, so the model *will* be offered `visibility` on an update, and stripping
would make its write a silent no-op it believes succeeded. A `400` is a
correctable error; a silent no-op is a lie. (Excluding immutable fields from
generated update tools is a good idea regardless, but the `400` is what makes
every other caller — script, `curl`, MCP — behave.)

##### Recommendation

**(b) is a defensible choice and it is the one recorded here.** If the todos
ordering surprise or the offline double-write turns out to bite in practice,
(a) is a strictly smaller design — no new `FieldDef` option, no engine change —
and it is safe for the reason at the top of this section: the ability to hide a
row is bounded above by the ability to delete it, which household members
already have.

#### 3.0.5 Client surface

Immutability shrinks this to two presentational pieces — there is no mutation
hook, because there is no mutation.

```tsx
// packages/homestead-core/permissions/components/VisibilityPicker.tsx
/**
 * Create-form control. Renders nothing for a resource whose `access.model`
 * isn't `per-record`, so a form can drop it in unconditionally.
 */
export interface VisibilityPickerProps {
  singular: string;
  value: string;
  onChange: (value: string) => void;
}

// packages/homestead-core/permissions/components/VisibilityBadge.tsx
/** Read-only marker on a private row. Renders nothing for a shared one. */
export interface VisibilityBadgeProps {
  singular: string;
  record: Record<string, unknown>;
}
```

The edit form must **not** render the picker: the field is immutable, so
offering it would promise something the engine will silently drop. A row's
visibility is stated, not adjusted.

`ShareRecordDialog` / `ShareButton` are untouched and still layer on top —
sharing a *private* row with named people or groups is a grant, and grants stay
mutable. Only the private/household axis is frozen.


#### 3.0.6 What the interface does **not** add

- **No engine enforcement code.** `resolve`, `computeVisibility`,
  `visibilityToSql`, and `compileFilter` are unchanged — §2 is the argument.
- **No wire-schema change.** `visibility` translates as an ordinary enum string
  field, so the chat tools get it free (`create_reminder` gains a `visibility`
  parameter with a real enum) and MCP follows.
- **No new REST verbs, and no custom methods at all.** The generated CRUD
  surface is the entire API. `POST` sets the field; `PATCH` silently ignores it.
- **No mutation UI.** No hook, no toggle — a create-time picker and a read-only
  badge (§3.0.5).
- **No client resolver change.** `canWith` still passes no `filterEval`, so a
  filtered grant still doesn't match client-side — which is why
  `collectionsWithVisibleRows` exists, and why §6.4 asks whether a third
  filtered collection is worth teaching it about.

#### 3.0.7 What the grant filter actually does, per model

Worth stating plainly, because the filter does a *different job* in each model
and the `private` case is easy to misread.

A collection-scope grant's filter is evaluated by `filterEval` in `enforce.ts`,
which has one special case that decides everything:

```ts
const filterEval: FilterEval = (filter) => {
  if (!opts.recordPath) return true; // create: no row yet
  return recordMatchesFilter(db, opts.plural, opts.recordPath, filter, …);
};
```

So a filter is a predicate over an *existing* row, and it is vacuously true on
CREATE. The engine's own comment spells out the consequence: *"the filter
describes which rows you may see and change, not whether you may add one."*

**On `private`, the filter is a create permit, not a read rule.** Read scoping
comes from `_owner` — `household.ts` says so directly: *"Row visibility for the
owner actually comes from `_owner` … the filter's real job is to authorize
CREATE without opening everyone else's rows."* As a read predicate,
`created_by == subject.id` is strictly redundant with `_owner`, and weaker:
`created_by` is app-set and optional, while `_owner` is engine-set on every
create and indexed.

That is why `model: 'private'` takes **no options**. An override would be
configuring a clause that only ever fires on CREATE, where it always returns
true. There is no caller for it — `document` and `collection`, the only two
private collections today, both want the default — and shipping a knob nothing
turns is the same mistake as an enum value nothing emits.

**On `per-record`, the filter earns its place**, because it does both jobs at
once:

| | `private` (`created_by == subject.id`) | `per-record` (`visibility == 'household'`) |
|---|---|---|
| CREATE | vacuously true → permits creating | vacuously true → permits creating **either** kind |
| Read/write one row | redundant with `_owner` | **load-bearing** — the only thing granting reach to *other people's* household rows |
| LIST clause | `(_owner = ? OR created_by = ?)` — two spellings of the same rows | `(_owner = ? OR visibility = ?)` — a genuine union |

The CREATE row is worth reading twice: because the filter is vacuously true when
there is no row, a member may create a row with **either** visibility value, and
then `_owner` governs the private one. That is the behavior we want, and it
falls out of existing semantics rather than needing a rule.

### 3.1 What this buys

- **One resource.** One schema, one set of hooks, one type, one set of e2e
  helpers. A private reminder has projects and categories because it is the same
  resource as a shared one — no drift.
- **One address, whatever the row's visibility.** `/reminders/{id}` regardless —
  the URL no longer encodes privacy, so the client fetches, pages, and sorts one
  collection. This is where most of the win is.

  *Note:* an earlier draft claimed "changing your mind is a PATCH" as the biggest
  gain. Visibility is now immutable (§3.0.4), so changing it means delete and
  recreate — the same cost the fork had. That is a deliberate trade of a rare
  operation for a much simpler write model, and it costs little here: nothing in
  the repo declares a `reference` to `todo` or `reminder`, so recreating loses an
  id nothing points at. **Revisit this if a per-record resource ever becomes a
  reference target** — then a dangling pointer would be a real cost.
- **`PRIVATE_COLLECTIONS` becomes a declaration.** It was a hardcoded list in
  `household.ts` naming `document` and `collection` from outside — the only
  place in core that knew a feature app's resources. The three models collapse
  into one declared field:

  | `access.model` | Household role grant | Example |
  |---|---|---|
  | `shared` (default) | unfiltered collection grant | `gift-card`, `event` |
  | `private` | filtered `created_by == subject.id` | `document`, `collection` |
  | `per-record` | filtered `<field> == <sharedValue>` | `reminder`, `todo` |

  `PRIVATE_COLLECTIONS` has since been deleted: the two documents resources
  declare `access: { model: 'private' }`, so a collection's privacy rule lives
  next to the schema it governs instead of in a list on the other side of the
  repo.

### 3.2 What it does *not* change

User-parenting stays exactly as it is for things that are per-user **by nature**,
where "the household's copy" is meaningless: `notification`,
`notification-subscription`, `preference`, `personal-access-token`, `favorite`,
`event-reminder`. Those are not two-mode resources and should keep path scoping,
which is simpler and needs no grant at all.

The distinction to apply: *is a household-wide instance of this thing coherent?*
A household reminder is. A household push subscription is not.

---

## 4. Why not the alternatives

**A record-scope grant per shared row.** Create the record, then write an
`access-grant` addressed to `everyone` at `scope: 'record'`. This needs *zero*
new primitives — it works today. But it makes the grant table 1:1 with the shared
rows (a household with 400 reminders grows 400 grant rows whose only content is
"normal"), it is two non-atomic writes per create, and it inverts the cost: the
common case pays and the rare case is free. Good for "share this one thing with
Dana", wrong as the default carrier of household visibility.

**A `private: boolean` with bespoke engine logic.** Same ergonomics as the
proposal, but it would mean new enforcement code in `enforce.ts` for a case the
filter grammar already expresses. The point of §2 is that we do not need to write
that.

**Keep forking.** Defensible exactly once. Twice is a pattern, and reminders would
be the second — with credit-card perks and documents plausibly behind it.

---

## 5. Migration

`personal-todo` → `todo` is the proving case, and it is an ordinary data
migration, not a schema rewrite:

1. Add `visibility` to `todo` (safe — a new field with a default).
2. For each `/users/{uid}/personal-todos/{id}`: create a `todo` with
   `visibility: 'private'` and `_owner` = that uid.
3. Mark `personal-todo` `deprecated: true`; remove it a release later with a
   migration declaring the drop, per the two-release rule in CLAUDE.md.

Step 2 needs the engine to let a migration **set `_owner` explicitly**, which it
currently does not — `ownerFor(caller)` always stamps the caller, and a migration
runs as admin. The precedent exists: `db.ts` already has a one-time
`backfillOwnerFromCreatedBy` for exactly this shape of problem. Either reuse it
(writing `created_by` and backfilling) or add an admin-only owner parameter.

Reminders needs no migration at all — it ships with `visibility` from the start,
which is the argument for settling this **before** the reminders scheduler exists
and rows accumulate.

---

## 6. Open questions

1. ~~**Who may flip `visibility`?**~~ **Resolved: nobody.** The field is
   immutable after create (§3.0.4). The question existed because a mutable field
   invited the wrong people to change it — if Alice created a household reminder
   (`_owner = alice`) and Bob PATCHed it to `private`, it became visible to Alice
   alone; Bob had not stolen it, but he had hidden it from everyone including
   himself. Owner-only custom methods would have narrowed that but could not
   close it, since a raw `PATCH` bypasses a method and the engine has no
   field-level write rules. Freezing the field removes the question rather than
   answering it. **Residual decision:** whether an update carrying the field
   should be silently stripped (consistent with `readOnly` and standard fields)
   or rejected with a `400`.
2. **What is the right default?** `household` for reminders and todos — the
   household case is the common one and a surprising *disclosure* is worse than a
   surprising *hiding* only if the default is wrong. Documents would keep
   `private`. This is per-resource, so the declaration should carry it.
3. **Orphaned private rows.** A private row whose owner is deleted is visible to
   nobody but a superuser. `created_by` has the same problem today and no
   `onDelete`; worth solving once for both.
4. **Does the client mirror need teaching?** `canWith` passes no `filterEval`, so
   a filtered grant never matches client-side — which is why
   `collectionsWithVisibleRows` exists as a server-side patch for the documents
   app. A third filtered collection makes that query list longer, though the
   comment there notes the cost scales with how restricted a caller is, not with
   data size.
5. **Is `visibility` the right field name?** It collides conceptually with app
   visibility in the sidebar. `sharing`, `scope`, or `audience` are candidates.
