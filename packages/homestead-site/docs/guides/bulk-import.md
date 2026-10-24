# Bulk Import

Let users import records into your app from a file — and let the CLI and any
REST client do the same.

Bulk import is a property of a **resource**, not a page. You declare which file
formats the resource accepts; the framework gives you the API, the import page,
the preview-and-confirm flow, and the writes.

```ts
// packages/homestead-apps/gift-cards/resources.ts
bulkImport: {
  formats: [
    {
      id: 'csv',
      label: 'CSV',
      inputType: 'file',
      accept: '.csv',
      hasTemplate: true,
      load: () => import('./methods/bulk-import-csv'),
    },
  ],
}
```

That declaration alone gets you `POST /api/aep/gift-cards:bulk-import`, an entry
in `GET /api/custom-methods`, `homestead resources gift-cards bulk-import`, and
a working import page.

## Table of Contents

- [How it works](#how-it-works)
- [Adding bulk import to your app](#adding-bulk-import-to-your-app)
  - [1. Write the parser](#1-write-the-parser)
  - [2. Declare the format](#2-declare-the-format)
  - [3. Add the page and route](#3-add-the-page-and-route)
  - [4. Add a discoverable link](#4-add-a-discoverable-link)
- [The API](#the-api)
- [Adding another file type](#adding-another-file-type)
- [Custom writes](#custom-writes)
- [Preview rows](#preview-rows)
- [Where code goes](#where-code-goes)

---

## How it works

Parsing and writing both run **server-side**, behind an AEP-136 custom method
the registry synthesizes from your `bulkImport` declaration. The browser uploads
the file and renders what the server parsed; it doesn't parse anything itself.
That's what makes bulk import scriptable — the import page and a `curl` are the
same call.

Every call runs as an [AEP-151 operation](https://aep.dev/151/): you get `202`
and a pending operation, then poll it. Long imports survive the user navigating
away, show up in the (superuser-only) Operations app, and fail cleanly if the
server restarts mid-import.

A call is two steps:

1. **Dry run** — parse and report. Nothing is written. This is what the page's
   preview shows.
2. **Import** — parse the same input again and write the selected rows.

The server re-parses rather than trusting rows the client sends back, so it stays
the only parser. Rows are addressed by the index the dry run reported.

## Adding bulk import to your app

### 1. Write the parser {#1-write-the-parser}

A parser turns raw input into candidate records. It must be pure — the dry run
calls it too.

For a CSV, declare your columns and let `createCsvParser` do the rest:

```ts
// packages/homestead-apps/<feature>/methods/bulk-import-csv.ts
import {
  createCsvParser,
  validateCurrency,
  validateOptionalString,
  validateRequiredString,
  type CsvSchema,
} from '@rambleraptor/homestead-core/server/bulk-import/csv';

export interface GiftCardImportData {
  merchant: string;
  amount: number;
  notes?: string;
}

export const giftCardCsvSchema: CsvSchema<GiftCardImportData> = {
  requiredFields: [
    {
      name: 'merchant',
      required: true,
      validator: validateRequiredString(200),
      description: 'Merchant name (max 200 characters)',
    },
    {
      name: 'amount',
      required: true,
      validator: validateCurrency({ min: 0 }),
      description: 'Card balance (e.g. 50.00 or $50.00)',
    },
  ],
  optionalFields: [
    { name: 'notes', required: false, validator: validateOptionalString(2000) },
  ],
  // Row label shown in the preview.
  labelFor: (raw) => (raw.merchant ? String(raw.merchant) : undefined),
};

/** Optional: the starter file offered behind "Download Template". */
export const template = () => 'merchant,amount,notes\nAmazon,100.00,Birthday gift\n';

export default createCsvParser(giftCardCsvSchema);
```

Shared validators live in
`@rambleraptor/homestead-core/server/bulk-import/csv`: `validateRequiredString`,
`validateOptionalString`, `validateEnum`, `validateNumber`, `validateCurrency`,
`validateBoolean`, `validateDate`. Write your own only for something they don't
cover — a validator is `(value, row) => ({ value, error? })`, and it receives the
whole row, so cross-field checks work.

::: warning Parsers must live under your app's `methods/` directory.
`resources.ts` is reachable from the client registry, so the production build
stubs out `methods/*` imports to keep server-only code out of the browser bundle.
A parser outside `methods/` ships to every visitor.
:::

### 2. Declare the format {#2-declare-the-format}

Add `bulkImport` to the resource in `resources.ts` (see the top of this page).
It's server-only — the schema sync strips it, same as `customMethods`.

### 3. Add the page and route {#3-add-the-page-and-route}

The page is the same for every app:

```tsx
// packages/homestead-apps/<feature>/bulk-import/index.tsx
import { BulkImportContainer } from '@rambleraptor/homestead-core/shared/bulk-import';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { GIFT_CARDS } from '../resources';
import { GiftCardPreview } from './GiftCardPreview';

export function GiftCardsBulkImport() {
  return (
    <BulkImportContainer
      config={{
        plural: GIFT_CARDS,
        appName: 'Gift Cards',
        appNamePlural: 'gift cards',
        backRoute: '/gift-cards',
        queryKey: queryKeys.app('gift-cards').all(),
        preview: GiftCardPreview, // optional
      }}
    />
  );
}
```

Register it in `app.config.ts`:

```ts
{
  path: 'import',
  component: () => import('./bulk-import').then((m) => m.GiftCardsBulkImport),
}
```

::: tip
If your app has a `:id` route, put `import` **before** it — otherwise the router
matches "import" as a record id.
:::

The page reads its format list from the server at runtime, so it needs no changes
when you add a file type.

### 4. Add a discoverable link {#4-add-a-discoverable-link}

Link to `/<app>/import` from your app's home:

```tsx
<Link to="/gift-cards/import" data-testid="import-button">Import</Link>
```

## The API

```http
POST /api/aep/gift-cards:bulk-import
{ "format": "csv", "data": "<base64>", "filenames": ["cards.csv"], "dryRun": true }

→ 202 { "id": "op_123", "done": false }
```

Poll `GET /api/aep/operations/op_123` until `done`:

```json
{
  "response": {
    "dryRun": true,
    "items": [
      { "index": 0, "data": { "merchant": "Amazon" }, "errors": [], "warnings": [], "label": "Amazon" }
    ],
    "summary": { "total": 12, "valid": 11, "invalid": 1 }
  }
}
```

Then import the rows you want:

```http
POST /api/aep/gift-cards:bulk-import
{ "format": "csv", "data": "<base64>", "selectedIndices": [0, 1, 3] }

→ 202 → { "response": { "dryRun": false, "created": 3, "failed": [], "summary": {…} } }
```

`selectedIndices` accepts an explicit list or `"*"` for every importable row, and
**defaults to `"*"`** — so a script can post a file and be done:

```bash
homestead resources gift-cards bulk-import --@data '{
  "format": "csv",
  "data": "'"$(base64 -i cards.csv)"'"
}'
```

Selecting a row that has errors is rejected rather than skipped: a caller that
named a specific row should hear that it couldn't be imported. Text formats send
`text` instead of `data`.

## Adding another file type

One format entry, one parser module. No UI changes — the page picks the new
format up from the server.

Recipes accepts pasted text and Paprika archives:

```ts
bulkImport: {
  formats: [
    { id: 'text', label: 'Plain Text', inputType: 'text',
      load: () => import('./methods/bulk-import-text') },
    { id: 'paprika', label: 'Paprika', inputType: 'file',
      accept: '.paprikarecipe,.paprikarecipes', multiple: true,
      load: () => import('./methods/bulk-import-paprika') },
  ],
}
```

A parser doesn't have to be a CSV — implement `BulkImportParser` directly when
you need to:

```ts
const parser: BulkImportParser<MyData> = {
  async parse(input, ctx) {
    // input.text for text formats; input.files ({ name, bytes }[]) for files.
    // ctx.auth is the caller, so a parser can look things up.
    return items; // ParsedItem[]: { index, data, errors, warnings, label? }
  },
};
export default parser;
```

**Report problems per item; don't throw.** An item with `errors` shows in the
preview as un-importable and leaves its neighbours importable. Throwing fails the
whole import. That's how one corrupt file in a multi-file upload costs you that
file and nothing else.

Parsers can be async and get `ctx.auth`, so a parser can fetch what it needs in
order to validate. Pictionary resolves player names against the People collection
this way — the preview and the import can't disagree about who exists, because
the same code answers both.

## Custom writes

By default each item becomes one record in the resource's collection, with
`created_by` stamped when the resource declares that field. When a row means more
than that, declare a saver:

```ts
bulkImport: {
  formats: [...],
  save: () => import('./methods/bulk-import-csv'), // the module exports `save`
}
```

```ts
export const save: BulkImportSaver<MyData> = async ({ items, ctx }) => {
  let created = 0;
  const failed = [];
  for (const item of items) {
    try {
      /* ...writes... */
      created++;
    } catch (error) {
      failed.push({ index: item.index, error: String(error) });
    }
  }
  return { created, failed };
};
```

A saver receives **every selected item at once**, not one at a time — which is
what lets it do things a row-at-a-time loop can't:

- **Pictionary** creates a game plus a team child record per team column.
- **People** creates everyone, *then* resolves `partner_name` in a second pass,
  because a partner may be someone created later in the same file, and finally
  groups rows that share an address into one household.

Collect per-item failures into `failed` instead of throwing, so one bad row
doesn't abandon the rest.

## Preview rows

The default preview dumps each record as key/value pairs. Pass a `preview`
component for anything better:

```tsx
import type { ItemPreviewProps } from '@rambleraptor/homestead-core/shared/bulk-import';
// Type-only import: the parser itself is stubbed out of the browser bundle.
import type { GiftCardImportData } from '../methods/bulk-import-csv';

export function GiftCardPreview({
  item,
  isSelected,
  onToggle,
}: ItemPreviewProps<GiftCardImportData>) {
  const isValid = item.errors.length === 0;
  // ...
}
```

Preview components are ordinary client components — they're the one part of bulk
import that isn't server-side.

## Where code goes

```
packages/homestead-apps/<feature>/
├── resources.ts                    # the `bulkImport` declaration
├── methods/
│   └── bulk-import-csv.ts          # parser (+ optional `template`, `save`) — SERVER ONLY
└── bulk-import/
    ├── index.tsx                   # the page (a config object)
    └── <App>Preview.tsx            # optional preview row
```

Framework internals, if you need them:

- `core/resources/bulk-import/types.ts` — the contract (formats, parsers, savers,
  wire shapes)
- `core/server/bulk-import/csv.ts` — `createCsvParser` and the shared validators
- `core/server/bulk-import/handler.ts` — the shared handler
- `core/shared/bulk-import/` — the page and its hooks
