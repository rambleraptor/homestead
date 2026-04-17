---
name: create-module
description: Scaffold a new HomeOS feature module end-to-end — terraform resource definition(s), aepbase collection constants, the `src/modules/<feature>/` directory (types, hooks, components, config, tests), registry wiring, Next.js App Router pages, and e2e Page Object + CRUD spec. Use when the user asks to "create a module", "add a new module", "scaffold a feature", or to "wire up <feature> end-to-end".
---

# Create a HomeOS Module

HomeOS features are self-contained modules. Adding one touches (at minimum) the
terraform schema, the frontend module directory, the registry, the Next.js
route, and the e2e tests. This skill walks through every step so nothing gets
skipped.

Read `CLAUDE.md` in the repo root before making any changes — it's the source
of truth for conventions and contains terraform gotchas that will bite you.

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
on earlier ones (e.g. hooks need `AepCollections` entries that need terraform
resource definitions).

### 1. Design the terraform schema

Add a new file at `aepbase/terraform/<module_snake>.tf`. Pattern after
`minigolf.tf` (simple) or `gift_cards.tf` (with a child resource).

**Rules to follow — violating these is the #1 cause of failed `terraform apply`:**

- Resource type in HCL is literally `aep_aep-resource-definition` (the hyphen
  is real).
- `singular` + `plural` must be **kebab-case**, never camelCase. `gift-card`,
  not `giftCard`.
- Field names stay **snake_case** (`card_number`, `created_by`,
  `service_date`) to match existing PB-era data.
- Do NOT add `created`/`updated` fields — aepbase manages `create_time` and
  `update_time` automatically.
- Do NOT use JSON-schema `enum`, `minimum`, or `maximum` — they get stripped
  on round-trip. Encode allowed values in `description` instead:
  `description = "one of: pending, success, error"`.
- Child resources need `parents = ["<parent-singular>"]` AND an explicit
  `depends_on = [aep_aep-resource-definition.<parent>]` — `parents` alone
  does not create a terraform dependency.
- File fields: `type = "binary"` plus `"x-aepbase-file-field" = true`.
- `user_settable_create = true` on every resource users create.

