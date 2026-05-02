# Claude AI Assistant Guidelines for Homestead

This document gives both Claude and human contributors the ground rules for
working on the Homestead repo. The backend is **aepbase** (an AEP-compliant
dynamic REST server). The frontend is a Next.js app that talks to aepbase
through a same-origin `/api/aep` proxy.

## Table of Contents

- [Pull Request Requirements](#pull-request-requirements)
- [Development Workflow](#development-workflow)
- [Testing Guidelines](#testing-guidelines)
- [Code Quality Standards](#code-quality-standards)
- [Project Structure](#project-structure)
- [aepbase schema (Terraform)](#aepbase-schema-terraform)
- [Data Migration from PocketBase](#data-migration-from-pocketbase)

## Pull Request Requirements

**Every PR MUST pass the following checks before being pushed:**

### 1. Build ✅

```bash
make build
# or: cd frontend && npm run build
```

### 2. Lint ✅

```bash
make lint
# or: cd frontend && npm run lint
```

### 3. Type Check ✅

```bash
make type-check
# or: cd frontend && npm run type-check
```

### 4. Tests ✅

```bash
make test                  # Vitest (frontend unit/integration tests)
make test-e2e              # Playwright end-to-end tests
```

## Development Workflow

### Full local stack

You need two processes running to develop against the real backend:

```bash
# Terminal 1 — aepbase
cd aepbase
./install.sh               # first time only
./run.sh

# Terminal 2 — Next.js frontend
cd frontend
npm run dev
```

On aepbase's first start, the superuser's email + password are printed to
stdout. Save them; you'll need them to log in to the app and for
`terraform apply`.

### Pre-push checklist

```bash
make ci && make test
```

This runs lint, type-check, build, and unit tests. Run `make test-e2e`
separately when you've changed anything data-adjacent.

### Recommended process

1. Create a feature branch
2. Make your changes; follow the existing module architecture
3. Run the full gate: `make ci && make test && make test-e2e`
4. Commit with a clear message and push

## Testing Guidelines

### Frontend unit/integration tests

Vitest + Testing Library. Tests live next to the code they cover, under
`__tests__/` directories. `src/test/setup.ts` mocks the aepbase client
globally — individual tests can override behavior via `vi.mocked(...)`.

### End-to-end (E2E) tests

Playwright against a real aepbase instance. Located in `tests/e2e/`.

```bash
make test-e2e               # headless run
make test-e2e-ui            # interactive UI mode
```

E2E best practices (CRITICAL — follow these to keep the suite reliable):

#### 1. Test isolation
Each test gets its own user (see fixtures) and cleans its own data in
`beforeEach`. Don't rely on data from other tests.

#### 2. Waiting
NEVER use `page.waitForTimeout(ms)`. Use Playwright's auto-waits, explicit
`waitFor({ state })` calls, or `expect().toBeVisible()` (which has built-in
retries).

#### 3. Selectors (priority order)
1. `data-testid` — stable, semantic
2. Role-based: `getByRole('button', { name: /add/i })`
3. Label: `getByLabel(/email/i)`
4. Text — only for verifying displayed content

Avoid CSS class selectors and positional selectors.

#### 4. Page Object Model
All e2e tests use POMs under `tests/e2e/pages/`. POMs encapsulate page
interactions; they don't contain assertions (except helper `expect…`
methods) or `console.log` statements.

#### 5. Test data setup
Seed via aepbase REST (`tests/e2e/utils/aepbase-helpers.ts`), not through
the UI. API seed is 10-100× faster.

#### 6. Adding a new module

1. Add `data-testid` attrs on key buttons/forms
2. Create a Page Object at `tests/e2e/pages/<Module>Page.ts`
3. Add aepbase helpers (`create<Module>`, `deleteAll<Modules>`)
4. Create specs at `tests/e2e/tests/<module>/<module>-crud.spec.ts`
5. Run: `cd tests/e2e && npm run test -- tests/<module>/`

## Code Quality Standards

### TypeScript
- Strict type checking (see `tsconfig.json`)
- Avoid `any`; use proper types. If you truly need `unknown`, narrow it.
- Export types that might be reused
- Use interfaces for object shapes

### React
- Functional components with hooks
- Custom hooks for reusable logic
- Follow the modular architecture pattern below

### Modular architecture

Every feature is a self-contained module:

```
src/modules/<feature>/
├── components/         # UI components
├── hooks/              # Custom hooks (data access lives here)
├── types.ts            # TypeScript types
├── routes.tsx          # Route definitions
├── module.config.ts    # Module metadata
└── index.ts            # Public exports
```

### Style
- Meaningful variable / function names
- Prefer self-documenting code; add comments only for non-obvious "why"
- Keep functions small and focused
- No premature optimization

## Project Structure

### Frontend (`frontend/`)

- `src/core/api/aepbase.ts` — thin REST client wrapper for aepbase
- `src/core/auth/` — AuthContext, types, route guards
- `src/app/api/` — Next.js server routes (notifications, OCR, actions)
- `src/app/api/_lib/aepbase-server.ts` — server-side aepbase helper (the
  client-side wrapper uses localStorage, so server routes use this instead)
- `src/modules/` — feature modules (gift-cards, credit-cards, etc.)
- `src/shared/` — shared components + utilities

### Backend (`aepbase/`)

- `main.go` — thin wrapper that imports aepbase as a Go library and opts
  into `EnableUsers` and `EnableFileFields`
- `install.sh` — builds the binary into `bin/aepbase`
- `run.sh` — runs it on :8090
- `data/` — sqlite db + uploaded files (gitignored)
- `terraform/` — legacy schema-as-code, kept as a dead reference until a
  follow-up cleanup. Schema is now declared in TypeScript — see
  `frontend/src/modules/<feature>/resources.ts` and `npm run apply-schema`.

### Scripts (`aepbase/scripts/`)

- `migrate_pb_to_aep.py` — one-time PocketBase → aepbase data migration.
  Kept for historical reference; the codebase no longer depends on PB.

### Deployment (`deployment/`)

Systemd-based deployment. See `deployment/README.md`.

## aepbase schema (TypeScript)

The schema is declared in TypeScript: each module owns a sibling
`resources.ts` (e.g. `frontend/src/modules/gift-cards/resources.ts`)
that exports an array of `AepResourceDefinition` objects. The
aggregator at `frontend/src/core/aep/registry.ts` stitches them all
together. The `module-flag` resource is built dynamically from
declared module flags (see "Module flags" below).

### Applying changes

```bash
cd frontend
AEPBASE_ADMIN_EMAIL=admin@example.com \
AEPBASE_ADMIN_PASSWORD='<pw>' \
    npm run apply-schema
```

The CLI is idempotent — repeat runs report `noop` for unchanged
resources, `created` for new ones, `updated` when a schema has
drifted. Override the target with `AEPBASE_URL=...` (default
`http://127.0.0.1:8090`); pass `AEPBASE_TOKEN=...` to skip login.

The Playwright e2e suite invokes the same CLI in its global setup
(`tests/e2e/config/apply-schema.ts`), so e2e and prod schemas can't
drift apart.

### Authoring a resource

```ts
// frontend/src/modules/<feature>/resources.ts
import type { AepResourceDefinition } from '../../core/aep/types';

const widget: AepResourceDefinition = {
  singular: 'widget',
  plural: 'widgets',
  description: 'Household widget.',
  user_settable_create: true,
  schema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      created_by: { type: 'string', description: 'users/{user_id}' },
    },
    required: ['name'],
  },
};

export const widgetResources: AepResourceDefinition[] = [widget];
```

Then add the array to `frontend/src/core/aep/registry.ts`'s
`ALL_DOMAIN_RESOURCES` list.

### Rules (gotchas we've hit)

1. **Singular/plural must be kebab-case, not camelCase.** `gift-card`,
   not `giftCard`. aepbase rejects URL params with uppercase letters.
2. **Enums use the top-level `enums` field, not JSON-schema `enum`.**
   aepbase strips JSON-schema `enum`/`minimum`/`maximum` on round-trip,
   but exposes a sibling map for string enums it enforces server-side
   (returns HTTP 400 on disallowed values):
   ```ts
   enums: {
     status: ['pending', 'success', 'error'],
   },
   schema: {
     type: 'object',
     properties: { status: { type: 'string' } },
   },
   ```
   `AepRecord<typeof res>` reads this map and narrows the matching
   field to the corresponding string-literal union automatically.
3. **Schema field names stay snake_case** (matches the existing data
   from the PB era, e.g. `card_number`, `created_by`, `service_date`).
4. **Don't add autodate fields** (`created`, `updated`). aepbase
   manages `create_time` and `update_time` itself (note the underscore).
5. **aepbase disallows `type` changes and `parents` changes** on an
   existing resource definition. The syncer only PATCHes the schema
   field; if you need to change `parents`, delete + recreate the
   definition (destructive!).
6. **File fields**: declare with `type: 'binary'` +
   `'x-aepbase-file-field': true`. aepbase writes files under
   `aepbase/data/files/...` and exposes a `:download` custom method.
7. **Parents must exist before children.** The CLI topologically
   sorts definitions by `parents` before applying, so author order in
   `resources.ts` doesn't matter.
8. **The CLI never deletes.** Removing a resource from TS leaves the
   live aepbase resource in place — same posture as `terraform apply`
   never destroys without explicit instruction. Drop them via curl
   `DELETE /aep-resource-definitions/<singular>` if needed.

### Parent / child relationships

| Child                       | Parent            | URL pattern                                                 |
|-----------------------------|-------------------|-------------------------------------------------------------|
| `transaction`               | `gift-card`       | `/gift-cards/{id}/transactions/{id}`                        |
| `perk`                      | `credit-card`     | `/credit-cards/{id}/perks/{id}`                             |
| `redemption`                | `perk`            | `/credit-cards/{id}/perks/{id}/redemptions/{id}`            |
| `log`                       | `recipe`          | `/recipes/{id}/logs/{id}`                                   |
| `hole`                      | `game`            | `/games/{id}/holes/{id}`                                    |
| `pictionary-team`           | `pictionary-game` | `/pictionary-games/{id}/pictionary-teams/{id}`              |
| `notification`              | `user`            | `/users/{id}/notifications/{id}`                            |
| `notification-subscription` | `user`            | `/users/{id}/notification-subscriptions/{id}`               |
| `user-preference`           | `user`            | `/users/{id}/preferences/{id}` (note the prefix strip)      |

Parent-keyed children don't carry the parent id as a stored field; it's
encoded in the URL path.

### Not yet modeled

- Per-collection access rules (row-level security beyond user parenting)
- Realtime subscriptions (polling only)
- Thumbnail generation for file fields

### Module flags

Each module can declare typed flags in its `module.config.ts`
(`flags: { ... }`). The `module-flag` resource is built dynamically
from those declarations — `getAllModuleFlagDefs` in
`src/modules/registry.ts` walks the registry, and
`buildModuleFlagsResourceDefinition` in `modules/settings/flags.ts`
turns the result into an `AepResourceDefinition` that goes through
the same syncer as every other resource.

`npm run apply-schema` includes it. `frontend/src/instrumentation.ts`
also re-syncs it at every Next.js server boot (when
`AEPBASE_ADMIN_EMAIL` / `AEPBASE_ADMIN_PASSWORD` are set in the
environment) so freshly declared flags are picked up without a manual
schema apply.

The `module-flags` resource is the household-wide singleton; fields
are flattened on the wire as `${moduleId_snake}__${key}`.

Consumers: `useModuleFlag(moduleId, key)` from `@/modules/settings`
is the one public hook for reading/writing a single flag from any
component.

## Data Migration from PocketBase

`aepbase/scripts/migrate_pb_to_aep.py` copies a PocketBase `pb_data/`
directory's contents into a running aepbase instance, including file
uploads. It's a one-shot tool preserved for reference — the frontend and
backend no longer depend on PocketBase.

```bash
python3 aepbase/scripts/migrate_pb_to_aep.py \
    --pb-data ~/tmp/pocketbase/pb_data \
    --aep-url http://localhost:8090 \
    --email admin@example.com \
    --password <aepbase superuser password> \
    --wipe
```

See the script header for all flags (`--dry-run`, `--collection`, etc.).

---

## For Claude AI Assistants

1. **Always run the full gate** (`make ci && make test`) before marking
   work complete.
2. **Follow the modular architecture** — don't create monolithic
   components. Module hooks own their data access.
3. **Respect existing patterns** — review similar code before implementing.
4. **Use the aepbase wrapper** (`@/core/api/aepbase`) for client-side data
   access, and `@/app/api/_lib/aepbase-server` for server routes.
5. **Ask before touching schema** — `npm run apply-schema` affects real data.
6. **Security first** — validate inputs, sanitize outputs, follow OWASP.

### Before every PR push

```bash
make ci && make test
```

Only push when all checks pass.
