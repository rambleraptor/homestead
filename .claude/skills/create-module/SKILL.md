---
name: create-module
description: Scaffold a new Homestead feature module end-to-end — TypeScript resource definition(s), aepbase collection constants, the module package directory (types, hooks, components, config, tests), `homestead.config.ts` wiring, and e2e Page Object + CRUD spec. Use when the user asks to "create a module", "add a new module", "scaffold a feature", or to "wire up <feature> end-to-end".
---

# Create a Homestead Module

Homestead features are self-contained modules. Adding one touches (at minimum)
a per-module `resources.ts` declaring the aepbase schema, the module package
directory, `frontend/homestead.config.ts`, and the e2e tests. Routes are wired
by declaring `component` inside `module.config.ts` — there are no per-route
Next.js page files. This skill walks through every step so nothing gets
skipped.

Read `CLAUDE.md` in the repo root before making any changes — it's the source
of truth for conventions and contains schema gotchas that will bite you.

## Inputs to confirm up front

Before scaffolding, make sure you have answers for:

1. **Module id** (kebab-case, singular-ish): e.g. `chores`, `meal-planner`, `events`.
2. **Display name + description**: short user-facing copy.
3. **Lucide icon**: pick one from `lucide-react` (e.g. `Flag`, `Receipt`, `Users`).
4. **Section + navOrder**: where it sits in nav (`Money`, `Games`,
   `Relationships`, …). `navOrder` lower = earlier.
5. **Primary resource**: singular + plural (kebab-case), field list with types.
6. **Child resources?** If yes, the parent id and URL pattern.
7. **Module flags?** Typed knobs exposed in the settings UI.
8. **Omnibox synonyms**: words a user might type to jump here.

If any of these are missing, ASK before scaffolding — names bleed into file
paths, URL segments, and DB records and are painful to rename later.

## Workflow

Track each step below with TodoWrite. Work sequentially — later steps depend
on earlier ones (e.g. hooks need `AepCollections` entries that reference the
declared resources).

### 1. Declare the resource schema in TypeScript

Add a new `resources.ts` next to the module's `module.config.ts` exporting a
`ResourceDefinition[]`. Pattern after
`packages/homestead-modules/gift-cards/resources.ts` (with a child resource)
or `packages/homestead-modules/todos/resources.ts` (single resource).

```ts
import type { ResourceDefinition } from '@rambleraptor/homestead-core/resources/types';

export const featureResources: ResourceDefinition[] = [
  {
    singular: 'thing',
    plural: 'things',
    description: 'A thing the household tracks.',
    user_settable_create: true,
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        created_by: { type: 'string', description: 'users/{user_id}' },
      },
      required: ['name'],
    },
  },
];
```

**Rules to follow — violating these is the #1 cause of schema sync failures:**

- `singular` + `plural` must be **kebab-case**, never camelCase. `gift-card`,
  not `giftCard`.
- `singular` is **globally unique** across all modules — the registry throws
  on duplicates.
- Field names stay **snake_case** (`card_number`, `created_by`,
  `service_date`) to match existing PB-era data.
- Do NOT add `created`/`updated` fields — aepbase manages `create_time` and
  `update_time` automatically.
- Do NOT use JSON-schema `enum`, `minimum`, or `maximum` — they get stripped
  on round-trip. Encode allowed values in `description` instead:
  `description: 'one of: pending, success, error'`.
- Child resources need `parents: ['<parent-singular>']`. The runner topo-sorts
  by `parents` so children apply after their parent automatically.
- File fields: `type: 'binary'` plus `'x-aepbase-file-field': true`.
- `user_settable_create: true` on every resource users create.