Do not apply terraform yet — tell the user how to apply (see "Applying
changes" in `CLAUDE.md`). Touching real data requires their admin creds.

### 2. Register the collection URL segment

Edit `frontend/src/core/api/aepbase.ts` and add to `AepCollections`:

```ts
MY_THING: 'my-things',               // plural, kebab-case URL segment
MY_THING_CHILD: 'children',          // child resources: just the tail segment
```

Children encode their parent in URLs via the hook caller, not the constant.

### 3. Scaffold the module directory

Create `frontend/src/modules/<module-id>/` with this shape (drop
subdirectories you don't need):

```
src/modules/<module-id>/
├── components/               # React UI components
├── hooks/                    # TanStack Query hooks, one per operation
├── __tests__/                # Vitest tests colocated per the CLAUDE.md rule
├── types.ts                  # TypeScript interfaces
├── module.config.ts          # HomeModule config object
└── index.ts                  # Public exports (config + types)
```

**types.ts** — mirror the terraform schema. Always include `id`, `path`,
`create_time`, `update_time`. Provide a separate `<Name>FormData` type for
mutation payloads. See `src/modules/minigolf/types.ts` for a clean example.

**module.config.ts** — export a `HomeModule` object. Minimal example:

```ts
import type { HomeModule } from '../types';
import { Flag } from 'lucide-react';
import { FeatureHome } from './components/FeatureHome';

export const featureModule: HomeModule = {
  id: 'feature',
  name: 'Feature',
  description: 'One-line description',
  icon: Flag,
  basePath: '/feature',
  routes: [{ path: '', index: true }],
  showInNav: true,
  navOrder: 20,
  section: 'Games',       // or 'Money', 'Relationships', etc.
  enabled: true,
  omnibox: {
    synonyms: ['feature', 'alt-name'],
    listComponent: FeatureHome,
  },
  // Optional: typed flags. See src/modules/people/module.config.ts.
  // flags: { ... }
};
```

**hooks/** — one file per operation, all using `@tanstack/react-query`.
Pattern after `src/modules/minigolf/hooks/`:
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

### 4. Wire it into the registry

Edit `frontend/src/modules/registry.ts`:

1. Add the import near the other module imports.
2. Add the config object to the `MODULES` array (position matters for nav
   order only if modules share a `navOrder`).

That's the only registration step — routes, nav, and omnibox are picked up
automatically.

### 5. Create the Next.js App Router page(s)

Create `frontend/src/app/(app)/<basePath>/page.tsx` that renders the home
component:

```tsx
import { FeatureHome } from '@/modules/feature/components/FeatureHome';

export default function FeaturePage() {
  return <FeatureHome />;
}
```

Add one file per additional route declared in `module.config.ts`
(e.g. `routes: [{ path: 'import' }]` → `.../feature/import/page.tsx`).

### 6. Write unit/integration tests (Vitest)

Create tests under `src/modules/<module-id>/__tests__/`. Follow the rules in
`CLAUDE.md` → "Testing Guidelines":

- Use `vi.mocked(...)` to override the global aepbase mock in `src/test/setup.ts`.
- Test hooks and components separately.
- Avoid snapshot tests for anything richer than pure text.

### 7. Add e2e coverage (Playwright)

1. Ensure the components you just built have `data-testid` on primary
   buttons/inputs (required by CLAUDE.md).
2. Create a Page Object at `tests/e2e/pages/<Module>Page.ts`. POMs contain
   interactions only — no assertions, no `console.log`.
3. Add aepbase seed helpers (`create<Thing>`, `deleteAll<Things>`) to
   `tests/e2e/utils/aepbase-helpers.ts`. Seeding via REST is 10-100× faster
   than driving the UI.
4. Create the spec at `tests/e2e/tests/<module-id>/<module-id>-crud.spec.ts`.
   Each test gets its own user (see existing fixtures) and cleans its own
   data in `beforeEach`.
5. Smoke-run: `cd tests/e2e && npm run test -- tests/<module-id>/`.

### 8. Run the full gate

```bash
make ci && make test
```

Per CLAUDE.md this is mandatory before pushing. Run `make test-e2e`
separately when data paths change.

### 9. Surface schema-apply instructions to the user

The new terraform file is **not** applied automatically — the user needs to
run it against their aepbase instance with their admin token. Remind them
with the snippet from `CLAUDE.md` → "aepbase schema (Terraform) → Applying
changes". Flag any risks (e.g. "this adds a new resource, no existing data
affected" vs. "this renames a field — destructive").

## What this skill does NOT do

- **It does not apply terraform.** Schema changes hit shared data; leave that
  to the human.
- **It does not invent field names.** If the user hasn't specified a schema,
  ask rather than guess.
- **It does not touch `module-flags`.** Module flags are auto-synced from
  `module.config.ts` by `src/instrumentation.ts`; no terraform needed for
  flags themselves.

## Wrap-up checklist

Before marking the task complete, verify:

- [ ] New `.tf` file added under `aepbase/terraform/` (and reviewed against
      the CLAUDE.md rules list).
- [ ] `AepCollections` entry added in `src/core/api/aepbase.ts`.
- [ ] `src/modules/<module-id>/` directory created with `module.config.ts`,
      `types.ts`, `index.ts`, and at least one component + list hook.
- [ ] Module imported and added to `MODULES` in `src/modules/registry.ts`.
- [ ] Next.js page file(s) created under `src/app/(app)/<basePath>/`.
- [ ] Vitest tests added under `__tests__/`.
- [ ] Playwright POM + CRUD spec added under `tests/e2e/`.
- [ ] `make ci && make test` passes locally.
- [ ] User has been given the terraform-apply command and warned about any
      destructive schema changes.
