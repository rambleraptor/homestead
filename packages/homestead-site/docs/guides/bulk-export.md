# Bulk Export

Let users export an app's records to a file — and let the CLI and any REST
client do the same. Bulk export is the mirror image of
[bulk import](./bulk-import): where import runs `parse → save`, export runs
`source → serialize`.

Export is a property of a **resource**, not a page. You declare which file
formats the resource can be exported to; the framework gives you the API, the
Export button, and the download.

```ts
// packages/homestead-apps/people/resources.ts
bulkExport: {
  formats: [
    {
      id: 'csv',
      label: 'CSV',
      mimeType: 'text/csv',
      extension: 'csv',
      load: () => import('./methods/bulk-export-csv'),
    },
  ],
}
```

That declaration alone gets you `GET /api/aep/people:bulk-export`, an entry in
`GET /api/custom-methods`, `homestead resources people bulk-export`, and a
working Export button.

## Table of Contents

- [How it works](#how-it-works)
- [Adding bulk export to your app](#adding-bulk-export-to-your-app)
  - [1. Write the serializer](#1-write-the-serializer)
  - [2. Declare the format](#2-declare-the-format)
  - [3. Add the button](#3-add-the-button)
- [Custom sources](#custom-sources)
- [Export options](#export-options)
- [Selecting which records](#selecting-which-records)
- [The API](#the-api)
- [Round-trip with import](#round-trip-with-import)
- [Where code goes](#where-code-goes)

---

## How it works

Fetching and serializing both run **server-side**, behind a custom method the
registry synthesizes from your `bulkExport` declaration. That's what makes export
scriptable — the Export button and a `curl` are the same call.

Unlike bulk import (a `POST` that spawns an [AEP-151](https://aep.dev/151/)
operation), export is a plain **`GET`** that streams the file straight back with
a `Content-Disposition: attachment` header. A download is a read: it needs no
request body and no progress polling.

The pipeline has two seams you can override, mirroring import's parser and saver:

- a **source** fetches the records and shapes them into flat rows (the mirror of
  import's saver);
- a **serializer** turns rows into a file's bytes (the mirror of import's
  parser).

## Adding bulk export to your app

### 1. Write the serializer {#1-write-the-serializer}

For a CSV, declare your columns and let `createCsvSerializer` do the rest:

```ts
// packages/homestead-apps/<feature>/methods/bulk-export-csv.ts
import { createCsvSerializer } from '@rambleraptor/homestead-core/server/bulk-export/csv';

export default createCsvSerializer(['name', 'address', 'notes']);
```

A column may be a bare name (read straight off each row) or an object with a
custom accessor and a description:

```ts
export default createCsvSerializer<Person>([
  { name: 'name', description: 'Full name' },
  { name: 'city', value: (p) => p.address?.city },
]);
```

`createCsvSerializer` handles RFC 4180 quoting (values with commas, quotes, or
newlines are quoted and embedded quotes doubled), so a file it emits re-parses
cleanly.

::: warning Serializers must live under your app's `methods/` directory.
`resources.ts` is reachable from the client registry, so the production build
stubs out `methods/*` imports to keep server-only code out of the browser bundle.
A serializer outside `methods/` ships to every visitor.
:::

A serializer doesn't have to be a CSV — implement `BulkExportSerializer` directly
to emit JSON, an archive, or anything else:

```ts
const serializer: BulkExportSerializer<MyRow> = {
  serialize(rows, ctx) {
    return JSON.stringify(rows, null, 2); // string or Uint8Array
  },
};
export default serializer;
```

### 2. Declare the format {#2-declare-the-format}

Add `bulkExport` to the resource in `resources.ts` (see the top of this page).
It's server-only — it never reaches aepbase (the schema-sync wire payload is an
explicit whitelist), same as `bulkImport` and `customMethods`.

### 3. Add the export screen {#3-add-the-export-screen}

Export gets its own page, like the import page. It's generic — it fetches the
resource's records, lets the user pick a subset with checkboxes and a search box,
and exports the selection. Nothing selected exports everything.

```tsx
// people/bulk-export/index.tsx — wired via an `export` route in app.config.ts
import { BulkExportContainer } from '@rambleraptor/homestead-core/shared/bulk-export';
import { PEOPLE } from '../resources';

export function PeopleBulkExport() {
  return (
    <BulkExportContainer
      config={{ plural: PEOPLE, appName: 'People', appNamePlural: 'people', backRoute: '/people' }}
    />
  );
}
```

Register it in `app.config.ts` (before any `:id` route, so `export` isn't
matched as a record id) and link to it from your app's home:

```ts
{ path: 'export', component: () => import('./bulk-export').then((m) => m.PeopleBulkExport) }
```

```tsx
<Button onClick={() => navigate('/people/export')}>Export</Button>
```

The screen needs **none of your list or item components** — it renders a plain
labelled checkbox list itself. By default each row is labelled by the record's
`name` (then `title`, then `id`); pass `config.label` to override:

```tsx
config={{ /* … */ label: (r) => `${r.first_name} ${r.last_name}` }}
```

If you just want a one-click "export everything" button somewhere (no picker),
`<BulkExportButton plural={PEOPLE} />` still works standalone: it reads the
formats from the server, downloads on click for a single format, opens a menu for
several, and renders nothing for a resource without `bulkExport`.

## Custom sources

By default the export lists the resource's own collection: one row per record,
its own columns. When a row means more than that, declare a source — the mirror
of import's saver.

```ts
bulkExport: {
  formats: [...],
  source: () => import('./methods/bulk-export-csv'), // the module exports `source`
}
```

```ts
export const source: BulkExportSource<PersonRow> = async ({ ctx, filter }) => {
  const hs = serverClient(ctx.auth.token);
  const people = await hs.collection('people').listAll(filter ? { filter } : undefined);
  // ...join across collections, shape each record into a flat row...
  return rows;
};
```

A source receives the whole request at once, so it can do the cross-collection
joins the default can't. **People** is the reason: a person's address lives in a
sibling `address` record linked through `person-shared-data`, and their partner
is another person linked by a `person-relationship` row — so exporting "names and addresses" means walking that graph
backwards. That's exactly the inverse of what the people *importer's* saver
writes.

## Export options

A resource can offer **toggles** that change how the source shapes the export —
declared as data, rendered generically by the export screen, and interpreted by
the source. People uses one to collapse a household (people who share an
`address_id`) into a single row instead of one row each:

```ts
bulkExport: {
  formats: [...],
  source: () => import('./methods/bulk-export-csv'),
  options: [
    { id: 'combine_households', type: 'boolean', default: false,
      label: 'Combine household members into one row' },
  ],
}
```

That's the whole per-resource cost. The screen renders a checkbox per option (the
only `type` today is `boolean`), the discovery endpoint carries the metadata, and
the value rides to the source as a query param — `?combine_households=true`, so
the CLI and any REST caller get it too. The source reads it off `options`, where
every declared option is always present (its `default` fills in an omitted one):

```ts
export const source = async ({ ctx, filter, options }) => {
  const people = await hs.collection('people').listAll(filter ? { filter } : undefined);
  if (!options?.combine_households) return perPersonRows(people);
  return groupByAddress(people).map((household) => ({
    name: household.map((p) => p.name).join(' & '),
    // ...shared address columns...
  }));
};
```

The screen never learns what a household is — it only renders a labelled boolean.
Grouping happens **within the exported set**: if the user ticked only one member
of a couple, only that one appears (an unticked partner isn't pulled in). Option
ids must not collide with the reserved params `format`/`filter`/`filename`.

## Selecting which records

Everything narrows through the one `filter` channel — including an explicit
"export exactly these" selection. The engine's `id` column is filterable and its
`in` operator takes a list literal, so a picked set of records is just a filter:

```
id in ["p1", "p2", "p3"]
```

That composes with any other predicate (both apply, AND), and defaults to
"everything," so a bare export is unchanged. There's no separate selection API —
a record that no longer exists simply isn't returned (the filter matches what's
there), the same as any other filter.

A custom source just forwards `filter` to its list; the engine does the
narrowing:

```ts
export const source = async ({ ctx, filter }) => {
  const people = await hs.collection('people').listAll(filter ? { filter } : undefined);
  // ...join and shape rows...
};
```

On the client you don't build this by hand — the [export screen](#3-add-the-export-screen)
does it. Its checkboxes drive a `selectionFilter(selectedIds)` (an `id in [...]`
string) that it hands to the export; nothing selected sends no filter, exporting
everything. If you're building a bespoke picker, the same two pieces are exported
for reuse: `selectionFilter(ids)` builds the filter, and the `useRowSelection`
hook manages the checkbox state (per-row plus a select-all that tracks the
visible rows).

## The API

```http
GET /api/aep/people:bulk-export?format=csv

→ 200
Content-Type: text/csv
Content-Disposition: attachment; filename="people.csv"

name,address,wifi_network,wifi_password,partner_name
Jane Doe,"123 Main St",HomeWiFi,pw,John Doe
```

Query params (all optional):

- `format` — a format id declared on the resource. Defaults to the first.
- `filter` — an aepbase list-filter passed to the source. Defaults to everything.
  A record selection rides here as `id in ["a", "b", ...]`.
- `filename` — overrides the download filename. Defaults to `<plural>.<ext>`.

From the CLI or a script:

```bash
homestead resources people bulk-export > people.csv
```

## Round-trip with import

Because both sides can share a single column list, a CSV you export re-imports
cleanly. People does exactly this: its export serializer derives its columns from
the same `personCsvSchema` the importer validates against, so the import
*template* and the export *header* can never drift.

## Where code goes

```
packages/homestead-apps/<feature>/
├── resources.ts                    # the `bulkExport` declaration
├── methods/
│   └── bulk-export-csv.ts          # serializer (default) + optional `source` — SERVER ONLY
└── bulk-export/
    └── index.tsx                   # the export screen (a config object)
```

Framework internals, if you need them:

- `core/resources/bulk-export/types.ts` — the contract (formats, sources,
  serializers, wire shapes)
- `core/server/bulk-export/csv.ts` — `createCsvSerializer` and the CSV escaping
- `core/server/bulk-export/handler.ts` — the shared handler
- `core/shared/bulk-export/` — the export screen (`BulkExportContainer`), the
  standalone button, `selectionFilter`, and the hooks
```
