# App Config

Every Homestead app is one object that follows the `AppConfig` shape. It tells
Homestead how to add your app to navigation, the router, the dashboard,
settings, and the schema sync. This page is the field reference.

The type lives in
[`@rambleraptor/homestead-core/apps/types`](https://github.com/rambleraptor/homestead/blob/main/packages/homestead-core/apps/types.ts).
New to apps? Start with the [Quick Start](./quick-start); this page assumes you
already know what an app is.

This page covers:

- [Where to declare a config](#where-to-declare-a-config)
- [Writing a minimal config](#writing-a-minimal-config)
- [Field reference](#field-reference)
- [Adding routes](#adding-routes)
- [Adding flags and user settings](#adding-flags-and-user-settings)
- [Adding dashboard widgets](#adding-dashboard-widgets)
- [Scheduling background work](#scheduling-background-work)
- [Nesting apps](#nesting-apps)

## Where to declare a config

Declare your config in one of two places:

- **Auto-discovered** — `apps/<dir>/app.homestead.ts` **default**-exports the
  config. No wiring needed; this is what the [Quick Start](./quick-start) uses.
- **Explicit** — listed in the `apps` array of `homestead.config.ts`. The
  bundled example apps **named**-export their config from `app.config.ts`.

If the same `id` appears in both places, the explicit entry wins.

### Discovering apps from other directories {#app-directories}

Auto-discovery scans `<project>/apps` by default. Set `HOMESTEAD_APPS_DIRS` to
scan somewhere else, or several places at once — a list of directories
separated by `:` (`;` on Windows), each holding `<name>/app.homestead.ts`
subdirectories just like `apps/` does:

```bash
HOMESTEAD_APPS_DIRS=apps:/srv/household-apps
```

Relative entries resolve against the project root. The variable **replaces**
the default lookup rather than adding to it, so list `apps` explicitly if you
want to keep it. Directories are scanned in the order given; if two of them
ship the same app `id`, the first one wins (and an `id` also listed in
`homestead.config.ts` still beats both).

Set it wherever the server reads its environment — the `EnvironmentFile` of
the systemd unit `homestead install-service` writes (`<project>/.env` by
default), or your shell before `homestead start`. Both the server and the SPA
build read it, so apps in any of these directories are registered and routed
exactly like ones under `apps/`.

One constraint: an app's own imports (`@rambleraptor/homestead-core`,
`lucide-react`, …) resolve from the directory the app file lives in, the same
way Node resolves anything else. Directories under the project see the
project's `node_modules` and just work. A directory outside the project needs
its dependencies resolvable there — make it its own npm project with the
homestead packages installed. Otherwise boot fails with `Cannot find package`,
naming the app file.

## Writing a minimal config

Required are `id`, `name`, `description`, and a `web` object holding `icon`,
`basePath`, and `routes`. Everything else is optional. The `web` object groups
everything about how the app surfaces in the browser — routing, navigation
placement, dashboard widgets, list filters, and offline overrides; the
top-level fields are the app's identity and its data (`flags`, `userSettings`,
`resources`, `children`).

```ts
import type { AppConfig } from '@rambleraptor/homestead-core/apps/types';

const groceryApp: AppConfig = {
  id: 'grocery',
  name: 'Grocery',
  description: 'A shared grocery list.',
  web: {
    icon: () => import('lucide-react').then((m) => m.ShoppingCart),
    basePath: '/grocery',
    routes: [
      {
        path: '',
        index: true,
        component: () => import('./GroceryHome').then((m) => m.GroceryHome),
      },
    ],
  },
};

export default groceryApp;
```

Write `web.icon` and each route's `component` as lazy thunks —
`() => import(...)` — not direct imports.

## Field reference

### Top-level fields

The app's identity, its data, and the `web` object.

| Field            | Type                             | Default | Purpose                                                                 |
| ---------------- | -------------------------------- | ------- | ----------------------------------------------------------------------- |
| `id` *           | `string`                         | —       | Unique identifier (lowercase, no spaces). Keys the registry and flags.  |
| `name` *         | `string`                         | —       | Display name in nav and UI.                                             |
| `description` *  | `string`                         | —       | Short summary of the app.                                              |
| `web` *          | `AppWebConfig`                   | —       | How the app surfaces in the browser ([below](#web-fields)).            |
| `defaultEnabled` | `AppVisibility`                  | `'all'` | Starting audience for the auto `enabled` flag — see [App Flags](./app-flags#gating-your-app-on-visibility). |
| `metadata`       | `Record<string, unknown>`        | —       | Arbitrary app-specific data.                                       |
| `flags`          | `Record<string, AppFlagDef>`     | —       | Household-wide typed settings ([below](#adding-flags-and-user-settings)). |
| `userSettings`   | `Record<string, UserSettingDef>` | —       | Per-user typed settings (same shape as `flags`).                   |
| `resources`      | `ResourceDefinition[]`           | —       | aepbase collections the app owns — see [Resources](./resources).   |
| `crons`          | `CronHook[]`                     | —       | Periodic server-side hooks ([below](#scheduling-background-work)).  |
| `children`       | `AppConfig[]`                    | —       | Sub-apps; makes this a container app ([below](#nesting-apps)).     |

### `web` fields

Everything about how the app surfaces in the browser. Lives under the required
`web` object.

| Field              | Type                                        | Default     | Purpose                                                                 |
| ------------------ | ------------------------------------------- | ----------- | ----------------------------------------------------------------------- |
| `icon` *           | `LazyIcon`                                  | —           | Lazy Lucide icon thunk.                                                |
| `basePath` *       | `string`                                    | —           | Route prefix; must start with `/`.                                    |
| `routes` *         | `AppRoute[]`                                | —           | The app's pages ([below](#adding-routes)).                            |
| `homeScreenIcon`   | `string`                                    | shared icon | PWA "Add to Home Screen" image path ([below](#home-screen-icons)).     |
| `showInNav`        | `boolean`                                   | `true`      | `false` hides the app from nav but keeps routes reachable.            |
| `placement`        | `'sidebar' \| 'topbar'`                     | `'sidebar'` | Where the nav entry renders. Topbar apps are icon-only.              |
| `topBarBadge`      | `LazyComponent`                             | —           | Badge inside a topbar app's button (fetches its own data).          |
| `navOrder`         | `number`                                    | `100`       | Sort order within a section (lower first).                          |
| `section`          | `string`                                    | —           | Grouping header in the sidebar. Unsectioned apps render last.       |
| `filters`          | `AppFilterDecl[]`                           | —           | Client-side, in-memory list filters.                               |
| `settingsWidget`   | `LazyComponent`                             | —           | Custom settings-page UI in place of the auto-generated form.       |
| `widgets`          | `DashboardWidget[]`                         | —           | Dashboard summary cards ([below](#adding-dashboard-widgets)).      |

`*` = required.

> Server-side endpoints aren't declared here. They're AEP-136 custom methods on
> a resource definition (`ResourceDefinition.customMethods`), addressed as
> `POST /<plural>:<verb>`.

## Adding routes

Routes live under `web`. Each route's `path` is relative to `web.basePath`. Use
`''` for the index and `:name` for params, which arrive on the component's
`params` prop.

```ts
web: {
  // ...icon, basePath...
  routes: [
    { path: '', index: true,
      component: () => import('./GroceriesHome').then((m) => m.GroceriesHome) },
    { path: ':id', dynamic: true, gates: ['enabled'],
      component: () => import('./GroceryDetail').then((m) => m.GroceryDetail) },
  ],
},
```

`gates` wraps the route in `'enabled'` (app visibility) and/or `'superuser'`
guards. Set `dynamic: true` on routes with `:name` params so they aren't
prerendered.

## Home-screen icons

Every user-facing app should set `web.homeScreenIcon` so an "Add to Home
Screen" from anywhere inside the app installs *that app* — its own icon, name
and launch URL (`web.basePath`) — rather than the shared Homestead icon. The
server serves each app's web-app manifest at `/api/app-manifest/<id>` and
writes that manifest link, the touch icon and the iOS title into the
`index.html` it serves for any path under the app, so the head is right on a
fresh load (iOS reads it before the SPA runs). Client-side navigation keeps it
in sync: entering an app that declares an icon swaps the tags to that app's,
leaving it restores the Homestead defaults. The manifest's scope is the whole
origin, so signing in inside an installed app stays in the app.

The manifest launches the app at `<basePath>?chrome=none`: **chromeless mode**
hides the sidebar and top bar so the installed app fills the screen like a
native one. The parameter works on any URL and sticks for the browsing session
(client-side navigation drops the query string, so it has to); `?chrome=full`
turns the chrome back on.

The convention is `/app-icons/<app-id>.png`, a 512×512 full-bleed PNG served
from the SPA's `public/` directory:

```ts
web: {
  icon: () => import('lucide-react').then((m) => m.ShoppingCart),
  basePath: '/groceries',
  homeScreenIcon: '/app-icons/groceries.png',
  // ...
}
```

Don't draw the PNG by hand. `packages/homestead-app/scripts/generate-app-icons.ts`
renders one for every app that declares a `/app-icons/*.png` path, using the
app's `web.icon` glyph in white on a per-app background color (listed in the
script; add a line for a new app, or it falls back to the brand indigo):

```bash
cd packages/homestead-app && npm run icons:apps
```

Commit the generated file. The images are full-bleed on purpose — iOS applies
its own rounded mask and the manifest marks the image `maskable`, so the glyph
is kept inside the safe zone and the platform does the rest. Sub-apps
(`children`) declare their own icon; the parent's is not inherited.

The `homeScreenIcons` test in `packages/homestead-app/src/apps/__tests__`
fails when a user-facing app (anything outside the dashboard and the superuser
tree) is missing the field or the file.

## Adding flags and user settings

`flags` are household-wide; `userSettings` are per-user. Both share the
`AppFlagDef` shape and are read with `useAppFlag` / `useUserSetting`. See the
[App Flags](./app-flags) guide.

```ts
flags: {
  default_store: {
    type: 'string',            // 'string' | 'number' | 'boolean' | 'enum'
    label: 'Default store',
    description: 'Store id pre-selected when adding new grocery items.',
    default: '',
  },
},
```

`enum` flags also take `options: readonly string[]`. Every app additionally
gets an auto-injected `enabled` flag — don't declare your own.

## Adding dashboard widgets

Dashboard cards declared under `web.widgets` with a lazy `component`. Each
widget takes no props and fetches its own data. The dashboard lays widgets out
by `order` (lower first; default `100`). See the
[Dashboard Widgets](./widgets) guide.

```ts
web: {
  // ...icon, basePath, routes...
  widgets: [
    {
      id: 'groceries-remaining',   // globally unique; prefix with app id
      label: 'Groceries',
      component: () => import('./components/GroceriesWidget').then((m) => m.GroceriesWidget),
      order: 10,
    },
  ],
},
```

## Scheduling background work

`crons` declares periodic server-side hooks. Each `CronHook` names a handler the
server's scheduler invokes every `intervalSeconds`, for as long as the instance
is running. Hooks are headless — they run without a user request — so an app can
schedule digests, cleanups, or reminders without any web surface (a
`crons`-only app can omit `web` entirely).

Each handler runs with a short-lived **admin** bearer token minted per firing
(the same mechanism the boot-time schema sync uses) and revoked when the handler
settles. Pair it with the shared client (`serverClient(token)` from
`@rambleraptor/homestead-core/server/client`) to read or write engine data.

Every firing runs inside an **operation** — the scheduler opens one, runs the
handler, then marks it succeeded (with the handler's return value) or failed
(with its error). Each run therefore leaves a persisted record — status, timing,
result/error, and a log timeline — in the Operations app. That's the built-in
logging you get for free. The handler's `ctx.log(message)` appends a line to the
operation's `metadata.logs`; the most recent line shows as the operation's live
status while it runs (the scheduler brackets each run with `started` and a
terminal `succeeded` / `failed: …` entry automatically).

```ts
// app.config.ts
crons: [
  {
    id: 'groceries-weekly-digest',   // globally unique across all apps
    title: 'Weekly grocery digest',  // label for the operation (defaults to id)
    intervalSeconds: 60 * 60 * 24,   // once a day
    runOnStart: false,               // also fire once at boot? (default false)
    load: () => import('./crons/weekly-digest'),
  },
],
```

```ts
// crons/weekly-digest.ts — server-only; keep handlers under crons/ (or
// methods/, or a *.server.ts file) so the production build stubs them out of
// the browser bundle.
import type { CronHandler } from '@rambleraptor/homestead-core/apps/types';
import { serverClient } from '@rambleraptor/homestead-core/server/client';

const handler: CronHandler = async ({ token, log }) => {
  const items = await serverClient(token).collection('grocery-items').listAll();
  await log(`digesting ${items.length} items`);   // appears in the Operations app
  // …send a digest, prune stale rows, etc.
  return { digested: items.length };               // recorded as the operation's response
};

export default handler;
```

The scheduler skips a tick if the previous run of the same hook is still in
flight, and logs-and-swallows a handler that throws so one bad run can't take
the process down. A hook with a duplicate `id` or a non-positive
`intervalSeconds` is dropped with a warning at boot.

> Async (AEP-151) custom methods get the same logging: their handler context
> carries `ctx.log?.(message)`, writing to the spawned operation's timeline.

> Scheduling is **interval-based** (every N seconds), not wall-clock cron
> (“3am daily”). For a fixed time of day, pick a modest interval and have the
> handler check the clock.

## Nesting apps

Setting `children` makes an app a container. Each child is a full `AppConfig`
whose `web.basePath` must start with the parent's. The parent's index renders a
landing of child cards. Children get their own `enabled` flag, so they gate
independently, but they stay out of top-level nav — the parent owns the
placement.

```ts
{ id: 'finance', web: { basePath: '/finance', /* ... */ }, children: [creditCardsApp, receiptsApp] }
```
