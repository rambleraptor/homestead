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

Feature modules ship in the `@rambleraptor/homestead-modules` workspace
package at `packages/homestead-modules/<feature>/`. The registry, the
`HomeModule`/`ModuleFlagDef` types, and the `settings` + `superuser`
modules stay in `frontend/src/modules/` because they are part of the core
experience.

Every feature is a self-contained module:

```
packages/homestead-modules/<feature>/
├── components/         # UI components
├── hooks/              # Custom hooks (data access lives here)
├── types.ts            # TypeScript types
├── module.config.ts    # Module metadata (imports HomeModule from @/modules/types)
└── index.ts            # Public exports
```

Consumers import via the package, e.g.
`import { GiftCardHome } from '@rambleraptor/homestead-modules/gift-cards/components/GiftCardHome'`.
The package keeps its existing reliance on `@/core/...` and `@/shared/...`
through a TypeScript path alias and Next.js `transpilePackages`.

The list of modules served by an instance lives in
`frontend/homestead.config.ts` — that is the only file an operator edits
to add or remove a module. Routes are declared inline on each
`ModuleRoute` (the `component` field) and served by the catch-all at
`frontend/src/app/(app)/[...slug]/page.tsx`; do not create per-route
`page.tsx` files. See [`docs/SELF_HOSTING.md`](docs/SELF_HOSTING.md) for
the operator-facing walkthrough.

### Style
- Meaningful variable / function names
- Prefer self-documenting code; add comments only for non-obvious "why"
- Keep functions small and focused
- No premature optimization

## Project Structure

The repo is an npm workspace. The root `package.json` declares
`workspaces: ["frontend", "packages/*"]`; install once at the root with
`npm install`.

### Frontend (`frontend/`)

- `src/core/api/aepbase.ts` — thin REST client wrapper for aepbase
- `src/core/auth/` — AuthContext, types, route guards
- `src/app/api/` — Next.js server routes (notifications, OCR, actions)
- `src/app/api/_lib/aepbase-server.ts` — server-side aepbase helper (the
  client-side wrapper uses localStorage, so server routes use this instead)
- `src/modules/` — module registry, contract types, and the in-tree
  `settings` + `superuser` modules (core experience)
- `src/shared/` — shared components + utilities

### Feature modules package (`packages/homestead-modules/`)

The user-facing feature modules (`credit-cards`, `dashboard`, `games`,
`gift-cards`, `groceries`, `hsa`, `notifications`, `people`, `recipes`,
`todos`) live here as the `@rambleraptor/homestead-modules` workspace
package. Frontend lists it as a dependency and adds it to
`next.config.ts`'s `transpilePackages`. Modules continue to import
`@/core/...` and `@/shared/...` through a TypeScript path alias defined in
`packages/homestead-modules/tsconfig.json`.

### Backend (`aepbase/`)

- `main.go` — thin wrapper that imports aepbase as a Go library and opts
  into `EnableUsers` and `EnableFileFields`
- `install.sh` — builds the binary into `bin/aepbase`
- `run.sh` — runs it on :8090
- `data/` — sqlite db + uploaded files (gitignored)
- `terraform/` — schema-as-code (see next section)

### Scripts (`aepbase/scripts/`)

- `migrate_pb_to_aep.py` — one-time PocketBase → aepbase data migration.
  Kept for historical reference; the codebase no longer depends on PB.

### Deployment (`deployment/`)

Systemd-based deployment. See `deployment/README.md`.

## aepbase schema (Terraform)

The schema lives in `aepbase/terraform/`, driven by the `aep-dev/aep`
dynamic provider.

### Applying changes

```bash
# Get an admin bearer token
TOKEN=$(curl -sS -X POST http://localhost:8090/users/:login \
    -H 'Content-Type: application/json' \
    -d '{"email":"admin@example.com","password":"<pw>"}' | jq -r .token)

cd aepbase/terraform
TF_VAR_aepbase_token=$TOKEN \
    AEP_OPENAPI=http://localhost:8090/openapi.json \
    terraform apply
```

### Rules (gotchas we've hit)

1. **Resource type in HCL is `aep_aep-resource-definition`** — yes, the
   hyphen is real; it's what the dynamic provider generates.
2. **Singular/plural must be kebab-case, not camelCase.** `gift-card`, not
   `giftCard`. Terraform's plugin framework rejects URL params with
   uppercase letters.
3. **JSON-schema `enum`, `minimum`, `maximum` are stripped on round-trip.**
   Encode allowed values in `description`:
   ```hcl
   status = { type = "string", description = "one of: pending, success, error" }
   ```
4. **Child resources need explicit `depends_on`.** Setting `parents = ["foo"]`
   alone does not create a terraform dependency.
5. **Schema field names stay snake_case** (matches the existing data from
   the PB era, e.g. `card_number`, `created_by`, `service_date`).
6. **Don't add autodate fields** (`created`, `updated`). aepbase manages
   `create_time` and `update_time` itself (note the underscore).
7. **After editing a resource definition out of band**, run
   `terraform init -upgrade` so the provider re-reads `/openapi.json`.
8. **aepbase disallows `type` changes and `parents` changes** on an
   existing resource definition. Delete + recreate the definition
   (destructive!) if you need either.
9. **File fields**: declare with `type = "binary"` +
   `"x-aepbase-file-field" = true`. aepbase writes files under
   `aepbase/data/files/...` and exposes a `:download` custom method.

### Parent / child relationships

| Child                       | Parent        | URL pattern                                                 |
|-----------------------------|---------------|-------------------------------------------------------------|
| `transaction`               | `gift-card`   | `/gift-cards/{id}/transactions/{id}`                        |
| `perk`                      | `credit-card` | `/credit-cards/{id}/perks/{id}`                             |
| `redemption`                | `perk`        | `/credit-cards/{id}/perks/{id}/redemptions/{id}`            |
| `run`                       | `action`      | `/actions/{id}/runs/{id}`                                   |
| `log`                       | `recipe`      | `/recipes/{id}/logs/{id}`                                   |
| `notification`              | `user`        | `/users/{id}/notifications/{id}`                            |
| `notification-subscription` | `user`        | `/users/{id}/notification-subscriptions/{id}`               |
| `user-preference`           | `user`        | `/users/{id}/preferences/{id}` (note the prefix strip)      |

Parent-keyed children don't carry the parent id as a stored field; it's
encoded in the URL path.

### Not yet modeled

- Per-collection access rules (row-level security beyond user parenting)
- Realtime subscriptions (polling only)
- Thumbnail generation for file fields

### Module flags — not terraform

The `module-flags` resource is an exception to the terraform rule.
Each module can declare typed flags in its `module.config.ts`
(`flags: { ... }`). At Next.js server startup,
`frontend/src/instrumentation.ts` aggregates every declared flag (via
`getAllModuleFlagDefs` in `src/modules/registry.ts`), builds a
JSON-schema payload, and POST/PATCHes it against aepbase's
`/resource-definitions` endpoint. One record of `module-flags` is the
household-wide singleton; fields are flattened as
`${moduleId_snake}__${key}` on the wire.

Set `AEPBASE_ADMIN_EMAIL` and `AEPBASE_ADMIN_PASSWORD` in the Next.js
environment to enable the sync. Without them the app still works —
the settings UI falls back to each declared default.

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
5. **Ask before touching schema** — terraform changes affect real data.
6. **Security first** — validate inputs, sanitize outputs, follow OWASP.

### Before every PR push

```bash
make ci && make test
```

Only push when all checks pass.
