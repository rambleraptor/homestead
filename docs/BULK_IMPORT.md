# Bulk Import Framework

The bulk import framework lives at `frontend/src/shared/bulk-import/` and
provides a generic CSV-import flow that any module can plug into. A module
declares **what** it imports (a CSV schema, per-field validators, and a
"save one row" function); the framework supplies the **how** (file upload
UI, parser, validation summary, preview, error reporting).

The shape was originally extracted from the People module and is now used
by Gift Cards, People, and Pictionary.

## Table of Contents

- [How it works](#how-it-works)
- [Adding bulk import to a module](#adding-bulk-import-to-a-module)
  - [1. Create the bulk-import folder](#1-create-the-bulk-import-folder)
  - [2. Define the schema](#2-define-the-schema)
  - [3. Write per-field validators](#3-write-per-field-validators)
  - [4. Build the save hook](#4-build-the-save-hook)
  - [5. Custom preview component (optional)](#5-custom-preview-component-optional)
  - [6. Wire the entry component](#6-wire-the-entry-component)
  - [7. Register the route](#7-register-the-route)
  - [8. Add a discoverable link](#8-add-a-discoverable-link)
- [Patterns](#patterns)
  - [Simple modules: one row → one resource](#simple-modules-one-row--one-resource)
  - [Nested modules: one row → parent + children](#nested-modules-one-row--parent--children)
  - [Reshaping multi-column input](#reshaping-multi-column-input)
  - [Cross-field validation](#cross-field-validation)
  - [Resolving references by name](#resolving-references-by-name)
- [Future: non-CSV formats](#future-non-csv-formats)

---

## How it works

Three pieces fit together per module:

| Piece                | Type                                | Provided by  |
|----------------------|-------------------------------------|--------------|
| CSV schema           | `BulkImportSchema<T>`               | the module   |
| Field validators     | `FieldValidator<U>`                 | the module   |
| Per-row save         | `saveItem(row, helpers) => Promise` | the module   |
| File upload + parse  | `BulkImportContainer`               | the framework|
| Preview cards        | `DefaultItemPreview` or custom      | both         |
| Loop / error tracking| `useBulkImport`                     | the framework|

The flow:

1. User picks a `.csv` file in `BulkImportContainer`.
2. The framework calls `parseCSV(content, schema)`. For each data row, every
   field validator runs; the row is **valid** only if every required field
   is present and no validator returns an error.
3. If `schema.transformParsed` is set, valid rows are reshaped via that
   function (handy when several CSV columns collapse into one nested
   field).
4. The user sees a preview list (per-row card + summary stats), can
   deselect rows, and clicks Import.
5. `useBulkImport`:
   - calls `prepare()` once (if provided) to load lookup data,
   - iterates valid items, calls `saveItem(row, { ctx, createdBy })`,
   - tracks per-row success/failure, invalidates the supplied React Query
     key on success.

## Adding bulk import to a module

The shortest path is to copy the gift-cards module's setup
(`frontend/src/modules/gift-cards/bulk-import/`); for nested writes, copy
Pictionary's (`frontend/src/modules/pictionary/bulk-import/`).

### 1. Create the bulk-import folder

```
src/modules/<feature>/bulk-import/
├── schema.ts          # column definitions + transformParsed
├── validators.ts      # per-field validators
├── types.ts           # the imported row shape (`T`)
├── index.tsx          # entry component
├── <Module>Preview.tsx (optional)
└── useBulkImport<Module>.ts (only if save logic is non-trivial)
```

### 2. Define the schema

```ts
// src/modules/<feature>/bulk-import/schema.ts
import type { BulkImportSchema } from '@/shared/bulk-import';
import { validateName, validateAmount } from './validators';

export interface MyImportData {
  name: string;
  amount: number;
}

export const myImportSchema: BulkImportSchema<MyImportData> = {
  requiredFields: [
    { name: 'name', required: true, validator: validateName,
      description: 'Display name (max 200 chars)' },
    { name: 'amount', required: true, validator: validateAmount,
      description: 'Numeric amount' },
  ],
  optionalFields: [],
  generateTemplate: () => 'name,amount\nExample,42.00\n',
};
```

The framework auto-renders the field list (with descriptions) on the
upload screen and offers a "Download Template" button using
`generateTemplate()`.

### 3. Write per-field validators

A `FieldValidator<U>` takes the raw cell string + the full row object and
returns `{ value: U }` on success or `{ value, error }` on failure. The
`row` argument is useful for cross-field checks (see
[Cross-field validation](#cross-field-validation)).

```ts
// src/modules/<feature>/bulk-import/validators.ts
import type { FieldValidator } from '@/shared/bulk-import';

export const validateName: FieldValidator<string> = (value) => {
  const name = value.trim();
  if (name.length > 200) {
    return { value: name, error: 'name must be 200 characters or less' };
  }
  return { value: name };
};
```

Validators run synchronously at parse time. For data that needs to be
fetched async (e.g. "does this person exist?"), defer to the save step
(see [Resolving references by name](#resolving-references-by-name)).

### 4. Build the save hook

For a simple one-row → one-resource module, just call `useBulkImport`
directly with a `collection`:

```ts
// in your bulk-import/index.tsx
const bulkImport = useBulkImport({
  collection: AepCollections.MY_THING,
  queryKey: queryKeys.module('my-thing').list(),
});
```

For anything more complex (nested writes, name resolution, multi-step),
write a wrapper hook that uses the `saveItem` path — see
[Nested modules](#nested-modules-one-row--parent--children).

### 5. Custom preview component (optional)

Skipping `PreviewComponent` falls back to `DefaultItemPreview`, which
just renders each field as a key/value row. Most modules want something
prettier — see `GiftCardPreview.tsx`, `PersonPreview.tsx`, or
`GamePreview.tsx` for examples. Set it on the schema:

```ts
import { MyPreview } from './MyPreview';
export const myImportSchema: BulkImportSchema<MyImportData> = {
  // ...
  PreviewComponent: MyPreview,
};
```

### 6. Wire the entry component

```tsx
// src/modules/<feature>/bulk-import/index.tsx
'use client';
import { BulkImportContainer, useBulkImport } from '@/shared/bulk-import';
import { AepCollections } from '@/core/api/aepbase';
import { queryKeys } from '@/core/api/queryClient';
import { myImportSchema } from './schema';

export function MyModuleBulkImport() {
  const bulkImport = useBulkImport({
    collection: AepCollections.MY_THING,
    queryKey: queryKeys.module('my-thing').list(),
  });

  return (
    <BulkImportContainer
      config={{
        moduleName: 'My Things',
        moduleNamePlural: 'my things',
        backRoute: '/my-thing',
        schema: myImportSchema,
        onImport: bulkImport.mutateAsync,
        isImporting: bulkImport.isPending,
      }}
    />
  );
}
```

### 7. Register the route

Two places:

1. In `module.config.ts`, add `{ path: 'import' }` to `routes`.
2. Create the Next.js page at
   `src/app/(app)/<feature>/import/page.tsx`:

```tsx
'use client';
import { MyModuleBulkImport } from '@/modules/<feature>/bulk-import';

export default function MyModuleImportPage() {
  return <MyModuleBulkImport />;
}
```

### 8. Add a discoverable link

In your module's home component, add an "Import" button alongside the
primary "New X" action that pushes to `/<feature>/import`. See
`PeopleHome.tsx` or `PictionaryHome.tsx` for the pattern.

## Patterns

### Simple modules: one row → one resource

Gift cards is the canonical example. It uses the built-in `collection`
path with no custom hook:

```ts
useBulkImport({
  collection: AepCollections.GIFT_CARDS,
  queryKey: queryKeys.module('gift-cards').list(),
  transformData: (data) => ({ ...data, front_image: null, back_image: null }),
});
```

`transformData` runs once per row right before the create call, useful
for adding fields the CSV doesn't carry.

### Nested modules: one row → parent + children

When a row creates a parent record plus child records (e.g. one
Pictionary game with N teams), use the `saveItem` path. The framework
still owns the loop, error tracking, and query invalidation; you just
provide the per-row write:

```ts
useBulkImport<MyImportData, void>({
  queryKey: queryKeys.module('my-thing').all(),
  saveItem: async (row, { createdBy }) => {
    const parent = await aepbase.create(AepCollections.PARENTS, {
      ...row, created_by: createdBy,
    });
    await Promise.all(
      row.children.map((child) =>
        aepbase.create(
          AepCollections.CHILDREN,
          { ...child, created_by: createdBy },
          { parent: [AepCollections.PARENTS, parent.id] },
        ),
      ),
    );
  },
});
```

A thrown error is caught by the framework, recorded against the row's
line number, and the next row continues.

### Reshaping multi-column input

When several CSV columns logically collapse into one nested field
(e.g. `team_1` ... `team_6` → `teams: Team[]`), declare each column
as its own field with its own validator, then use `transformParsed` to
build the final shape:

```ts
export const myImportSchema: BulkImportSchema<CleanShape> = {
  requiredFields: [/* team_1, team_2 with makeTeamValidator */],
  optionalFields: [/* team_3..team_6, winner */],
  transformParsed: (raw) => ({
    teams: TEAM_COLUMNS
      .map((col) => raw[col])
      .filter((cell): cell is ParsedTeam => cell != null),
    winner: raw.winner,
  }),
  generateTemplate,
};
```

`transformParsed` only runs on rows that passed every per-field
validator, so you can trust the input.

### Cross-field validation

A field validator's second argument is the full raw row, so a validator
for one column can read the unparsed text of another column. Pictionary
uses this to verify the `winner` cell matches one of the filled
`team_N` cells:

```ts
export const validateWinner: FieldValidator<string | undefined> = (value, row) => {
  const winner = value.trim();
  if (!winner) return { value: undefined };
  const teamNames = collectTeamNames(row); // re-parse team_N from row
  if (!teamNames.has(winner.toLowerCase())) {
    return { value: winner, error: `winner "${winner}" is not a team in this row` };
  }
  return { value: winner };
};
```

### Resolving references by name

Validators run synchronously at parse time, so they can't hit the API.
For "does this person/store/etc. exist?" checks, defer to save time and
use the `prepare` hook to load the lookup table once before the loop
starts:

```ts
useBulkImport<MyImportData, Map<string, string>>({
  queryKey: queryKeys.module('my-thing').list(),
  prepare: async () => {
    const people = await aepbase.list<PersonRecord>(AepCollections.PEOPLE);
    return new Map(people.map((p) => [p.name.toLowerCase(), p.id]));
  },
  saveItem: async (row, { ctx: peopleByName, createdBy }) => {
    const ownerId = peopleByName.get(row.owner.toLowerCase());
    if (!ownerId) {
      throw new Error(`Unknown owner: "${row.owner}"`);
    }
    await aepbase.create(AepCollections.MY_THING, {
      owner: `people/${ownerId}`,
      ...row, created_by: createdBy,
    });
  },
});
```

A thrown error becomes a per-row import error so the user sees exactly
which rows had unknown references.

## Future: non-CSV formats

The framework today is CSV-only — `BulkImportContainer` checks for a
`.csv` extension and calls `parseCSV` directly. The schema/validator/
saveItem split was deliberately kept format-agnostic so a future
JSON/XLSX/etc. parser could plug in by:

1. Adding a `parser` field on `BulkImportSchema` (default: CSV).
2. Letting `BulkImportContainer` dispatch to the schema's parser based
   on the uploaded file.

This refactor is intentionally deferred until there's a real second
format in scope; the current shape is enough to ship CSV imports for
any module.
