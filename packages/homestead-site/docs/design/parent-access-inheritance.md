# Parent access inheritance — Design

**Status:** Implemented · **Audience:** contributors

> Companion to [Permissions](./permissions) and
> [Per-record visibility](./record-visibility). Those documents decide who may
> reach a *collection* and a *row*. This one answers what they left implicit:
> who may reach the rows **under** a row.

---

## 1. The problem

Before this change every child resource was authorized on its own rows. A
transaction under a gift card carried its own `_owner` and matched its own
grants, independent of the gift card above it. Two things followed:

- **Sharing a record didn't share what hangs off it.** Share a gift card with
  someone and they could open the card but not its transactions. Share a vaccine
  and its doses stayed private. Every shareable thing would have needed custom
  share code that also wrote grants for its children, the way the documents app
  writes a filtered grant per shared folder.
- **The user subtree already worked the other way.** A record under
  `users/{id}` is reachable by that user and nobody else, decided by the path,
  never by the row's owner — which is why a notification the scheduler wrote
  *for* you is yours to read. That was a special case in the router
  (`checkUserScope`), not a rule the rest of the schema could use.

The chat work made this pressing: a conversation's messages are its children,
and a shared family thread is pointless if sharing the thread doesn't share the
messages. Because a definition's `parents` can never change after it ships,
the decision had to be made before the first child resource that needs it.

## 2. The rule

> A child record is reachable by whoever may reach its parent record.

Generalized up the chain: a request on a resource walks its parents until it
reaches the **governing ancestor** — the first ancestor that does not itself
inherit — and that record decides.

| Request | Governing ancestor |
| --- | --- |
| `gift-cards/g1/transactions/t1` | `gift-cards/g1` |
| `credit-cards/c1/perks/p1/redemptions/r1` | `credit-cards/c1` |
| `vaccines/v1/vaccinations/d1` | `vaccines/v1` |
| `users/u1/notifications/n1` | the user root, `users/u1` |

The user root is the case the engine always had. Users are not grant-governed —
you cannot share your user record — so the root keeps its rule: the user
themself, or a superuser. Every other governing ancestor *is* grant-governed,
so its record's ordinary resolution (owner ⇒ manage, record grants, collection
grants and their filters, denies) decides for its whole subtree.

Inheritance is **the default** for every parented resource. A resource opts out
with `independent_access: true`, which restores the old behavior for its rows
and makes it a governing ancestor for its own children.

## 3. The details

### 3.1 Verbs map onto the ancestor

| Request on the child | Needs on the governing record |
| --- | --- |
| GET, LIST, `:download` | read |
| POST (create), PATCH, PUT, DELETE | write |

So a read-only share of a gift card lets someone see its transactions but not
add one; a write share lets them add, change, and remove them.

### 3.2 The parent decides, not the child row

The child row's own `_owner` and allow grants play no part. A chapter Bob added
under Alice's book is Alice's to read and delete, and if Alice stops sharing
the book, Bob loses the chapter he wrote. This matches the user subtree, and it
is what makes a shared thread coherent: everyone who can see the thread sees
every message in it.

If a resource ever needs "authors own their rows" inside an inherited parent,
that is a narrower rule to add on top (owner ⇒ manage on the child), not a
reason to give up inheritance.

### 3.3 Denies still narrow on the way down

Inheritance sources **allows** only from the governing ancestor. Denies apply
from everywhere below it:

- a deny on the governing record (it fails resolution there);
- a deny on any inheriting ancestor in between — a deny on one perk hides its
  redemptions, though the credit card governs them;
- a deny on the child type or the child row — a role that allows gift cards
  but denies transactions keeps denying transactions.

For a LIST, an ancestor-level deny refuses the request; a child-type deny
becomes a row clause (`NOT …`) like any other.

### 3.4 Lists

A child list is always under one concrete parent (the engine has no wildcard
parent), so a list is one authorization of the governing record followed by an
unfiltered read of that parent's children — cheaper than the per-row
visibility clause it replaces. A caller who cannot read the governing record
gets **403**, the same answer a user subtree gives, where the old per-row
model returned an empty page.

### 3.5 Credentials

The credential ceiling still applies. A read-only OAuth scope caps verbs as
anywhere else. A personal access token passes when its own grants allow the
verb on **either** the governing record **or** the child type:

- tokens minted before this change are scoped per collection type (for example
  `notification`), so they keep working;
- a token granted one record reaches that record's children.

The token is still bounded by its owner: the owner-side decision (§3.2) runs
first.

### 3.6 Grants aimed at an inheriting resource

A record-scope **allow** on an inheriting resource's row would never be
consulted, so the grant write is refused with a 400 that names the governing
resource to share instead ("transactions inherit their access from their parent
gift-card; share the gift-card instead"). A record-scope **deny** stays valid
(§3.3). Collection-scope grants on an inheriting type are still accepted —
the household roles carry them — but they grant nothing on the server.

### 3.7 The household roles and the client mirror

The seeded household roles keep a collection grant per child type. The engine
no longer consults those allows, but the client's `can()` mirror reads them to
decide which apps appear in the sidebar, exactly as it reads the grants on
user-parented types that the server never consults either. An inheriting
child's `access` declaration therefore only shapes that seeded grant;
`per-record` is invalid there because its discriminator would decide nothing.

### 3.8 The change feed

`GET /api/events` decides per subscriber through `authorizeRecordRead`, the
check a GET runs, so live events follow inheritance with no feed changes:
share a parent and its children's events start arriving; a delete is decided
in `beforeDelete`, while the governing record still exists.

## 4. What changed for existing resources

No data moved; this is enforcement only. The audit test
(`homestead-server/test/permission-inherit-shipped.test.ts`) builds every
shipped child resource through its real parent chain under the real household
roles and pins, per child:

| Who | Before | After |
| --- | --- | --- |
| The member who made it | reaches it | reaches it |
| Another member, household-shared ancestor | reaches it | reaches it |
| Another member, private ancestor (a vaccine) | not reached | not reached |
| A guest | not reached | not reached |
| A guest listing under a parent they can't read | empty page | **403** |
| A guest the governing record is shared with | not reached | **reaches it** |
| A member with a deny on the governing record | reached it | **not reached** |

`group-membership` opts out: the permission model governs itself by the
manage-on-target rule, and a membership's access must not follow its group's.

## 5. Where it lives

| Piece | File |
| --- | --- |
| Governing-ancestor resolution | `homestead-server/src/engine/inherit.ts` |
| Single-record and list authorization | `enforceInheritedAccess`, `inheritedListClause` in `engine/enforce.ts` |
| Which rule a request takes | `accessPathFor` in `engine/router.ts` (user subtree · inherited · own) |
| Grant-write guard | `validateGrantInheritance` in `engine/enforce.ts` |
| Persisted opt-out | `independent_access` column on `_aep_resource_definitions` |
| Authoring + boot validation | `ResourceDefinition.independent_access`, `validateAccess` in `core/resources/translate.ts` |
| Tests | `test/engine/permission-inherit.test.ts`, `test/permission-inherit-shipped.test.ts` |

## 6. Left open

- **Delegation through the user root.** If the user root were ever
  grant-governed, a record grant on `users/sam` would let a delegate act inside
  Sam's subtree — close to an "assistant acting for Sam" principal. Out of
  scope here; this design doesn't preclude it.
- **The share button on child records.** No app renders `ShareButton` on a
  child today. If one does, it should offer to share the governing record; the
  server already refuses the child-row grant with a pointer to it.
