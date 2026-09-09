---
name: create-app
description: Scaffold a new Homestead feature app end-to-end — TypeScript resource definition(s), aepbase collection constants, the app package directory (types, hooks, components, config, tests), `homestead.config.ts` wiring, and e2e Page Object + CRUD spec. Use when the user asks to "create an app", "add a new app", "scaffold a feature", or to "wire up <feature> end-to-end".
---

# Create a Homestead App

Homestead features are self-contained apps. Adding one touches (at minimum)
a per-app `resources.ts` declaring the aepbase schema, the app package
directory, `homestead.config.ts`, and the e2e tests. Routes are wired
by declaring `component` inside `app.config.ts` — there are no per-route
Next.js page files. This skill walks through every step so nothing gets
skipped.

Read `CLAUDE.md` in the repo root before making any changes — it's the source
of truth for conventions and contains schema gotchas that will bite you.

## Inputs to confirm up front

Before scaffolding, make sure you have answers for:

1. **App id** (kebab-case, singular-ish): e.g. `chores`, `meal-planner`, `events`.
2. **Display name + description**: short user-facing copy.
3. **Lucide icon**: pick one from `lucide-react` (e.g. `Flag`, `Receipt`, `Users`).
4. **Section + navOrder**: where it sits in nav (`Money`, `Games`,
   `Relationships`, …). `navOrder` lower = earlier.
5. **Primary resource**: singular + plural (kebab-case), field list with types.
6. **Child resources?** If yes, the parent id and URL pattern.
7. **App flags?** Typed knobs exposed in the settings UI.

If any of these are missing, ASK before scaffolding — names bleed into file
paths, URL segments, and DB records and are painful to rename later.

## Workflow

Track each step below with TodoWrite. Work sequentially — later steps depend
on earlier ones (e.g. hooks need the collection constants exported by the
declared resources).

### 1. Declare the resource schema in TypeScript

Add a new `resources.ts` next to the app's `app.config.ts` exporting a
`ResourceDefinition[]`. Pattern after
`packages/homestead-apps/gift-cards/resources.ts` (with a child resource)
or `packages/homestead-apps/todos/resources.ts` (single resource).

```ts
import type { ResourceDefinition } from '@rambleraptor/homestead-core/resources/types';

export const featureResources: ResourceDefinition[] = [
  {
    singular: 'thing',
    plural: 'things',
    description: 'A thing the household tracks.',
    user_settable_create: true,
    fields: {
      name: { type: 'string', required: true },
      status: { type: 'string', enum: ['pending', 'done'] },
      created_by: { type: 'string', description: 'users/{user_id}' },
    },
  },
];
```

Fields use the authoring-friendly `FieldDef` shape (per-field `required`
booleans, `enum` for allowed string values, `type: 'file'` for uploads,
optional `singular_name`/`plural_name` display names). The schema sync
translates it to aepbase's JSON-schema wire format at boot — apps never
write JSON schema directly.

**Rules to follow — violating these is the #1 cause of schema sync failures:**

- `singular` + `plural` must be **kebab-case**, never camelCase. `gift-card`,
  not `giftCard`.
- `singular` is **globally unique** across all apps — the registry throws
  on duplicates.
- Field names stay **snake_case** (`card_number`, `created_by`,
  `service_date`) to match existing PB-era data.
- Do NOT add `created`/`updated` fields — aepbase manages `create_time` and
  `update_time` automatically.
- Use `enum: [...]` for allowed string values (the translator encodes them
  into the wire description, since aepbase strips JSON-schema `enum`). Do
  NOT use `minimum`/`maximum` — there is no FieldDef support for them.
- Child resources need `parents: ['<parent-singular>']`. The runner topo-sorts
  by `parents` so children apply after their parent automatically.
- File fields: `type: 'file'`. The translator emits aepbase's
  `binary` + `x-aepbase-file-field` wire encoding — never write those.
- `user_settable_create: true` on every resource users create.

