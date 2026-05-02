# Module Flags

Module flags are typed, household-wide configuration values that any
module can declare and any consumer can read or write at runtime. They
power feature gating, role-scoped UI visibility, per-module behavior
toggles, and other small bits of household-wide state that don't deserve
their own resource.

The `module-flags` schema is generated dynamically from declared module
flags rather than written out as a static `ResourceDefinition` — the
Next.js server pushes it to aepbase on boot using the same machinery
that applies module-owned resource definitions, just with the schema
derived from each module's `module.config.ts` instead of a
`resources.ts`.

## Table of Contents

- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Declaring a Flag](#declaring-a-flag)
- [Reading and Writing a Flag](#reading-and-writing-a-flag)
- [The `enabled` Built-in](#the-enabled-built-in)
- [Schema Sync to aepbase](#schema-sync-to-aepbase)
- [Wire Format](#wire-format)
- [Flag Management UI](#flag-management-ui)
- [Environment Variables](#environment-variables)
- [Testing](#testing)
- [Design Notes & Gotchas](#design-notes--gotchas)

---

## Quick Start

```ts
// 1. Declare the flag in your module's config.
// frontend/src/modules/groceries/module.config.ts
export const groceriesModule: HomeModule = {
  id: 'groceries',
  // ...
  flags: {
    refill_threshold: {
      type: 'number',
      label: 'Low-stock threshold',
      description: 'Items at or below this count appear in the refill list.',
      default: 3,
    },
  },
};
```

```tsx
// 2. Read or write it from any component.
import { useModuleFlag } from '@/modules/settings';

function RefillBadge() {
  const { value, setValue, isLoading } =
    useModuleFlag<number>('groceries', 'refill_threshold');

  if (isLoading) return null;
  return <span>Refill at {value} or less</span>;
}
```

That's it. Defaults are guaranteed (no `undefined` even before the
backend round-trips), and the Flag Management UI at
`/superuser/flag-management` will pick the new flag up automatically.

---

## Architecture

Flags flow through three layers:

```
┌────────────────────────────────────────────────────────┐
│  Module config (declaration)                           │
│  src/modules/<feature>/module.config.ts                │
│    flags: { my_flag: { type, label, description, … } } │
└──────────────┬─────────────────────────────────────────┘
               │ getAllModuleFlagDefs()
               ▼
┌────────────────────────────────────────────────────────┐
│  Registry aggregation                                  │
│  src/modules/registry.ts                               │
│    Returns { moduleId: { key: ModuleFlagDef } }        │
│    Injects the built-in `enabled` flag per module.     │
└──────────────┬─────────────────────────────────────────┘
               │ buildResourceSchema(defs)
               ▼
┌────────────────────────────────────────────────────────┐
│  aepbase resource definition (singleton: module-flag)  │
│  Pushed at server boot by src/instrumentation.ts       │
│  Stored on one record; read by useModuleFlag(...)      │
└────────────────────────────────────────────────────────┘
```

| File                                                                   | Responsibility                                            |
| ---------------------------------------------------------------------- | --------------------------------------------------------- |
| `frontend/src/modules/types.ts`                                        | The `ModuleFlagDef` discriminated union.                  |
| `frontend/src/modules/registry.ts`                                     | `getAllModuleFlagDefs()` + built-in `enabled` injection.  |
| `frontend/src/modules/settings/flags.ts`                               | `fieldName`, `unflatten`, `withDefaults`, `buildResourceSchema`. |
| `frontend/src/core/module-flags/sync.ts`                               | `syncModuleFlagsSchema()` — POST/PATCH to aepbase.        |
| `frontend/src/instrumentation.ts`                                      | Next.js boot hook that runs the sync.                     |
| `frontend/src/modules/settings/hooks/useModuleFlag.ts`                 | Public read/write hook.                                   |
| `frontend/src/modules/settings/hooks/useModuleFlags.ts`                | Singleton-record fetcher (shared cache).                  |
| `frontend/src/modules/settings/hooks/useUpdateModuleFlag.ts`           | Upsert mutation for a single flag.                        |
| `frontend/src/modules/superuser/components/FlagManagementHome.tsx`     | The `/superuser/flag-management` admin UI.                |

---

## Declaring a Flag

Flag declarations live on a module's `HomeModule` config under `flags`.
The shape comes from `ModuleFlagDef`
(`frontend/src/modules/types.ts:169`):

```ts
export type ModuleFlagDef =
  | { type: 'string';  label: string; description: string; default?: string }
  | { type: 'number';  label: string; description: string; default?: number }
  | { type: 'boolean'; label: string; description: string; default?: boolean }
  | { type: 'enum';    label: string; description: string;
      options: readonly string[]; default?: string };
```

### Required vs. optional

- `label` — human-readable name, shown in the admin UI.
- `description` — one-line explainer, also shown in the admin UI.
  Required so operators always know what they're toggling.
- `default` — optional but **strongly recommended**. Without it, callers
  may see `undefined` until a value is written.
- `options` — required for `enum`, must be a tuple of strings.

### Naming

- Module ids stay **kebab-case** (`gift-cards`).
- Flag keys must be **snake_case** (`show_archived`, `refill_threshold`).
  They're concatenated into aepbase field names; see
  [Wire Format](#wire-format).

### Example: enum flag

```ts
// frontend/src/modules/settings/module.config.ts
export const OMNIBOX_ACCESS_OPTIONS = ['superuser', 'all'] as const;

export const settingsModule: HomeModule = {
  // ...
  flags: {
    omnibox_access: {
      type: 'enum',
      label: 'Omnibox access',
      description:
        'Who can use the natural-language omnibox (⌘K / search bar).',
      options: OMNIBOX_ACCESS_OPTIONS,
      default: 'superuser',
    },
  },
};
```

Re-exporting the option tuple as both a value and a `typeof` type is the
idiomatic way to keep call-site types narrow.

---

## Reading and Writing a Flag

The single public hook is `useModuleFlag` from `@/modules/settings`
(`frontend/src/modules/settings/hooks/useModuleFlag.ts`):

```ts
const { value, setValue, isLoading, isSaving, error } =
  useModuleFlag<MyType>('module-id', 'flag_key');
```

| Field       | Description                                                    |
| ----------- | -------------------------------------------------------------- |
| `value`     | Current value, falling back to the declared default.           |
| `setValue`  | `(next) => Promise<void>` — upserts the singleton.             |
| `isLoading` | `true` while the singleton record is first being fetched.      |
| `isSaving`  | `true` while a `setValue` mutation is in flight.               |
| `error`     | Non-fatal fetch error (404 is treated as "no record yet").     |

### Type narrowing

Pass the value type as a generic so call sites stay type-safe:

```ts
type Access = 'superuser' | 'all';
const { value } = useModuleFlag<Access>('settings', 'omnibox_access');
//      ^? Access | undefined
```

`value` is only `undefined` if you didn't declare a `default`.

### Cross-component sync

All consumers share one React Query cache key
(`MODULE_FLAGS_QUERY_KEY = ['module-flags']`). Calling `setValue` in one
component invalidates the cache, so every other `useModuleFlag` consumer
re-renders with the new value on the next tick. There's no realtime
push — if another tab or a cron mutates flags, this tab needs a refresh
or a manual `invalidateQueries`.

### Writing without reading

If you only need to write (e.g. an admin form), use the lower-level
`useUpdateModuleFlag` hook directly:

```ts
const update = useUpdateModuleFlag();
await update.mutateAsync({ moduleId, key, value });
```

---

## The `enabled` Built-in

Every module automatically receives an `enabled` flag, even without
declaring one. It's an `enum` flag with options
`['superusers', 'all', 'none']`, defaulting to whatever the module's
`defaultEnabled` config value is (or `'all'` if unset).

Source: `frontend/src/modules/registry.ts` (around line 216) and
`frontend/src/modules/settings/visibility.ts:10-14`:

```ts
export const MODULE_VISIBILITY_OPTIONS = ['superusers', 'all', 'none'] as const;
export type ModuleVisibility = (typeof MODULE_VISIBILITY_OPTIONS)[number];
export const DEFAULT_MODULE_VISIBILITY: ModuleVisibility = 'all';
```

| Value        | Meaning                                                |
| ------------ | ------------------------------------------------------ |
| `superusers` | Visible to superusers only (good for unfinished work). |
| `all`        | Visible to all authenticated users.                    |
| `none`       | Hidden from everyone, including superusers.            |

If a module declares its own `enabled` flag, the registry logs a warning
and the built-in still wins. To gate UI on this flag, use:

```ts
import { useIsModuleEnabled } from '@/modules/settings';

const enabled = useIsModuleEnabled('groceries');
if (!enabled) return null;
```

`useIsModuleEnabled` (and the bulk-predicate variant
`useModuleEnabledPredicate`) handle the role check against the current
user.

---

## Schema Sync to aepbase

`frontend/src/instrumentation.ts` runs once when the Next.js server
boots (dev or `next start`). It:

1. Logs in as the admin (`AEPBASE_ADMIN_EMAIL` /
   `AEPBASE_ADMIN_PASSWORD`).
2. Calls `getAllModuleFlagDefs()` to gather declarations.
3. Calls `syncModuleFlagsSchema()`
   (`frontend/src/core/module-flags/sync.ts`), which:
   - GETs `/aep-resource-definitions/module-flag`.
   - On 404, POSTs a fresh definition (`action: 'created'`).
   - If the schema differs, PATCHes
     (`Content-Type: application/merge-patch+json`,
     `action: 'updated'`).
   - If unchanged, returns `action: 'noop'`.

Idempotency is achieved by canonical-stringifying both the desired and
current schemas; the syncer is safe to run on every boot.

### Failure modes

- **Missing credentials** — sync is skipped with a console warning.
  Callers fall back to declared defaults. The Flag Management UI can
  re-trigger the sync from the browser using the superuser's own token.
- **Login fails or PATCH errors** — the error is logged and the boot
  continues. The app does not crash on a failed sync.
- **Caller writes a flag whose schema isn't registered yet** —
  `useUpdateModuleFlag` catches the 404, calls `syncModuleFlagsSchema`
  inline with the current user's token, and retries the upsert.

---

## Wire Format

A single record of type `module-flag` (singular) holds every flag for
the household. Field names are flattened so aepbase can store them as
plain JSON-schema properties:

```
fieldName(moduleId, key) = `${moduleId.replace(/-/g, '_')}__${key}`
```

(Source: `frontend/src/modules/settings/flags.ts:35`.)

Examples:

| Module      | Flag key           | Wire field                  |
| ----------- | ------------------ | --------------------------- |
| `gift-cards`| `show_archived`    | `gift_cards__show_archived` |
| `settings`  | `omnibox_access`   | `settings__omnibox_access`  |
| `groceries` | `refill_threshold` | `groceries__refill_threshold` |

The double-underscore separator ensures keys with their own underscores
don't collide. `parseFieldName()` is the inverse, restoring the
kebab-case module id.

A live record looks like:

```json
{
  "id": "rec-1",
  "create_time": "...",
  "update_time": "...",
  "gift_cards__show_archived": true,
  "settings__omnibox_access": "all",
  "groceries__refill_threshold": 5
}
```

### JSON-schema encoding

aepbase's resource-definition endpoint strips JSON-schema `enum`,
`default`, `minimum`, and `maximum` on round-trip (see
[CLAUDE.md § aepbase schema](../CLAUDE.md#aepbase-schema-typescript)).
The syncer works around this by encoding both `default` and `enum` into
the `description` string with markers:

```
"Original description. (default: foo) (one of: a, b, c)"
```

`frontend/src/modules/superuser/hooks/useModuleFlagsDefinition.ts`
parses these markers back out when the admin UI reads the registered
definition from aepbase.

Order matters: `default` precedes `options` so the parser can peel
markers off from the right.

---

## Flag Management UI

A superuser-only page at **`/superuser/flag-management`** shows every
registered flag, grouped by module, and lets operators edit values
inline.

Component: `frontend/src/modules/superuser/components/FlagManagementHome.tsx`.

It uses two queries:

- `useModuleFlagsDefinition()` — what flags exist (read from aepbase's
  resource definition, so it reflects whatever the server registered at
  boot, not just the local code).
- `useModuleFlags()` — current values from the singleton record.

Each flag renders as a typed input:

| Type      | Widget                                          |
| --------- | ----------------------------------------------- |
| `string`  | `<Input />`                                     |
| `number`  | `<Input type="number" />`                       |
| `boolean` | `<Checkbox />`                                  |
| `enum`    | `<select>` with options from `def.options`      |

If the resource definition is missing (e.g., admin creds weren't set at
server boot), the page detects the 404 and offers a "Register schema"
action that calls `syncModuleFlagsSchema()` with the current
superuser's token.

---

## Environment Variables

| Variable                  | Required | Default                  | Purpose                            |
| ------------------------- | -------- | ------------------------ | ---------------------------------- |
| `AEPBASE_ADMIN_EMAIL`     | for sync | —                        | Admin login at server boot.        |
| `AEPBASE_ADMIN_PASSWORD`  | for sync | —                        | Admin login at server boot.        |
| `AEPBASE_URL`             | no       | `http://127.0.0.1:8090`  | Base URL of the aepbase instance.  |

Without the admin credentials the schema sync is skipped, but the
frontend keeps working — `useModuleFlag` returns declared defaults and
the Flag Management UI can re-trigger registration on demand.

---

## Testing

Existing test coverage:

- `frontend/src/modules/settings/__tests__/flags.test.ts` —
  `fieldName`/`parseFieldName` round-trip, `unflatten` defaults, enum
  validation, `buildResourceSchema` JSON-schema generation.
- `frontend/src/modules/__tests__/registry.test.ts` —
  `getAllModuleFlagDefs()` injection of the built-in `enabled` flag,
  honoring `defaultEnabled`, preserving module-declared flags.
- `frontend/src/core/module-flags/__tests__/sync.test.ts` —
  create/no-op/update paths and error handling.
- `frontend/src/modules/settings/__tests__/useModuleFlag.test.tsx` —
  defaults when no record, reading stored values, PATCH/POST writes,
  and the on-the-fly schema-registration retry.
- `frontend/src/modules/superuser/hooks/__tests__/useModuleFlagsDefinition.test.tsx` —
  description-marker parsing for enums and primitives.

When adding a new flag type or wire-format change, update these
fixtures alongside the implementation. The flag system has no
dedicated e2e suite — exercise it from a feature module's e2e specs if
the flag affects user-visible behavior.

---

## Design Notes & Gotchas

1. **Household-wide singleton.** All flags live on one `module-flag`
   record. There's intentionally no per-user variant — flags are
   "household toggles", not user preferences. For per-user state, use
   the `user-preference` resource (see CLAUDE.md).

2. **Defaults are guaranteed at the call site.** `unflatten()` always
   merges declared defaults into the result, so consumers never need to
   handle `undefined` for a flag that declares a default. If you skip
   `default`, expect `undefined` until something is written.

3. **Description markers are load-bearing.** The admin UI reconstructs
   `default` and `options` by parsing the description string. Don't
   put literal `(default: …)` or `(one of: …)` text into a flag's
   description — it'll confuse the parser.

4. **No realtime sync.** Other tabs see new values on their next refetch
   (typically the next render after a cache invalidation). If you need
   instant cross-tab sync, layer your own `BroadcastChannel` on top.

5. **Schema changes aren't destructive.** Renaming a flag key creates a
   new field; the old value sticks around in the record until cleared.
   If you rename, write a one-shot cleanup that deletes the legacy
   field — there's no automated migration.

6. **The built-in `enabled` flag is special.** Don't redeclare it on
   your module; set `defaultEnabled` on the `HomeModule` config instead
   if you want a non-`'all'` default.

7. **The `module-flags` resource is generated dynamically.** Other
   resources are static — declared in each module's `resources.ts`
   and applied through `syncResourceDefinitions`. The `module-flags`
   schema is special because its fields derive from in-process flag
   declarations, but it shares the same boot-time apply pipeline.
