# Claude AI Assistant Guidelines for Homestead

This document gives both Claude and human contributors the ground rules for
working on the Homestead repo. The backend is **homestead-server**
(`packages/homestead-server`) — one process (Bun, or Node ≥ 22.13 via tsx;
the runtime seams are `src/listen.ts`, `src/engine/sqlite.ts`, and
`src/engine/password.ts`) containing the **engine** (a
TypeScript rewrite of aepbase: an AEP-compliant dynamic REST server over
SQLite, with users/auth, OAuth, file fields, and app-access gating baked in)
plus the API routes the SPA can't serve itself (test notifications, the
the AI-backed chat, the AEP-136 custom-method gateway) and the boot-time
schema sync. The frontend is a **Vite + React SPA** (`react-router-dom`) that
talks to the engine through same-origin `/api/aep` routes; in dev, Vite runs
in middleware mode *inside* the server process (single port, HMR included).
In production the `homestead` launcher (`packages/homestead-cli`, compiled
with Bun into a thin binary) runs the server as a runtime child (bun, or
node + tsx when bun isn't installed) resolved from
the project's node_modules, serving a SPA the launcher builds on the box with
`vite build --watch` (rebuilt in place whenever `homestead.config.ts`, the
`apps/` tree, or an imported app package changes — open tabs poll
`/api/app-version` and reload). Nothing is embedded in the binary: app code and config live in the
operator's project. The server listens on a single port (SPA + /api/*); the
engine is reachable only under the `/api/aep` prefix — there is no separate
engine port. Same-box callers (server-side helpers, the boot-time schema sync,
e2e, and `homestead resources`) reach it over loopback at that same
`/api/aep` prefix.

## Table of Contents

- [Pull Request Requirements](#pull-request-requirements)
- [Development Workflow](#development-workflow)
- [Testing Guidelines](#testing-guidelines)
- [Code Quality Standards](#code-quality-standards)
- [Project Structure](#project-structure)
- [aepbase schema (TypeScript)](#aepbase-schema-typescript)

## Pull Request Requirements

**Every PR MUST pass the following checks before being pushed:**

### 1. Build ✅

```bash
make build
# or: cd packages/homestead-app && npm run build
```

### 2. Lint ✅

```bash
make lint
# or: cd packages/homestead-app && npm run lint
```

### 3. Type Check ✅

```bash
make type-check
# or: cd packages/homestead-app && npm run type-check
```

### 4. Tests ✅

```bash
make test                  # Vitest (frontend) + Bun (CLI/server unit tests)
make test-node             # CLI/server unit tests under Node (vitest)
make test-e2e              # Playwright end-to-end tests
```

The CLI/server test files import from `vitest`, which `bun test` aliases to
`bun:test` — the same suite runs under both runtimes. Don't use Bun-only
APIs (`Bun.*`, `bun:sqlite`, `import.meta.dir`) in server/CLI code or tests;
go through the runtime seams above or use `node:*` equivalents.

## Development Workflow

### Full local stack

Everything runs in one process — Bun or Node both work. From source, no
compile step is needed:

```bash
bun packages/homestead-cli/src/cli.ts start --dev
# or run the server directly:
bun packages/homestead-server/src/index.ts --dev

# the same, under Node (>= 22.13, for node:sqlite):
npx tsx packages/homestead-cli/src/cli.ts start --dev
npx tsx packages/homestead-server/src/index.ts --dev
```

To build and run the production launcher binary instead:

```bash
make homestead             # → bin/homestead (thin launcher; SPA builds at boot)
./bin/homestead start
```

A fresh instance boots **unclaimed**: the first visit to the SPA asks you to
create the admin account (`POST /api/setup`, one-shot). Recover a lost
password with `homestead admin reset-password`. The schema sync runs
in-process on boot — no admin env vars needed.

In dev mode Vite runs in middleware mode inside the server (see
`packages/homestead-server/src/dev-vite.ts`), so the SPA, HMR, and all
`/api/*` routes share one port. There is no separate Vite proxy config.

### Pre-push checklist

```bash
make ci && make test
```

This runs lint, type-check, build, and unit tests. Run `make test-e2e`
separately when you've changed anything data-adjacent.

### Recommended process

1. Create a feature branch
2. Make your changes; follow the existing app architecture
3. Run the full gate: `make ci && make test && make test-e2e`
4. Commit with a clear message and push

## Testing Guidelines

### Frontend unit/integration tests

Vitest + Testing Library in happy-dom (with the VM tier's browser-behavior
patches from `homestead-test-harness/vm/happy-dom-fixes.ts`). Tests live next
to the code they cover, under `__tests__/` directories. `src/test/setup.ts` mocks the aepbase client
globally — individual tests can override behavior via `vi.mocked(...)`.

### VM tests (in-process, no browser) — the default for UI flows

`make test-vm` runs `*.vm.ts` specs (an app's `vm/` dir; core flows under
`tests/vm/`) on the **VM tier** (`packages/homestead-test-harness`): the real
SPA mounted in happy-dom, served by the real server's fetch handler
(`createApp()` in `homestead-server/src/app.ts`) in the same Vitest worker —
no browser, no sockets. It runs the suite's ~200 UI specs in under a minute,
so new specs for user-facing flows go here.

- `bootHomestead()` gives each test a fresh copy of a template database
  (schema synced, admin claimed, a member, and a second member "Sam"), so
  specs need no cleanup. `h.loginAs(h.member | h.admin)` installs a session
  pre-minted into the template (`{ via: 'form' }` drives the login form);
  `h.householdMember` writes as someone else. `close()` in `afterEach`.
- Page objects are written against the shared `Driver`
  (`homestead-test-harness/driver/Driver.ts`), a Playwright-shaped subset with
  the same semantics (strict actions, retrying assertions); its Playwright
  implementation (`playwrightDriver(page)`) lets one page object serve both
  tiers. `driver.goto`/`reload` remount the app like a page load.
- Seed through the e2e helpers (`e2eClient` and the per-app `helpers.ts`) —
  `HOMESTEAD_E2E_APP_URL` points them at the VM. The e2e AI stub is served
  in-process (with a 300ms rather than 2.5s pause), and `/api/events` streams
  live, so change-feed specs work.
- Chat specs drive the real assistant against **scripted turns**: a message
  carrying a marker from `tests/e2e/config/ai-scripts.ts` gets that script's
  tool calls (run for real against the server) and then its reply, as a JSON
  reply or a word-by-word stream. Add a script there and name it by its
  `CHAT_MARKERS` constant; `tests/e2e/pages/ChatPage.ts` is the page object.
- For speed the tier runs React's production build (`HOMESTEAD_VM_REACT_DEV=1`
  restores the development build and its warnings), shares one module graph
  across spec files per worker (`isolate: false`), and caches the template
  database under `node_modules/.cache/homestead-vm`, keyed on the server,
  core and app sources (`HOMESTEAD_VM_NO_TEMPLATE_CACHE=1` disables it).
- There is no layout engine: visibility is computed-style only. Anything that
  needs a real browser stays in Playwright (below).

### End-to-end (E2E) tests — only what needs a real browser

Playwright against a real server, in `tests/e2e/` (specs: `tests/e2e/tests/`
and an app's `e2e/`). Keep it to flows the VM can't run: real offline
(`context.setOffline`), request interception (`page.route`), canvas / media /
`createImageBitmap`, pointer geometry and layout, service workers, push,
downloads. Today that's `offline-banner`, `groceries-offline` and
`documents/redaction`.

```bash
make test-e2e               # headless run
make test-e2e-ui            # interactive UI mode
```

Both tiers follow the same rules:

#### 1. Test isolation
VM tests get a fresh database per test. Playwright tests share one server, so
each gets its own user (see fixtures) and cleans its own data in
`beforeEach`. Don't rely on data from other tests.

#### 2. Waiting
NEVER sleep (`page.waitForTimeout(ms)`, `setTimeout` in a spec). Use the
auto-waits, explicit `waitFor({ state })` calls, or `expect().toBeVisible()`
(which retries).

#### 3. Selectors (priority order)
1. `data-testid` — stable, semantic
2. Role-based: `getByRole('button', { name: /add/i })`
3. Label: `getByLabel(/email/i)`
4. Text — only for verifying displayed content

Avoid CSS class selectors and positional selectors.

#### 4. Page Object Model
Specs use page objects (`tests/e2e/pages/` for core pages, an app's
`e2e/<App>Page.ts` otherwise), written against the `Driver`. They encapsulate
page interactions; they don't contain assertions (except helper `expect…`
methods) or `console.log` statements, and an `expect…NotIn…` helper must
actually fail when the thing is there.

#### 5. Test data setup
Seed via the shared client (`e2eClient` in
`tests/e2e/utils/aepbase-helpers.ts`), not through the UI. Client seed is
10-100× faster.

#### 6. Adding a new app

1. Add `data-testid` attrs on key buttons/forms
2. Create a Page Object at `packages/homestead-apps/<app>/e2e/<App>Page.ts`
   on the `Driver`
3. Add seed helpers (`create<App>`) in `<app>/e2e/helpers.ts`
4. Create specs at `packages/homestead-apps/<app>/vm/<app>-crud.vm.ts`
5. Run: `cd packages/homestead-test-harness && npx vitest run packages/homestead-apps/<app>/vm`

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

Feature apps ship in the `@rambleraptor/homestead-apps` workspace
package at `packages/homestead-apps/<feature>/`. The registry, the
`AppConfig`/`AppFlagDef` types, and the always-installed core apps
(`dashboard`, `settings`, `superuser`, `users`, `chat`, `notifications`) live
in the `@rambleraptor/homestead-core` package (`packages/homestead-core/`)
because they are part of the core experience. `packages/homestead-app/src/apps/registry.ts` is
just a boot shim that installs the registry singleton with the operator's
apps from `homestead.config.ts` plus those core apps.

Every feature is a self-contained app:

```
packages/homestead-apps/<feature>/
├── components/         # UI components
├── hooks/              # Custom hooks (data access lives here)
├── types.ts            # TypeScript types
├── app.config.ts    # App metadata (imports AppConfig from @rambleraptor/homestead-core/apps/types)
└── index.ts            # Public exports
```

Consumers import via the package, e.g.
`import { GiftCardHome } from '@rambleraptor/homestead-apps/gift-cards/components/GiftCardHome'`.
The package resolves `@rambleraptor/homestead-core/...` through the npm
workspace and a TypeScript path alias defined in
`packages/homestead-apps/tsconfig.json`; Vite resolves the workspace
packages natively (no Next.js `transpilePackages`).

The list of apps served by an instance comes from two places, merged at
boot: the explicit `apps` array in `homestead.config.ts` (at the repo
root), plus any auto-discovered `<name>/app.homestead.ts` files in the
project's app directories (each default-exports its `AppConfig`; an
explicit config entry wins on an id collision). That's `<project>/apps`
by default; the optional `HOMESTEAD_APPS_DIRS` env var replaces it with
a delimiter-separated list of directories (relative entries resolve
against the project root, first directory wins an id collision). The SPA
discovers them at build time (the `virtual:homestead-discovered-apps`
module generated by `packages/homestead-app/vite/discovered-apps.ts`)
and the server at boot
(`@rambleraptor/homestead-core/server/app-discovery`, which also owns
the env parsing and the fs scan both sides use); the shared
validation/merge helpers live in
`@rambleraptor/homestead-core/apps/discovery`. Routes are declared inline on each
`AppRoute` (the `component` field). The SPA's react-router setup
(`packages/homestead-app/src/App.tsx`) sends every unmatched path to the catch-all
renderer in `packages/homestead-app/src/apps/AppRoute.tsx`, which resolves the
route's lazy component — there are no per-route page files. See
[`packages/homestead-site/docs/guides/quick-start.md`](packages/homestead-site/docs/guides/quick-start.md)
for the operator-facing walkthrough.

### Style
- Meaningful variable / function names
- Prefer self-documenting code; add comments only for non-obvious "why"
- Keep functions small and focused
- No premature optimization

### Errors in the SPA go to toasts, not the console

A failure the user caused (a save, a delete, a button) must be *shown* to
them. Nobody reads the browser console, least of all on a phone.

- Every `useMutation` failure already raises a toast through the global
  `MutationCache` handler in `packages/homestead-core/api/queryClient.ts`.
  A component that awaits `mutateAsync` catches only to keep control flow
  (stay on the form, keep the dialog open) and leaves the body as a comment
  — don't add `logger.error`, and don't add a second toast.
- A mutation that wants to phrase its own message opts out with
  `meta: { skipErrorToast: true }` and the caller shows it with
  `useToast().error(err)` — pass the raw error, it is reduced to the
  server's message via `getAepErrorMessage`.
- Work that isn't a mutation (a direct `fetch`, a browser API) reports the
  same way: `toast.error(err)` in the catch.
- Reads (`useQuery`) render an inline error near the data they failed to
  load; never swallow a failed fetch into an empty list, which reads as
  "nothing here".
- Client-side validation must show its message next to the control. A
  custom form built on `useSchemaForm` has to render `form.errors.<field>`
  for every field it manages and `form.formError` for the rest; a required
  field the form deliberately leaves blank needs `required: false` in its
  `fields` config, or the submit is silently blocked.
- `logger` is for server-side code (routes, crons, methods, migrations).

## Project Structure

The repo is an npm workspace. The root `package.json` declares
`workspaces: ["packages/*", "tests/e2e"]`; install once at the
root with `npm install`.

### Frontend SPA (`packages/homestead-app/`)

The Vite + React SPA is a thin shell — most app code lives in the
`homestead-core` and `homestead-apps` packages.

- `src/main.tsx` — SPA entry; mounts `<App>` under `BrowserRouter` and
  installs the app registry singleton (`src/apps/registry.ts`)
- `src/App.tsx` — react-router routes; authenticated pages render inside
  the `AppShell`, with a catch-all that dispatches to `AppRoute`
- `src/apps/AppRoute.tsx` — catch-all renderer that resolves a
  path to its app's lazy component
- `vite.config.ts` — dev server + `/api/*` proxy config

### Core package (`packages/homestead-core/`)

The `@rambleraptor/homestead-core` workspace package. Holds everything the
SPA and apps share:

- `api/aepbase.ts` — thin REST client wrapper for the engine (client-side)
- `server/client.ts` — `serverClient(token)`, the server-side construction of
  the shared `@rambleraptor/homestead-client` (bound to the engine over loopback
  at the `/api/aep` prefix with a bearer-token strategy). Server code — routes,
  crons, migrations, app workers — does its CRUD through this.
- `server/aepbase.ts` — the request-authentication seam: resolves a forwarded
  bearer token to its user (`authenticate`) via the engine's `/users/me`, plus
  the engine base URL (`AEPBASE_URL`) the client is pointed at
- `auth/` — AuthContext, types, route guards
- `apps/` — registry, the `AppConfig`/`AppFlagDef` contract types
- `dashboard/`, `settings/`, `superuser/`, `users/`, `chat/`,
  `notifications/` — the always-installed core apps (`chat` is the AI
  assistant; its server half lives in `server/chat/`, where `turns.ts` runs a
  stored, streamed turn of a `conversation` — history in `chat-message` rows,
  one turn at a time, cancel via `conversations/{id}:cancel`; files a person
  attaches ride on their message (`attachments`, checked in
  `server/chat/attachments.ts`) and can be filed into a top-level file field
  by attachment id, only from the same conversation (`attachmentSource`);
  stored history is untrusted, so only parts
  the runner writes reach the model. The system prompt carries the person's
  local clock (the SPA sends its timezone with each turn), the rest of the
  household by name (`household/`: superusers plus Admin/Member role holders,
  from the engine through the `server/household.ts` seam; also served to
  members at `GET /api/household`), the
  `chat.instructions` of apps whose tools they're offered, and what those apps
  know about the speaker from `chat.context` (server-side, per turn, bounded:
  People's says who they are and who their family is, through `person.user`,
  the person's account link) — all in `server/chat/context.ts`. App-specific
  guidance belongs there, not in core's prompt. Replies are Markdown; an app's `chat.values` teaches the model
  a typed value (`[12 Oak St](homestead:address)`) that the SPA renders with
  the app's component (`chat/values.ts`, `chat/components/ChatValue.tsx`), the
  link built from the value's text, never from the reply. Its SPA half is
  the AI SDK's `useChat` over a stored-turn transport (`chat/api.ts`,
  `chat/hooks/useConversation.ts`), rendered with AI Elements. `notifications` owns the
  web-push inbox + subscription management; its server half lives in
  `server/notifications.ts`. Household members message each other through
  `POST users/{id}/notifications:send` (the one API every caller uses — SPA,
  scripts, CLI, MCP — wrapping `server/messages.ts`'s `sendMessage`, which
  writes the recipient's inbox with a system token from
  `server/system-token.ts`; rate-limited, household-only). A custom method
  marked `confirm: true` (`send` is) makes the chat tool `needsApproval` for
  that action: the turn stops with the tool part in `approval-requested`, the
  SPA shows `chat/components/ApprovalCard`, and `POST /api/chat` with
  `{ conversation_id, approval: { id, approved } }` resumes the same reply —
  the approved call runs, a denied one is reported to the model; a new message
  instead denies anything still waiting)
  `dashboard` is the home, and the assistant's (`dashboard/components/agentic/`):
  a strip of widget chips built from each widget's optional `summary` hook (tap
  one to open the widget), over a conversation rendered with the shared
  `chat/components/ChatThread`, held in the address (`/dashboard/c/:id`) with
  past ones in a drawer (`chat/components/ConversationList`). It fills the main
  area via `layout/pageFill`. When the AI isn't configured or the viewer can't
  use Chat, a note takes the conversation's place and the chips stay — that rule
  is `dashboard/home.ts` (`useAssistantAvailability`). The
  `dashboard.classic_home` flag gives its audience the classic dashboard
  instead (`dashboard/components/ClassicHome`: welcome panel, an Ask box that
  starts a conversation at `/dashboard/c/:id`, and the widget stack);
  `useHomeMode` in the same file decides, and a conversation's address opens
  the conversation on either home. `chat` has no screen of
  its own: its app gates access to the assistant, and its `/chat` routes only
  redirect old links to the home.
- `layout/`, `shared/`, `resources/`, `app-flags/`, `user-settings/` —
  shared chrome, components, and schema/sync plumbing. `shared/components/ui/`
  holds vendored shadcn primitives and `shared/components/ai-elements/` the
  vendored AI Elements chat components (Apache-2.0; its README lists what was
  changed from upstream — diff against it rather than overwriting)

### Feature apps package (`packages/homestead-apps/`)

The user-facing feature apps (`credit-cards`, `events`, `games`,
`gift-cards`, `groceries`, `hsa`, `people`, `recipes`, `todos`) live here as
the `@rambleraptor/homestead-apps` workspace package. (`dashboard` and
`notifications` are always-installed core apps and live in `homestead-core`.) Apps import `@rambleraptor/homestead-core/...`
through the workspace + a TypeScript path alias defined in
`packages/homestead-apps/tsconfig.json`.

### Server (`packages/homestead-server/`)

The whole backend in one Bun process:

- `src/engine/` — the AEP engine (TypeScript port of aepbase): dynamic
  resources over SQLite (`db.ts`, `registry.ts`, `router.ts`, `crud.ts`,
  `store.ts`), `/aep-resource-definitions` (`meta.ts`), users + bearer auth
  (`users.ts`), OAuth (`oauth.ts`), file fields (`files.ts`), app-access
  gating (`access.ts`), a minimal list-filter parser (`filter.ts`), and the
  OpenAPI generator (`openapi.ts`). Features are baked in — there is no
  middleware/plugin layer.
- `src/routes/` — the API routes the SPA can't serve itself:
  `POST /api/notifications/send-test`, `POST /api/chat` (the AI chat;
  requires an `ai` block in `homestead.config.ts`), `GET /api/household` (who
  shares the Homestead, by name — members only), `GET /api/custom-methods`,
  `GET /api/events` (the SSE change feed),
  and the
  `/api/aep` gateway (`aep-gateway.ts`) that dispatches AEP-136 custom
  methods and passes everything else to the engine in-process.
- `src/server.ts` — `startServer()`: a single listener (SPA + /api/*, with the
  engine exposed only under the `/api/aep` gateway), superuser bootstrap
  (`src/bootstrap.ts` — a fresh
  instance boots unclaimed with a pending superuser; `/api/setup` +
  the SPA's first-visit form claim it; exports `createSuperuser` /
  `claimSetup` / `needsSetup` / `resetSuperuserPassword` /
  `mintAdminToken`), and the boot-time schema sync (`src/schema-sync.ts`,
  which mints a short-lived admin token in its own db — no admin env vars).
- `src/dev-vite.ts` — dev mode: Vite middleware + HMR inside the same
  process, one port.
- `src/app-registry.js` — JS indirection that initializes the app registry
  from the repo-root `homestead.config.ts` (incl. `auth.oauth` and the
  app-access map) without dragging the React app graph into `tsc`.
- `test/` — `bun test` suite, including an OpenAPI wire-contract check against
  the frozen baseline `test/fixtures/openapi-baseline.json` plus a round-trip
  through `@aep_dev/aep-lib-ts` (the fidelity bar for `homestead resources`).
  The baseline was captured from the Go server this engine replaced; that
  server is gone, so it's a golden reference for the AEP contract, not a
  parity target. Some tests and comments still cite Go behavior to explain
  *why* an odd rule exists (bcrypt `$2a$` rows, `200 {}` on user delete) —
  those are historical rationale, not a live constraint.

### Launcher (`packages/homestead-cli/`)

A Bun TypeScript CLI, compiled by `make homestead` into a thin
`bin/homestead` binary. The binary cannot import the operator's config
in-process (compiled Bun executables have no node_modules resolution at
runtime), so everything project-shaped runs as a `bun` child inside the
project dir:

- `homestead start` (prod): runs the project's vite in watch mode
  (`vite build --watch`, `src/spa-build.ts`) over the SPA's real module graph
  — `homestead.config.ts`, the auto-discovered `apps/` tree, and the app
  packages they import — rebuilding `~/.homestead/cache/spa-builds/<project>`
  in place on any change, then spawns
  `bun .../homestead-server/src/index.ts --spa-dist <dir>`. The server derives
  the build id from the served `index.html` (whose asset names are
  content-hashed) and exposes it at `/api/app-version`, so a rebuild bumps the
  version with no restart and open tabs reload. A small watcher additionally
  restarts the server child when `homestead.config.ts` or the `apps/` tree
  change, so OAuth/app-access/schema re-apply (idempotent schema sync reruns
  on boot). There is no git or input-hash coupling — Vite's module graph is the
  source of truth for what changed.
- `homestead start --dev`: `bun --watch` child with Vite middleware (HMR).
- `homestead admin reset-password` runs as a bun child of the project's
  homestead-server (`src/tools/`), so the binary bundles zero engine code and
  can never write to a db with stale logic.
- `homestead login` authenticates against a (possibly remote) server via
  `POST /users/:login` and saves a bearer token per named profile under
  `~/.homestead/credentials.json` (dir 0700 / file 0600). `homestead
  resources` then authenticates with the default profile (override with
  `--profile=<label>`, or `--server-url` / `--token` / `--email`+`--password`)
  — it no longer mints a local admin token, so it uses exactly the access the
  logged-in account has and can target remote servers. `logout` revokes +
  removes a profile; `profiles [use <label>]` lists them or repoints the
  default.

Other commands: `init`, `doctor`, `install-service` (sudo; installs the
systemd service), `resources`, `login`, `logout`, `profiles`,
`admin reset-password`, `backup`, `restore`, `backup-key`.

`backup` archives the data dir and `restore` puts one back (or checks it with
`--verify`). Both delegate their database work to runtime children of the
project's homestead-server (`src/tools/snapshot.ts`, `src/tools/verify-db.ts`)
for the same reason `admin reset-password` does — the launcher bundles no
engine code, so the SQLite driver always matches the version that owns the db.
Databases are captured with `VACUUM INTO` rather than copied, since a live WAL
database cannot be safely tarred; every archive carries a
`homestead-backup.json` manifest (checksums plus a master-key fingerprint) that
restore verifies before touching anything.

`backup-key generate` mints the X25519 keypair that encrypts archives outright
(`src/archive-crypto.ts`, `src/backup-key.ts`). It is asymmetric on purpose: only
the public recipient is written to disk (`~/.homestead/backup-recipient.pub`), so
the box can write archives it cannot read, and an unattended backup needs no
secret locally. A configured recipient turns archive encryption on by itself,
the way a master key turns encryption at rest on. The format is a plaintext
header (date, release, recipient — readable without keys) over a body of
authenticated 64 KiB AES-256-GCM chunks, streamed straight through `tar` in both
directions so plaintext never lands on disk. See
[`packages/homestead-site/docs/guides/backups.md`](packages/homestead-site/docs/guides/backups.md).

### Deployment

Systemd-based deployment is driven entirely by the launcher:
`sudo homestead install-service` generates + enables the `homestead.service`
unit that runs `homestead start`. No separate scripts required. A running
instance applies `homestead.config.ts` and `apps/` edits on its own (Vite
rebuilds the SPA; the server reapplies config), so there is no separate update
step — point the project dir at a git checkout and `git pull` when you want to
ship new code.

## aepbase schema (TypeScript)

Each feature app owns the schema for the aepbase collections it
manages. Definitions live alongside the app in a `resources.ts` file
and are wired into the app's config via `resources: [...]` on the
exported `AppConfig`. Resource definitions that don't belong to a
feature app (`user-preference`, `action`, `run`) live in
`packages/homestead-core/resources/builtins.ts`.

Apps declare fields in the authoring-friendly `FieldDef` shape
(`packages/homestead-core/resources/types.ts`) — a `fields` map with
per-field `required` booleans, `enum` for allowed string values,
`type: 'file'` for uploads, and optional `singular_name`/`plural_name`
display names — never raw JSON schema:

```ts
fields: {
  merchant: { type: 'string', required: true },
  status: { type: 'string', enum: ['pending', 'done'] },
  front_image: { type: 'file', description: 'jpeg/png, <=5MB' },
}
```

At server boot, `packages/homestead-server/src/schema-sync.ts`
aggregates every declared definition through `getAllResourceDefs()` plus
`BUILTIN_RESOURCE_DEFS`, validates names, topologically sorts by
`parents`, translates each `fields` map to aepbase's JSON-schema wire
format (`@rambleraptor/homestead-core/resources/translate.ts`), and
applies the result via the engine's `/aep-resource-definitions`
endpoint, using a short-lived admin token minted directly in the db (no
env vars). The runner (`@rambleraptor/homestead-core/resources/sync.ts`)
is idempotent: it creates missing definitions, patches drifted ones, and
no-ops when everything is in sync.

The e2e suite boots the same server, so e2e and runtime schema stay in
sync by construction.

Two server-only options shape how a resource is handled rather than stored
(neither reaches the engine):

- `retention: { days, field?, where? }` — a daily core cron
  (`resource-retention`, on the Operations app) deletes rows older than the
  window, with their children, through the normal API
  (`core/resources/retention.ts`). `where` limits eligible rows (operations
  use `done == true`). Top-level and user-parented resources only (the sweep
  walks every user for the latter — scheduled notifications use it).
- `modelTools: { chat?, mcp? }` — set either to `false` to leave the resource
  (and its children) out of that surface's model tools
  (`core/resources/model-tools.ts`). Not a permission. Separately, both
  surfaces narrow their tools per caller to what they can reach
  (`Engine.collectionAccess`, handed to core via
  `core/server/collection-access.ts`): unreadable collections are dropped,
  unwritable ones offered read-only. A courtesy to the model; the engine still
  decides each call.

List filters accept `create_time` and `update_time` (UTC RFC 3339, compared as
text) alongside a resource's own fields and `id`.

### Adding a new resource

1. Add a new entry in the relevant app's `resources.ts` (or in
   `packages/homestead-core/resources/builtins.ts` if it's
   platform-level).
2. Restart the server; the new definition is created on boot.
3. If the change is to an existing definition, the runner emits a
   PATCH automatically.

### Data migrations

The schema sync reconciles a collection's **shape**; it never touches the
**data** in existing rows. When a schema change needs existing records
rewritten — backfilling a new field, renaming an enum value, splitting a
field — declare a one-shot data migration. An app declares
`migrations: Migration[]` on its `AppConfig` (mirroring `crons`), each with a
stable globally-unique `id` and a lazily-imported handler kept under the app's
`migrations/` directory. At boot, after the schema sync, the runner
(`packages/homestead-server/src/migrations.ts`) applies each pending migration
once and records the outcome in the `_homestead_migrations` ledger table, so a
succeeded migration is skipped forever after (a failed or interrupted one is
retried next boot). Handlers get a short-lived admin token and rewrite data
through the shared client (`serverClient(token)` from
`@rambleraptor/homestead-core/server/client`) — write them
idempotent, and never rename a shipped migration `id` (it's the ledger key).
See [`packages/homestead-site/docs/guides/migrations.md`](packages/homestead-site/docs/guides/migrations.md).

**Retiring a field is guarded.** Removing a field from a definition drops its
column, and the engine **refuses to drop a column that still holds data** unless
a migration authorizes it — an accidental deletion or an unmigrated rename can't
silently destroy data at boot. Retire a field in two releases: first mark it
`deprecated: true` (keeps the column + data, but the chat tools stop writing it)
and ship a migration that moves its data; then, later, remove the field and add
a migration declaring `drops: [{ resource, field }]` to authorize the drop
(implies `destructive`). An empty column drops without authorization.

### Rules (aepbase constraints, not TS-specific)

1. **Singular/plural must be kebab-case.** `gift-card`, not `giftCard`.
   aepbase rejects URL params with uppercase letters. The sync runner
   validates this (and field names) at boot and fails fast.
2. **Allowed string values go in `enum: [...]`.** aepbase strips
   JSON-schema `enum` on round-trip, so the translator encodes the
   values into the wire `description` (`one of: pending, done`); the
   chat tool builder passes them to the model as a real enum. There is no
   `minimum`/`maximum` support.
3. **Field names stay snake_case** (e.g. `card_number`,
   `created_by`, `service_date`).
4. **Don't add autodate fields** (`created`, `updated`). aepbase
   manages `create_time` and `update_time` itself (note the underscore).
5. **aepbase disallows `type` changes and `parents` changes** on an
   existing resource definition. Delete + recreate the definition
   (destructive!) if you need either.
6. **File fields**: declare with `type: 'file'`. The translator emits
   aepbase's `binary` + `x-aepbase-file-field` wire encoding (never
   write those yourself). The engine writes files under
   `data/files/...` and exposes a `:download` custom method. A file may also
   sit in a list or inside an object (not inside `variants`); those are stored
   by id, read as descriptors (`{ id, url, name, media_type, size, encrypted }`),
   written with `$upload` / `$file` placeholders (the clients' `encodeBody`
   does this for you), and downloaded with `{ file: id }` — see
   [`docs/design/nested-files.md`](packages/homestead-site/docs/design/nested-files.md).
7. **`singular` is globally unique.** The registry throws on
   duplicate declarations across apps.
8. **`encrypted: true`** stores a top-level string/object/array field as
   ciphertext with the master key (`x-aepbase-encrypted`;
   `homestead-server/src/engine/encrypted-fields.ts`). Reads are unchanged; it
   can't be filtered or sorted; a write that sets it on an instance with no
   master key is a 400. Plaintext already in the column is encrypted when the
   definition is applied and at boot, then the database is vacuumed so it's gone
   from the file. It's one way: dropping `encrypted` from a field is refused
   (remove the field instead). Without a key, the boot schema sync logs which
   encrypted fields can't be saved, and `homestead doctor` lists them
   (`engine/key-check.ts`, `tools/encrypted-fields.ts`). The VM and e2e servers
   run with a fixed test key. Ask before marking an existing field — it's a
   schema change. Encrypted today: gift-card `card_number`/`pin`, household
   (and legacy address) `wifi_password`.
9. **`secret: true`** (or `{ hint: n }`) is `encrypted` plus write-only
   (`x-aepbase-secret`; `homestead-server/src/engine/secret-fields.ts`): every
   read gets `{ $secret, set, set_time?, hint? }`, never the value; a write takes
   a value, `null` to clear, or the descriptor / nothing to keep it. Server code
   uses the value through `readSecret` (`homestead-core/server/secrets.ts`) —
   no route returns it, and it must never reach a response, a log, or a model.
   Secret fields are left out of the chat and MCP tools, and a field can't stop
   being secret while it holds values. The household's API keys and tokens live
   in the `credential` resource (Superuser → Credentials,
   `homestead-core/superuser/credentials/`): `access: { model: 'superusers' }`
   (no household role covers it), superuser-only writes, out of the model tools;
   its writes bypass the persisted offline queue so a typed value never lands in
   browser storage. Server code reads one with `readCredential(id)`
   (`homestead-core/server/credentials.ts`). A key Homestead needs is a
   **credential slot**: declare it with `credentials: [{ id, label, env?,
   usedBy?, help? }]` on the `AppConfig` (`apps/credential-slots.ts`) and read
   it with `resolveCredential(slot)` — the env var wins, else the credential
   stored under the slot's id. Superuser → Credentials lists every slot under
   "Homestead needs" (`GET /api/credential-slots`,
   `server/credential-slots.ts`). Core's are the AI and embedding keys
   (`AI_KEY_SLOT`, `EMBEDDING_KEY_SLOT` in `server/ai/config.ts`): an `ai`
   block's own `auth.apiKey` wins, then `AI_API_KEY`, then the stored key, read
   on every use, so setting one needs no restart. Outside MCP servers the assistant
   may use are `mcp-server` records (Superuser → MCP servers,
   `homestead-core/superuser/mcp-servers/`), same superusers model, usable only
   by groups they're shared with; each references a credential, and
   `server/mcp/connect.ts` (`withMcpServer`) is the one place a token is
   attached. URLs follow `server/net/mcp-url.ts` (home network yes; loopback,
   link-local, reserved no; `HOMESTEAD_MCP_TRUSTED_HOSTS` exempts hosts).
   `:refresh-tools` fetches tools; new ones start `off`. Every tool call goes
   through `server/mcp/broker.ts` (`callConnectionTool`) — never call
   `withMcpServer` to run a tool yourself: it checks the share (read the server
   → `read` tools; write it → `ask`/`allow` too, via `canUseRecord` in
   `server/collection-access.ts`, backed by `Engine.recordAllows`), the policy
   (unknown = off), and approval for `ask`; labels and caps the result as
   untrusted; and logs an `mcp-call` row (superusers-only, system-written,
   90-day retention; `recordMcpCall` for outcomes decided elsewhere, like a
   declined approval). People call it through `mcp-servers/{id}:call-tool`;
   the assistant through `server/chat/mcp-tools.ts`, which builds each turn's
   `mcp_<server>__<tool>` tools (`mcpToolName`, shared with the SPA's labels)
   from the servers the speaker can read, using each tool's `input_schema`
   stored at the last check — tools without one aren't offered. `ask` tools are
   `needsApproval`; a declined or unanswered approval is logged as `denied`
   from `turns.ts`.
   The VM tier's `vm/mcp-stub.ts` is an in-process MCP server to call.
   A server can sign in with OAuth: its credential is `kind: 'oauth'`
   (`oauth_client_id`/`oauth_client_secret` for a pasted client, `oauth_scope`,
   and server-written `oauth_state` — tokens, a registered client, the
   sign-in server — plus `oauth_resource`, the only address its tokens go to).
   `server/mcp/oauth.ts` is `@ai-sdk/mcp`'s `OAuthClientProvider` over that
   credential: `mcp-servers/{id}:connect` returns the provider's sign-in URL
   (state + PKCE verifier held in memory, single-use, 10 min, bound to the
   superuser), the provider returns to the SPA's
   `/superuser/mcp-servers/oauth-callback`, which posts `:finish-connect`;
   `connect.ts` hands `oauthProviderFor` to the transport, refreshing expiring
   tokens one at a time per credential and never starting a sign-in itself.
   `vm/oauth-mcp-stub.ts` is an OAuth-protected MCP server with its own
   authorization server, for specs.

### Resource references

Annotate a string field that stores another record's id with
`reference: { resource: '<singular>' }` so the link is machine-readable
instead of a prose `description`:

```ts
fields: {
  created_by: { type: 'string', reference: { resource: 'user' } },
  store:      { type: 'string', reference: { resource: 'store' } },
  players: {
    type: 'array',
    items: { type: 'string', reference: { resource: 'person' } },
  },
}
```

- Only valid on `string` fields; for a to-many reference annotate the array's
  `items`, not the array. Mutually exclusive with `enum`.
- The target must be a declared resource, or the built-in `user` root — the
  schema sync validates references across all definitions at boot and fails
  fast on an unknown target.
- Like `enum`, the annotation is stripped from the wire schema and folded into
  the wire `description` (`reference to a <resource> record (by id)`), so it
  round-trips through aepbase without a custom keyword.
- Consumers: the chat tool builder tells the model which resource an id belongs
  to (and, when that resource has its own tools, which `read_<x>` tool finds
  one); the chat executor existence-checks a supplied reference id before a
  create/update write; and the search tool resolves a hit's references to their
  target's display name.
- `onDelete` is **enforced by the engine** at delete time, opt-in per field —
  only a reference that declares one is acted on:
  - `restrict` blocks the delete (409) while any record still points at it;
  - `set-null` clears the pointer on each referrer (array items: drops the
    element) — not allowed on a `required` field;
  - `cascade` deletes each referring record and its subtree. Used only for
    pure link records that mean nothing without their target
    (`person-relationship`); don't reach for it on records that hold data.
  A structured `x-aepbase-reference` marker on the wire property carries this to
  the engine (see `homestead-server/src/engine/references.ts`); the human-
  readable `description` note is emitted alongside it.

### Parent / child relationships

| Child                       | Parent        | URL pattern                                                 |
|-----------------------------|---------------|-------------------------------------------------------------|
| `transaction`               | `gift-card`   | `/gift-cards/{id}/transactions/{id}`                        |
| `perk`                      | `credit-card` | `/credit-cards/{id}/perks/{id}`                             |
| `redemption`                | `perk`        | `/credit-cards/{id}/perks/{id}/redemptions/{id}`            |
| `run`                       | `action`      | `/actions/{id}/runs/{id}`                                   |
| `log`                       | `recipe`      | `/recipes/{id}/logs/{id}`                                   |
| `notification`              | `user`        | `/users/{id}/notifications/{id}`                            |
| `scheduled-notification`    | `user`        | `/users/{id}/scheduled-notifications/{id}`                  |
| `notification-subscription` | `user`        | `/users/{id}/notification-subscriptions/{id}`               |
| `user-preference`           | `user`        | `/users/{id}/preferences/{id}` (note the prefix strip)      |

Parent-keyed children don't carry the parent id as a stored field; it's
encoded in the URL path. Declare via `parents: ['<parent-singular>']`
in the resource definition; the runner orders applies so parents land
first.

### Not yet modeled

- Thumbnail generation for file fields

Realtime updates **are** modeled: `GET /api/events` (SSE; public contract in
[`packages/homestead-site/docs/guides/events.md`](packages/homestead-site/docs/guides/events.md))
streams a `resource.created|updated|deleted` event, carrying the record, for
every committed write. `src/change-feed.ts` decides per subscriber with
`engine.canRead` — the same `authorizeRecordRead` a GET runs (deletes are
decided pre-commit via the dispatcher's `beforeDelete`) — and keeps a replay
buffer for `Last-Event-ID` resume. The SPA (`homestead-core/api/changeFeed.ts`)
writes each event into the resource's cache slots (`resourceEvents.ts`; lists
register their shape via `useResourceList`) and skips its own writes by the
`X-Homestead-Client` origin tag. Apps react to other people's changes through
the hooks in `homestead-core/api/remoteChanges.ts` (`useResourceEvents`,
`useRecentRemoteChanges`, `useChangeToasts`, `useRemoteEdits`) and the shared
`RemoteChangeBadge` / `RemoteEditNotice` UI; events carry the writer's
`actor_name` so no user lookup is needed.

Row-level security **is** modeled and enforced: per-collection and per-record
access is governed by the grant-based ACL system (`access-grant` records +
the shared `resolve()` in `packages/homestead-core/permissions/resolve.ts`,
enforced by `packages/homestead-server/src/engine/enforce.ts`). Any record can
be shared with a user or group via a record-scope grant; the generic
`ShareRecordDialog` / `ShareButton`
(`packages/homestead-core/permissions/components/`) are the reusable UI for it.

Child resources **inherit their parent's access** by default
(`homestead-server/src/engine/inherit.ts`): a record is reachable by whoever may
reach its governing ancestor — read to see it, write to add, change, or remove
it — so sharing a gift card shares its transactions. The user subtree is the
root case (only that user and superusers). Denies on the child type or any
ancestor still narrow; a resource opts out with `independent_access: true`. See
[`docs/design/parent-access-inheritance.md`](packages/homestead-site/docs/design/parent-access-inheritance.md).

### App flags

The `app-flags` resource is generated dynamically from declared
app flags rather than defined statically. Each app can declare
typed flags in its `app.config.ts` (`flags: { ... }`). At server
boot, the schema sync aggregates every declared flag (via
`getAllAppFlagDefs` in
`@rambleraptor/homestead-core/apps/registry`), builds a JSON-schema
payload, and POST/PATCHes it against aepbase's
`/aep-resource-definitions` endpoint. One record of `app-flags` is
the household-wide singleton; fields are flattened as
`${appId_snake}__${key}` on the wire.

Consumers: `useAppFlag(appId, key)` from
`@rambleraptor/homestead-core/settings` is the one public hook for
reading/writing a single flag from any component. Each flag also has an
**audience** (`<flag>__audience`, a sibling field the sync adds): everyone,
nobody, or a JSON list of group ids. `useAppFlag`'s `value` applies the
stored value only to people in the audience and gives everyone else the
default, so a feature can be tried on a "Beta" group first; Flag Management
sets it. Resolved client-side, so it chooses an experience, never guards
data; server-side `readAppFlag` ignores audiences.

---

## For Claude AI Assistants

1. **Always run the full gate** (`make ci && make test`) before marking
   work complete.
2. **Follow the modular architecture** — don't create monolithic
   components. App hooks own their data access.
3. **Respect existing patterns** — review similar code before implementing.
   **Build on platform features rather than reimplementing them.** If an app
   needs something a platform feature already does (retention, access
   inheritance, the change feed, references' `onDelete`, …), declare it on the
   resource; if the feature falls just short, extend the feature rather than
   writing a one-off cron, hook, or helper beside it.
4. **Use the aepbase wrapper** (`@rambleraptor/homestead-core/api/aepbase`)
   for client-side data access, and the shared client
   (`serverClient(token)` from `@rambleraptor/homestead-core/server/client`)
   for server-side routes, crons, and migrations.
5. **Ask before touching schema** — `resources.ts` changes affect real data.
6. **Security first** — validate inputs, sanitize outputs, follow OWASP.

### Before every PR push

```bash
make ci && make test
```

Only push when all checks pass.
