# Permissions

[Access & Tags](./access) decides which **apps** a person can open. Permissions
go a level deeper: they decide who can see and change individual **records** —
so you can share one recipe with a housemate, keep a person's medical notes to
themselves, or let only the adults edit the finances.

A fresh household starts **closed**: a new account can see nothing until you
give it an access level. You do that when you create the person — the create-user
form asks for one and defaults to **Member**, which is read and write across the
household — so in practice setup is one dropdown, not a chore. Nothing is shared
by accident, and there is no hidden rule to remember to delete later.

## This page covers

- [The three building blocks](#the-three-building-blocks)
- [Where access comes from](#where-access-comes-from-this-is-the-important-part)
- [Restrict one person](#restrict-one-person-the-common-case)
- [Share one record with one person](#share-one-record-with-one-person)
- [Give a group access](#give-a-group-access)
- [Block someone](#block-someone)
- [What to expect](#what-to-expect)
- [Reference notes](#reference-notes)

---

## The three building blocks

- **Grant** — one rule: *who* can do *what* to *which* data. "Bob can read
  gift-card #42." Everything below is built from grants.
- **Group** — a named set of people, like `Parents` or `Guests`. Grant access
  to a group and it applies to everyone in it.
- **Role** — a named bundle of abilities you hand to a group, like `member`
  (read and write everything) or `guest` (nothing until you share it). Three
  roles come built in: `admin`, `member`, and `guest`.

A rule grants one of three abilities, each including the ones before it:

| Ability    | Lets you…                                    |
| ---------- | -------------------------------------------- |
| **read**   | view a record                                |
| **write**  | create, edit, and delete                     |
| **manage** | everything, **plus** share it with others    |

---

## Where access comes from (this is the important part)

Nothing is granted by default. A household is seeded with **roles** and the
**groups** that confer them (`Admins` / `Members` / `Guests`) — but with no
grants at all. In plain terms:

> **A person can do nothing until you give them a role. Their access is then
> exactly what that role allows, and nothing more.**

A role reaches a person through a group: joining a group confers that group's
role. So:

- **Someone with no group** → no access. They can sign in, and see nothing.
- **Someone in a role-group** → exactly what the role grants. `Members` is read
  and write across the household, `Admins` adds the ability to grant others
  access, `Guests` grants nothing until you share something specific.
- **Their own records** → always theirs. Whoever creates a record can always read
  and change it, no grant required.
- **Superusers** → everything, always (break-glass) — you can't lock yourself out.
- **Superuser-only data** → a few collections aren't household data at all and
  no role covers them: **Credentials** (the API keys and tokens Homestead uses)
  and **MCP servers** (outside services for the assistant). Members and Admins
  can't list or add them; only superusers can. Sharing an MCP server with a group
  is how its members get to use it: **View** for its look-up tools, **Can edit**
  for its tools that change things too — the share decides which tools, while
  changing the server stays superusers-only. The MCP call log is superuser-only
  data too. A resource opts into this with `access: { model: 'superusers' }`.

This is what lets one household have full-access adults *and* a limited guest at
the same time: the adults are Members or Admins, the guest is defined by their
group's role or by the individual records you share with them.

> Earlier versions seeded an **open-household grant** (*everyone can read and
> write everything*) so that upgrading changed nothing. That grant is gone. On
> upgrade, a one-shot migration moves everyone who was relying on it into the
> `Members` group first, so nobody loses access — what changes is that the *next*
> account you create starts with nothing instead of everything.

---

## Restrict one person (the common case)

Say the household is mostly Members, but you want **mom limited to Pictionary**.
You give mom a role of her own, via a group:

```bash
# A role that grants just the Pictionary app…
homestead resources role create --name "Pictionary" \
    --grants '[{"target_scope":"app","target_app":"pictionary","capability":"write"}]'

# …a group that confers it, with mom in it.
homestead resources group create --name "Pictionary" --role <pictionary-role-id>
homestead resources group-membership create --group <group-id> --user <mom-id>
```

That's it — mom now sees only Pictionary, and everyone else is unaffected. Open
**Superuser → Users → Edit** on mom to confirm: her access summary will read
*"Can open 1 app: Pictionary."* If mom was already in another role-group, remove
her from it — access is the union of every role she holds.

---

## Share one record with one person

Rules live in the `access-grant` collection. You manage them from the command
line with `homestead resources` (a management UI is on the way).

To let Bob read gift-card `gc_42`:

```bash
homestead resources access-grant create \
    --subject_type user --subject_id bob \
    --target_scope record --resource_type gift-card --resource_id gc_42 \
    --capability read
```

Bob can now open that one gift card — and only that one. Sharing a record
shares **everything under it** too: Bob also sees that card's transactions, and
a share of a credit card covers its perks and their redemptions. A read share
lets him look; a `write` share lets him add, change, and remove them as well.
To stop sharing, delete the rule:

```bash
homestead resources access-grant list          # find the rule's id
homestead resources access-grant delete <id>
```

You can share a record you **own** or **manage** even without being an admin —
that's how sharing your own things works.

You can't share a child record on its own — a single transaction, say. Its
access always comes from the record above it, so the request is refused with a
message naming what to share instead.

---

## Give a group access

Groups save you from repeating yourself. Make a group, add people, then grant
the group access once.

```bash
# 1. Make the group
homestead resources group create --name Parents --id parents

# 2. Add people (optionally handing them a role while they're in it)
homestead resources group-membership create --group parents \
    --user alice --role member
homestead resources group-membership create --group parents --user bob

# 3. Grant the group access — here, read + write to all recipes
homestead resources access-grant create \
    --subject_type group --subject_id parents \
    --target_scope collection --resource_type recipe \
    --capability write
```

Use `--target_scope app` with `--target_app <app>` to cover a whole app at
once, or `--target_scope all` for everything.

---

## Block someone

A **deny** rule removes access, and **a deny always wins** — it beats every
grant, including someone's ownership of their own record. This is how you carve
one exception out of an otherwise-open household.

To keep a teen out of the finances app while everyone else keeps it:

```bash
homestead resources access-grant create \
    --subject_type user --subject_id teen \
    --target_scope app --target_app credit-cards \
    --capability read --effect deny
```

---

## What to expect

A few rules of thumb make the whole system predictable:

- **Owners keep their own.** Whoever creates a record can always read, edit, and
  share it — unless a deny rule names them.
- **Superusers see everything.** The main account is never locked out, so you
  always have a way back in. (Regular admins — people with the `admin` *role* —
  can be blocked by a deny.)
- **A deny always wins.** If any rule denies access, access is denied, no matter
  how many grants say otherwise.
- **What's under a record follows the record.** Whoever can reach a gift card
  can reach its transactions; a deny on the card hides them too. The same rule
  is why your notifications are yours alone: they live under your account.
- **Nothing is shared until you say so.** A new account has no access; you grant
  it by giving them a role, and widen from there.
- **Rules apply everywhere.** Enforcement is on the server, so it covers the
  API, the AI assistant, and the CLI — not only the web UI.

---

## Reference notes

- **Roles ride on groups.** In this version you give someone a role by adding
  them to a group with that role, not by assigning it to them directly.
- **The rules themselves are visible to the household.** Anyone signed in can
  read the grants, groups, and roles (only superusers and a record's owner can
  *change* them). This is intentional — it keeps the household transparent about
  who can do what, and the apps need it to show you the right screens. One
  consequence: a deny rule is discoverable, so "who is blocked from the finances
  app" isn't a secret. Permissions control *access to your data*, not *knowledge
  of the rules* — if you need someone's very existence in a rule kept private,
  this isn't the tool for that.
- **Changes are near-instant.** New rules take effect within a few seconds
  (there's a short cache), no restart needed.
- **Private collections.** A few collections are covered by the household roles
  only for *your own* records — the Documents app, whose point is per-folder
  sharing. Nothing is marked on the resource itself: the roles simply don't hand
  out everyone else's rows. You can still add records there, and you always see
  what you created.
- **What shows in the sidebar.** An app appears when you can reach any of its
  records. For a private collection that means you actually have one — upload
  your first document and Documents appears; delete your last and it goes.
- **Apps with nothing to store.** A few apps (like Chat) hold no records of their
  own, so there is nothing to check. Those are granted per app, and the built-in
  roles include them — which is why a Guest, granted nothing, doesn't see Chat.
  **Settings is the exception**: it manages your own preferences, so everyone
  signed in can reach it.
- **Filters.** A rule can target records by a condition instead of a fixed id —
  for example "recipes you created" (`created_by == subject.id`). Same
  expression language as list filters.
- **Permissions vs. tags.** [Tags](./access) decide which apps a person can
  open; permissions decide who can see and change the records inside them. Use
  tags for whole apps, permissions for specific data.
```
