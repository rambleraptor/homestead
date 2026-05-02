# Self-hosting Homestead

This guide walks you from a fresh clone to a running instance configured
with the modules you want. If you're a contributor working on Homestead
itself, the root [`README.md`](../README.md) covers the same backend
bootstrap with less hand-holding around module choice.

## What you're building

Two processes:

- **aepbase** — a small Go binary that serves an AEP-compliant REST API
  backed by SQLite. Holds all your data.
- **frontend** — a Next.js app that talks to aepbase over a same-origin
  `/api/aep` proxy.

Each user-facing feature (gift cards, recipes, todos, …) is an opt-in
**module**. You pick which ones to ship by editing one file:
[`frontend/homestead.config.ts`](../frontend/homestead.config.ts).

## Prerequisites

- Node.js 20+ and npm
- Go 1.22+ (for building aepbase)
- Terraform 1.6+ (for applying the schema once)

## 1. Clone and install

```bash
git clone <your-fork-url>
cd homestead
npm install            # installs every workspace package
```

## 2. Choose your modules

Open `frontend/homestead.config.ts`. It looks like this:

```ts
import {
  creditCardsModule, dashboardModule, gamesModule, giftCardsModule,
  groceriesModule, hsaModule, notificationsModule, peopleModule,
  recipesModule, todosModule,
} from '@rambleraptor/homestead-modules';
import type { HomesteadConfig } from '@/modules/config';

const config: HomesteadConfig = {
  modules: [
    dashboardModule, todosModule, giftCardsModule, groceriesModule,
    recipesModule, peopleModule, hsaModule, creditCardsModule,
    gamesModule, notificationsModule,
  ],
};

export default config;
```

To trim the instance down — say, you only want a todo list and groceries:

```ts
const config: HomesteadConfig = {
  modules: [
    dashboardModule,
    todosModule,
    groceriesModule,
  ],
};
```

The settings and superuser modules are always installed by the registry
and don't appear in this list. They cover account management and flag
management — surfaces the rest of the app depends on.

Removing a module hides it from the sidebar, makes its URLs 404, and
drops its dashboard widget. The collections it owned are no longer
applied on the next Next.js boot — old data still lives in aepbase
(deleting a resource definition is destructive and isn't done
automatically), but new writes will 404.

## 3. Bootstrap the backend

```bash
cd aepbase
./install.sh           # first time only — builds bin/aepbase
./run.sh               # serves on :8090
```

aepbase prints the superuser email + password to stdout on first start.
**Save these credentials** — set them as `AEPBASE_ADMIN_EMAIL` and
`AEPBASE_ADMIN_PASSWORD` in the Next.js environment (e.g. in
`frontend/.env.local`) so the schema sync runs automatically when the
Next.js server starts. The schema is applied once at boot — no
separate `apply` step is needed.

## 4. Run the frontend

In a third terminal:

```bash
cd frontend
npm run dev
```

Open http://localhost:3000 and log in with the superuser credentials
from step 3. `/` redirects to the dashboard; the sidebar shows whichever
modules you kept in `homestead.config.ts`.

## 5. Add a custom module

A module is self-describing. The minimum is a `module.config.ts` and
the components its routes render:

```
packages/homestead-modules/laundry/
├── components/
│   └── LaundryHome.tsx
├── module.config.ts
└── index.ts
```

```ts
// module.config.ts
import { Shirt } from 'lucide-react';
import type { HomeModule } from '@/modules/types';
import { LaundryHome } from './components/LaundryHome';

export const laundryModule: HomeModule = {
  id: 'laundry',
  name: 'Laundry',
  description: 'Track loads and detergent inventory.',
  icon: Shirt,
  basePath: '/laundry',
  routes: [{ path: '', index: true, component: LaundryHome }],
  section: 'Home',
};
```

Then in `frontend/homestead.config.ts`:

```ts
import { laundryModule } from '@rambleraptor/homestead-modules/laundry';

const config: HomesteadConfig = {
  modules: [
    /* existing modules... */
    laundryModule,
  ],
};
```

If your module needs its own aepbase collection, add a `resources.ts`
next to `module.config.ts` exporting a `ResourceDefinition[]`, and
reference it from the module's config (`resources: [...]`). The Next.js
boot hook applies the schema; restart the dev server to pick up the
change. See [`docs/MODULE_GUIDE.md`](MODULE_GUIDE.md) for the full
module-authoring walkthrough (hooks, dashboard widgets, module flags,
omnibox).

## 6. Production deployment

For a long-lived instance behind systemd (or Tailscale), see
[`deployment/README.md`](../deployment/README.md). The deployment
package builds the frontend, wires up systemd services for aepbase and
Next.js, and includes sample `.env.production` templates.

## Where things live

```
homestead/
├── frontend/                       # Next.js app
│   ├── homestead.config.ts         # ← the file you edit
│   └── src/
│       ├── app/(app)/              # layout + catch-all router + root redirect
│       ├── core/                   # auth, aepbase client, layout chrome
│       ├── modules/                # core modules (settings, superuser) + registry
│       └── shared/                 # reusable components
├── packages/
│   ├── homestead-modules/          # opt-in feature modules
│   └── homestead-core/             # shared types and clients
├── aepbase/                        # Go backend
│   └── main.go                     # thin wrapper over aepbase library
└── deployment/                     # systemd unit files + scripts
```
