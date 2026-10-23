---
name: add-resource
description: Add or modify an aepbase resource definition on an existing Homestead app — new resources, new fields, enums, file fields, child resources — with the safe-vs-destructive change rules enforced. Use when the user asks to "add a field", "add a resource", "change the schema", "make X an enum", or "add an image/file to <app>".
---

# Add or Modify a Resource

Resource definitions live in each app's `resources.ts` and are applied to
the engine by the boot-time schema sync. Schema changes touch **real
household data**, so this skill's main job is to classify the change as
safe or destructive before editing anything.

Read `CLAUDE.md` → "aepbase schema (TypeScript)" first; it is the source
of truth for the rules below.

## Step 0: Classify the change

| Change | Effect | Action |
|---|---|---|
| New resource | Created on next boot | Safe — proceed |
| New field on existing resource | Auto-PATCH on next boot | Safe — proceed |
| Edit description/enum/required/display names | Auto-PATCH | Safe — proceed |
| Remove a field | PATCH drops the column **and its data** | Confirm with the user first |
| Change a field's `type` | **Rejected by the engine** | Delete + recreate the definition (destroys all records) — confirm explicitly |
| Change `parents` | **Rejected by the engine** | Same as above |
| Rename `singular`/`plural` | Treated as a brand-new resource | Same as above |

Never silently do a delete + recreate. Spell out what data is lost and
get explicit confirmation.

## Step 1: Edit the authoring definition

Definitions use the `FieldDef` shape from
`@rambleraptor/homestead-core/resources/types` — a `fields` map, never
raw JSON schema. The schema sync translates it to aepbase's wire format
(`packages/homestead-core/resources/translate.ts`) at boot.

```ts
{
  singular: 'thing',          // kebab-case, globally unique
  plural: 'things',           // kebab-case
  description: 'A thing the household tracks.',
  user_settable_create: true, // on every resource users create
  fields: {
    name: { type: 'string', required: true },
    status: { type: 'string', enum: ['pending', 'done'] },
    due_at: { type: 'string', format: 'date-time' },
    receipt: { type: 'file', description: 'jpeg/png/webp, <=5MB' },
    created_by: { type: 'string', description: 'users/{user_id}' },
  },
}
```

Field rules (validated at boot — violations fail server start):

- Field names are **snake_case**; `singular`/`plural`/`parents` are
  **kebab-case**.
- `required` is a per-field boolean, not an array.
- `enum: [...]` is for string fields only. The translator encodes the
  values into the wire description (aepbase strips JSON-schema `enum`);
  the chat tool builder passes them to Gemini as a real enum.
- File uploads are `type: 'file'` — never write `binary` or
  `x-aepbase-file-field` (those are translator output).
- Arrays must declare `items`; nested objects declare `properties`
  (whose entries are `FieldDef`s too, with their own `required` booleans).
- `singular_name`/`plural_name` are optional per-field display names for
  generated UI; they never reach the wire.
- Don't add `created`/`updated` fields — the engine manages
  `create_time`/`update_time`.

Child resources declare `parents: ['<parent-singular>']`. The parent id
is **not** a stored field — it's encoded in the URL path; hooks pass
`{ parent: [PARENT_PLURAL, parentId] }`.

For a brand-new resource, also export its plural as a constant
(`export const THINGS = 'things' as const;`) — hooks import these from
`../resources` rather than hard-coding URL segments.

## Step 2: Update the app's TypeScript types

Mirror the change in the app's `types.ts` (record interface +
`<Name>FormData`). Every record type carries `id`, `path`,
`create_time`, `update_time`.

## Step 3: Update consumers

- Hooks/forms/components that create or render the resource.
- For new resources: list/create/update/delete hooks following the
  app's existing pattern (the `useResource*` wrappers give offline CRUD
  for free — nested resources work automatically from the definition's
  `parents`). For a cross-resource delete cascade, compose the standard
  hooks in a hand-written hook (see groceries' `useDeleteStore`) so each
  related write stays optimistic and offline-queued.
- Seed helpers in the app's `e2e/helpers.ts` if specs touch the new
  fields.

## Step 4: Verify

1. `make ci && make test`.
2. Boot the server (`bun packages/homestead-server/src/index.ts --dev`)
   and confirm the sync log line: `created` for new resources,
   `updated` for patched ones, no errors. Name-validation failures
   surface here with a `[resources] invalid definition` error.
3. Optionally inspect the applied definition: `homestead resources` (bare
   invocation lists resources), or
   `curl 127.0.0.1:3000/api/aep/aep-resource-definitions/<singular>` with an
   admin token.
4. Run the app's UI flow specs if data paths changed:
   `cd packages/homestead-test-harness && npx vitest run packages/homestead-apps/<app>/vm`
   (and `cd tests/e2e && npm run test -- packages/homestead-apps/<app>/e2e/`
   if the app still has Playwright specs).

## What this skill does NOT do

- It does not delete aepbase data or definitions without explicit,
  per-change confirmation.
- It does not invent field names or types — ask the user rather than
  guess.