The schema applies on the next Next.js boot (the runner POSTs/PATCHes via
aepbase's `/aep-resource-definitions` endpoint). For destructive changes
(field type changes, parent changes), the user needs to manually delete the
old definition first — flag this when relevant.

### 2. Wire `resources` into the module config

In `module.config.ts`, import and reference the array:

```ts
import { featureResources } from './resources';

export const featureModule: HomeModule = {
  // ...
  resources: featureResources,
};
```

### 3. Register the collection URL segment

Edit `packages/homestead-core/api/aepbase.ts` and add to `AepCollections`:

```ts
MY_THING: 'my-things',               // plural, kebab-case URL segment
MY_THING_CHILD: 'children',          // child resources: just the tail segment
```

Children encode their parent in URLs via the hook caller, not the constant.

### 4. Scaffold the module directory

Create `packages/homestead-modules/<module-id>/` with this shape (drop
subdirectories you don't need):

```
packages/homestead-modules/<module-id>/
├── components/               # React UI components
├── hooks/                    # TanStack Query hooks, one per operation
├── __tests__/                # Vitest tests colocated per the CLAUDE.md rule
├── types.ts                  # TypeScript interfaces
├── resources.ts              # ResourceDefinition[]
├── module.config.ts          # HomeModule config object
└── index.ts                  # Public exports (config + types)
```

**types.ts** — mirror the resource schema. Always include `id`, `path`,
`create_time`, `update_time`. Provide a separate `<Name>FormData` type for
mutation payloads. See `packages/homestead-modules/games/minigolf/types.ts`
for a clean example.

**module.config.ts** — export a `HomeModule` object. Minimal example:

```ts
import type { HomeModule } from '@/modules/types';
import { Flag } from 'lucide-react';
import { FeatureHome } from './components/FeatureHome';
import { featureResources } from './resources';

export const featureModule: HomeModule = {
  id: 'feature',
  name: 'Feature',
  description: 'One-line description',
  icon: Flag,
  basePath: '/feature',
  routes: [{ path: '', index: true, component: FeatureHome }],
  showInNav: true,
  navOrder: 20,
  section: 'Games',       // or 'Money', 'Relationships', etc.
  enabled: true,
  resources: featureResources,
  omnibox: {
    synonyms: ['feature', 'alt-name'],
    listComponent: FeatureHome,
  },
  // Optional: typed flags. See packages/homestead-modules/groceries/module.config.ts.
  // flags: { ... }
};
```

**hooks/** — one file per operation, all using `@tanstack/react-query`.
Pattern after `packages/homestead-modules/games/minigolf/hooks/`:
- `useThings.ts` — `useQuery` that calls `aepbase.list<T>(AepCollections.MY_THING)`.
  Sort client-side (aepbase has no sort param).
- `useCreateThing.ts` / `useUpdateThing.ts` / `useDeleteThing.ts` — `useMutation`
  hooks that invalidate `queryKeys.module('<module-id>').all()` on success.
- Set `created_by` to the resource path `users/${currentUserId}` when the
  schema has a `created_by` field.
- For child resources, pass `{ parent: ['<parent-plural>', parentId] }`.

**components/** — a `<Module>Home.tsx` entry point plus forms/lists. Use
`data-testid` on every interactive element so e2e tests can grab them.

**index.ts** — re-export the module config and the public types:

```ts
export { featureModule } from './module.config';
export type { Thing, ThingFormData } from './types';
```

### 5. Declare routes inside `module.config.ts`

Each `ModuleRoute` carries the React component it renders. There are no
per-route Next.js page files — a single catch-all under
`frontend/src/app/(app)/[...slug]/page.tsx` resolves URLs against the
registry and renders `route.component` directly.

```ts
import { FeatureHome } from './components/FeatureHome';
import { FeatureImport } from './components/FeatureImport';

routes: [
  { path: '', index: true, component: FeatureHome },
  { path: 'import', component: FeatureImport },
  // dynamic params: declare with `:name` and set `dynamic: true`
  // { path: ':id', component: FeatureDetail, dynamic: true },
],
```

If a route should be wrapped in a gate, add `gates: ['enabled']` (or
`'superuser'`). Components used as routes should accept
`{ params }: ModuleRouteProps` if they need URL params, or no props
otherwise.

### 6. Add the module to `homestead.config.ts`

Open `frontend/homestead.config.ts` and add the import + array entry.
That is the only registration step — nav, routes, dashboard widgets,
omnibox, module flags, and the resource schema are all picked up
automatically.

### 7. Write unit/integration tests (Vitest)

Create tests under `__tests__/` next to the code they cover. Follow the rules
in `CLAUDE.md` → "Testing Guidelines":

- Use `vi.mocked(...)` to override the global aepbase mock in `src/test/setup.ts`.
- Test hooks and components separately.
- Avoid snapshot tests for anything richer than pure text.

### 8. Add e2e coverage (Playwright)

1. Ensure the components you just built have `data-testid` on primary
   buttons/inputs (required by CLAUDE.md).
2. Create a Page Object at `tests/e2e/pages/<Module>Page.ts`. POMs contain
   interactions only — no assertions, no `console.log`.
3. Add aepbase seed helpers (`create<Thing>`, `deleteAll<Things>`) to
   `tests/e2e/utils/aepbase-helpers.ts`. Seeding via REST is 10-100× faster
   than driving the UI.
4. Wire your module's `resources` into `tests/e2e/config/apply-schema.ts`
   so e2e bootstraps the schema. Add an import + spread the array.
5. Create the spec at `tests/e2e/tests/<module-id>/<module-id>-crud.spec.ts`.
   Each test gets its own user (see existing fixtures) and cleans its own
   data in `beforeEach`.
6. Smoke-run: `cd tests/e2e && npm run test -- tests/<module-id>/`.

### 9. Run the full gate

```bash
make ci && make test
```

Per CLAUDE.md this is mandatory before pushing. Run `make test-e2e`
separately when data paths change.

### 10. Heads-up on schema sync

The new resource definition applies the next time the Next.js server boots
with `AEPBASE_ADMIN_EMAIL` / `AEPBASE_ADMIN_PASSWORD` set. Tell the user to
restart their dev server after pulling. Flag any destructive risks (e.g.
"this adds a new resource, no existing data affected" vs. "this renames a
field — manual delete + recreate required").

## What this skill does NOT do

- **It does not delete or alter aepbase data.** Schema changes that require
  destruction (type/parent changes) need a manual `DELETE
  /aep-resource-definitions/...` first; leave that to the human.
- **It does not invent field names.** If the user hasn't specified a schema,
  ask rather than guess.
- **It does not touch `module-flags`.** Module flags are auto-synced from
  `module.config.ts` by `src/instrumentation.ts`; the static resources
  pipeline doesn't apply to them.

## Wrap-up checklist

Before marking the task complete, verify:

- [ ] `resources.ts` added to the module directory (and reviewed against
      the CLAUDE.md rules list).
- [ ] `resources` referenced in `module.config.ts`.
- [ ] `AepCollections` entry added in `packages/homestead-core/api/aepbase.ts`.
- [ ] Module package directory created with `module.config.ts`,
      `types.ts`, `index.ts`, and at least one component + list hook.
- [ ] Every `ModuleRoute` declares a `component` (and `dynamic: true`
      where the path uses `:param`).
- [ ] Module imported and added to `frontend/homestead.config.ts`.
- [ ] Vitest tests added under `__tests__/`.
- [ ] Playwright POM + CRUD spec added under `tests/e2e/`.
- [ ] Module's resources wired into `tests/e2e/config/apply-schema.ts`.
- [ ] `make ci && make test` passes locally.
- [ ] User reminded to restart the Next.js dev server so the schema sync
      runs, with destructive-change risks called out.