The schema applies on the next Next.js boot (the runner POSTs/PATCHes via
aepbase's `/aep-resource-definitions` endpoint). For destructive changes
(field type changes, parent changes), the user needs to manually delete the
old definition first — flag this when relevant.

### 2. Wire `resources` into the app config

In `app.config.ts`, import and reference the array:

```ts
import { featureResources } from './resources';

export const featureApp: AppConfig = {
  // ...
  resources: featureResources,
};
```

### 3. Export the collection URL segments

Export each plural as a constant from the app's `resources.ts` and use
it in the definition — hooks import these instead of hard-coding URL
segments:

```ts
export const THINGS = 'things' as const;             // plural, kebab-case URL segment
export const THING_CHILDREN = 'children' as const;   // child resources: just the tail segment
```

Children encode their parent in URLs via the hook caller, not the constant.

### 4. Scaffold the app directory

Create `packages/homestead-apps/<app-id>/` with this shape (drop
subdirectories you don't need):

```
packages/homestead-apps/<app-id>/
├── components/               # React UI components
├── hooks/                    # TanStack Query hooks, one per operation
├── __tests__/                # Vitest tests colocated per the CLAUDE.md rule
├── e2e/                      # Playwright POM + specs + seed helpers (see step 8)
├── types.ts                  # TypeScript interfaces
├── resources.ts              # ResourceDefinition[]
├── app.config.ts          # AppConfig config object
└── index.ts                  # Public exports (config + types)
```

**types.ts** — mirror the resource schema. Always include `id`, `path`,
`create_time`, `update_time`. Provide a separate `<Name>FormData` type for
mutation payloads. See `packages/homestead-apps/games/minigolf/types.ts`
for a clean example.

**app.config.ts** — export a `AppConfig` object. Minimal example:

```ts
import type { AppConfig } from '@rambleraptor/homestead-core/apps/types';
import { Flag } from 'lucide-react';
import { FeatureHome } from './components/FeatureHome';
import { featureResources } from './resources';

export const featureApp: AppConfig = {
  id: 'feature',
  name: 'Feature',
  description: 'One-line description',
  resources: featureResources,
  // Optional: typed flags. See packages/homestead-apps/groceries/app.config.ts.
  // flags: { ... }
  // `web` groups everything about how the app surfaces in the browser.
  web: {
    icon: Flag,
    // Served at /feature — the path is derived from `id`; never declare basePath.
    routes: [{ path: '', index: true, component: FeatureHome }],
    showInNav: true,
    navOrder: 20,
    section: 'Games',       // or 'Money', 'Relationships', etc.
  },
};
```

**hooks/** — one file per operation, all using `@tanstack/react-query`.
Pattern after `packages/homestead-apps/games/minigolf/hooks/`:
- `useThings.ts` — `useQuery` that calls `aepbase.list<T>(THINGS)` (the
  constant exported from `../resources`).
  Sort client-side (aepbase has no sort param).
- `useCreateThing.ts` / `useUpdateThing.ts` / `useDeleteThing.ts` — `useMutation`
  hooks that invalidate `queryKeys.app('<app-id>').all()` on success.
- Set `created_by` to the resource path `users/${currentUserId}` when the
  schema has a `created_by` field.
- For child resources, pass `{ parent: ['<parent-plural>', parentId] }`.

**components/** — a `<App>Home.tsx` entry point plus forms/lists. Use
`data-testid` on every interactive element so e2e tests can grab them.

**index.ts** — re-export the app config and the public types:

```ts
export { featureApp } from './app.config';
export type { Thing, ThingFormData } from './types';
```

### 5. Declare routes inside `app.config.ts`

Each `AppRoute` carries the React component it renders. There are no
per-route Next.js page files — a single catch-all under
`frontend/src/app/(app)/[...slug]/page.tsx` resolves URLs against the
registry and renders `route.component` directly.

`routes` lives under the config's `web` object:

```ts
import { FeatureHome } from './components/FeatureHome';
import { FeatureImport } from './components/FeatureImport';

web: {
  // ...icon...
  routes: [
    { path: '', index: true, component: FeatureHome },
    { path: 'import', component: FeatureImport },
    // dynamic params: declare with `:name` and set `dynamic: true`
    // { path: ':id', component: FeatureDetail, dynamic: true },
  ],
},
```

If a route should be wrapped in a gate, add `gates: ['enabled']` (or
`'superuser'`). Components used as routes should accept
`{ params }: AppRouteProps` if they need URL params, or no props
otherwise.

### 6. Add the app to `homestead.config.ts`

Open `homestead.config.ts` and add the import + array entry.
That is the only registration step — nav, routes, dashboard widgets,
app flags, and the resource schema are all picked up
automatically.

### 7. Write unit/integration tests (Vitest)

Create tests under `__tests__/` next to the code they cover. Follow the rules
in `CLAUDE.md` → "Testing Guidelines":

- Use `vi.mocked(...)` to override the global aepbase mock in `src/test/setup.ts`.
- Test hooks and components separately.
- Avoid snapshot tests for anything richer than pure text.

### 8. Add e2e coverage (Playwright)

E2E artifacts live next to the app they cover, under `e2e/`. Cross-
cutting plumbing (the aepbase fixture, generic REST primitives, the
`testUsers` fixture, core POMs like `LoginPage`/`DashboardPage`) stays
under `tests/e2e/`.

1. Ensure the components you just built have `data-testid` on primary
   buttons/inputs (required by CLAUDE.md).
2. Create the Page Object at
   `packages/homestead-apps/<app-id>/e2e/<App>Page.ts`. POMs
   contain interactions only — no assertions, no `console.log`.
3. Add aepbase seed helpers (`create<Thing>`, `deleteAll<Things>`, any
   `test<Thing>` data fixtures) to
   `packages/homestead-apps/<app-id>/e2e/helpers.ts`. Build them on the
   shared client via `e2eClient(token)` from
   `../../../../tests/e2e/utils/aepbase-helpers` (one more `..` if your app
   is nested under `games/`) — e.g.
   `e2eClient(token).collection('<plural>').create(body)`, and
   `deleteIfPresent(token, '<plural>', id)` in cleanup loops. Seeding via
   the client is 10-100× faster than driving the UI.
4. Create the spec at
   `packages/homestead-apps/<app-id>/e2e/<app-id>-crud.spec.ts`.
   Each test gets its own user (see existing fixtures) and cleans its own
   data in `beforeEach`. Import the Playwright fixture from
   `../../../../tests/e2e/fixtures/aepbase.fixture` and your helpers/POM
   from `./helpers` / `./<App>Page`.
5. Playwright auto-discovers the spec via `testMatch` in
   `tests/e2e/playwright.config.ts` — no config edit required.
6. Smoke-run: `cd tests/e2e && npm run test -- packages/homestead-apps/<app-id>/e2e/`.

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
- **It does not touch `app-flags`.** App flags are auto-synced from
  `app.config.ts` by `src/instrumentation.ts`; the static resources
  pipeline doesn't apply to them.

## Wrap-up checklist

Before marking the task complete, verify:

- [ ] `resources.ts` added to the app directory (and reviewed against
      the CLAUDE.md rules list).
- [ ] `resources` referenced in `app.config.ts`.
- [ ] Plural collection constants exported from `resources.ts` and used
      by the hooks.
- [ ] App package directory created with `app.config.ts`,
      `types.ts`, `index.ts`, and at least one component + list hook.
- [ ] Every `AppRoute` declares a `component` (and `dynamic: true`
      where the path uses `:param`).
- [ ] App imported and added to `homestead.config.ts`.
- [ ] Vitest tests added under `__tests__/`.
- [ ] Playwright POM + CRUD spec + `helpers.ts` added under the
      app's `e2e/`.
- [ ] `make ci && make test` passes locally.
- [ ] User reminded to restart the Next.js dev server so the schema sync
      runs, with destructive-change risks called out.
