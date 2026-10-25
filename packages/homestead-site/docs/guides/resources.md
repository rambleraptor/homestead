# Defining Resources

A resource is a kind of thing your app stores — a gift card, a recipe, a
todo. You declare its shape once, and Homestead gives you a full REST API
for it: list, get, create, update, delete, file uploads, and per-user
ownership. No migrations, no SQL, no endpoint code.

Each app owns the resources it manages. You declare them in a
`resources.ts` file next to the app and wire them into the app config with
`resources: [...]`. On the next server boot, Homestead creates anything
new and patches anything that changed.

## Table of Contents

- [Declaring a Resource](#declaring-a-resource)
- [Field Types](#field-types)
- [Enums](#enums)
- [File Fields](#file-fields)
- [Parent / Child Resources](#parent-child-resources)
- [Retention](#retention)
- [Hiding a Resource from AI Tools](#hiding-a-resource-from-ai-tools)
- [Wiring It Up](#wiring-it-up)
- [Adding or Changing a Resource](#adding-or-changing-a-resource)
- [Rules](#rules)

---

## Declaring a Resource

A resource definition lists the fields and a `singular` / `plural` name.
Export your collection's plural as a constant so your hooks can import it
instead of hard-coding a string.

```ts
// packages/homestead-apps/gift-cards/resources.ts
import type { ResourceDefinition } from '@rambleraptor/homestead-core/resources/types';

export const GIFT_CARDS = 'gift-cards' as const;

export const giftCardsResources: ResourceDefinition[] = [
  {
    singular: 'gift-card',
    plural: GIFT_CARDS,
    description: 'A stored-value gift card owned by the household.',
    user_settable_create: true,
    fields: {
      merchant: { type: 'string', required: true },
      card_number: { type: 'string', required: true },
      amount: { type: 'number', required: true },
      notes: { type: 'string' },
      archived: { type: 'boolean' },
      created_by: { type: 'string', description: 'users/{user_id}' },
    },
  },
];
```

You author fields in the friendly `FieldDef` shape — a `fields` map with
per-field options — never raw JSON schema. Homestead translates it to the
wire format for you.

---

## Field Types

| `type`     | Stores                                        |
| ---------- | --------------------------------------------- |
| `string`   | Text.                                         |
| `number`   | An integer or decimal.                        |
| `integer`  | A whole number.                               |
| `boolean`  | `true` / `false`.                             |
| `object`   | A nested JSON object (declare its `properties`). |
| `array`    | A list (declare its element type in `items`).  |
| `file`     | An uploaded file (see [File Fields](#file-fields)). |

Each field can also set:

| Option                          | Effect                                                        |
| ------------------------------- | ------------------------------------------------------------- |
| `required: true`                | The field must be present on create.                          |
| `description`                   | A short note, shown in the generated API docs and to the chat assistant. |
| `enum: [...]`                   | Restrict a string to a fixed set of values.                   |
| `default`                       | Value the engine applies when the field is omitted on create. Not allowed on `file` fields. |
| `format`                        | JSON-schema format hint for a string field, e.g. `date-time`. |
| `singular_name` / `plural_name` | Display names.                                                 |

---

## Enums

Restrict a string field to a fixed set of allowed values with `enum`:

```ts
fields: {
  status: { type: 'string', enum: ['pending', 'done'], required: true },
}
```

The allowed values show up in the API description and are passed to the
chat assistant as a real enum, so it never invents an invalid value.

---

## File Fields

Declare an upload with `type: 'file'`:

```ts
fields: {
  front_image: {
    type: 'file',
    description: 'Front-of-card image (jpeg/png/webp/gif, <=5MB)',
  },
}
```

Homestead stores the file on disk and exposes a download method for it.
Your create/update calls send file fields as `FormData`; everything else
goes as JSON.

### Lists of files, and files inside objects

A file can also sit below the top level — as a list, inside an object, or in a
list of objects:

```ts
fields: {
  attachments: { type: 'array', items: { type: 'file' }, maxItems: 5 },
  profile: { type: 'object', properties: { avatar: { type: 'file' }, bio: { type: 'string' } } },
  pages: {
    type: 'array',
    items: { type: 'object', properties: { scan: { type: 'file' }, caption: { type: 'string' } } },
  },
}
```

Each of these files reads back as a descriptor —
`{ id, url, name, media_type, size, encrypted }` — rather than a URL. Download
one with its id:

```ts
const blob = await aepbase.download('scrapbooks', id, { file: record.attachments[0].id });
```

or render it with `useFileUrl(plural, id, descriptor)`. `media_type` comes from
the file's own bytes for PDFs and common image formats, so you can trust it;
for anything else it's what the uploader claimed.

To write, put `File`s where they go and call `create` / `update` as usual — the
client turns them into multipart for you:

```ts
await aepbase.create('scrapbooks', {
  title: 'Trip',
  attachments: [photo, ticket],
  pages: [{ caption: 'front', scan: frontScan }],
});
```

On an update, an object merges (patching `profile.bio` keeps the avatar), but a
list is replaced whole. To keep a file in a list you're rewriting, send
`{ $file: '<id>' }` in its place; a file the record no longer references is
deleted. Files can't sit inside tagged-union `variants`, and `ai` options are
for top-level files only. The design is in
[Files in lists and objects](../design/nested-files).

---

## Parent / Child Resources

Some resources only exist under another — a transaction belongs to a gift
card, a redemption belongs to a perk. Declare the parent with `parents`:

```ts
{
  singular: 'transaction',
  plural: 'transactions',
  parents: ['gift-card'],
  fields: {
    amount_changed: { type: 'number', required: true },
    notes: { type: 'string' },
  },
}
```

A child lives at a nested URL — `/gift-cards/{id}/transactions/{id}` — and
the parent id is carried in the path, **not** stored as a field. Homestead
creates parents before children automatically.

A child **inherits its access from its parent**: whoever can read a gift card
can read its transactions, and whoever can change the card can add, change, and
remove them. Sharing the card shares them; a deny on the card hides them. Under
`user` this is the familiar rule — only that user (and superusers).

That's almost always what you want. For the rare child whose rows must be
governed on their own, opt out with `independent_access: true`; its rows are
then authorized by their own owner and grants, like a top-level resource's.
See [Parent access inheritance](../design/parent-access-inheritance).

---

## Retention

Some records only matter for a while — an old chat, a finished job. Give the
resource a `retention` window and Homestead deletes rows once they're older
than it:

```ts
{
  singular: 'conversation',
  plural: 'conversations',
  retention: { days: 60, field: 'last_message_at' },
  fields: {
    last_message_at: { type: 'string', format: 'date-time' },
  },
}
```

- **`days`** is how long to keep a row. **`field`** is what to measure from:
  leave it out for `update_time` (the row's last write), use `create_time`
  for its creation, or name a declared `date-time` field holding UTC ISO
  strings. A row whose named field is empty falls back to `update_time`.
- **`where`** limits which rows are ever eligible, in the same syntax as a
  list `filter`. Operations use it so only finished ones are swept:

  ```ts
  retention: { days: 3, field: 'create_time', where: 'done == true' },
  ```

  A `where` the server can't parse deletes nothing; the run's log says why.
- A sweep runs **daily at 3am** (server time), and once at boot. Each run is
  an entry in **Superuser → Operations**, with a log of what it removed.
- Deleting goes through the normal API, so it behaves like any delete: the
  row's **children go with it**, change events reach open tabs, and a row
  another record points at with `onDelete: 'restrict'` is **kept** and noted
  in the log rather than forced.
- A run deletes at most 500 rows per resource, so a big backlog clears over a
  few days.
- **Top-level** resources take `retention`, and so do resources parented
  directly under `user` — the sweep walks every user's records, which is how
  scheduled notifications are cleaned up. A child of anything else goes when
  its parent does. The boot check refuses a bad window, such a child, or a
  `field` that isn't a declared `date-time`.

Adding `retention` to a resource that already has data deletes the old rows
on the next sweep. Treat it like any change that touches real data.

---

## Hiding a Resource from AI Tools

Every resource shows up as a tool for the built-in assistant (Chat) and for
MCP clients. To leave one out of either, say so:

```ts
{
  singular: 'conversation',
  plural: 'conversations',
  modelTools: { chat: false }, // the assistant doesn't see its own transcripts
  // ...
}
```

`chat: false` hides it from the assistant; `mcp: false` hides it from every
MCP tool surface, MCP's resource catalog, and document search. Both default
to `true`. Hiding a resource hides its children too.

This is **not** a permission. The REST API, the CLI, and bulk export still
reach the resource exactly as before, under the caller's own access. It only
decides what a model is handed as tools.

A single custom method can opt out the same way, leaving the rest of its
resource in place:

```ts
customMethods: {
  rebuild: {
    modelTools: { chat: false }, // people run this, the assistant doesn't
    load: () => import('./methods/rebuild'),
  },
},
```

---

## Asking before a model acts

A custom method whose effect reaches beyond the household's data — a message
someone gets, an email that goes out — can require the person's say-so when a
model calls it:

```ts
customMethods: {
  send: {
    confirm: true,
    load: () => import('./methods/send-message'),
  },
},
```

The assistant then stops on an approval card showing the call (who it's to,
what it says) with **Approve** and **Deny**, and runs it only on Approve. The
wait is stored with the reply, so it can be answered later or from another
device. MCP clients already ask before each tool call, so nothing changes
there; nor for people calling the method themselves (the SPA, scripts, the
CLI), who are already deciding.

---

## Wiring It Up

Reference the definitions from your app config:

```ts
// packages/homestead-apps/gift-cards/app.config.ts
import { giftCardsResources } from './resources';

export const giftCardsApp: AppConfig = {
  id: 'gift-cards',
  // ...
  resources: giftCardsResources,
};
```

Resources that don't belong to any feature app (platform-level things)
live in `packages/homestead-core/resources/builtins.ts` instead.

---

## Adding or Changing a Resource

1. Add or edit the definition in your app's `resources.ts`.
2. Restart the server.

On boot Homestead validates names, orders definitions so parents land
first, and applies them: **new** definitions are created, **drifted** ones
are patched, and anything already in sync is left alone. Schema changes
touch real data, so review them carefully.

---

## Rules

These are aepbase constraints — the sync runner enforces them and fails
fast at boot if you break one.

1. **`singular` and `plural` are kebab-case** — `gift-card`, not
   `giftCard`. Uppercase is rejected.
2. **Field names are snake_case** — `card_number`, `created_by`.
3. **`singular` is globally unique** across all apps.
4. **Don't add date fields** like `created` / `updated`. Homestead manages
   `create_time` and `update_time` itself.
5. **Allowed values go in `enum: [...]`** — there's no `minimum` /
   `maximum`.
6. **You can't change a field's `type` or a resource's `parents`** after
   it exists. That requires deleting and recreating the definition
   (destructive — it drops the data).
