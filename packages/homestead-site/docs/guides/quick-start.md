# Quick Start: A Grocery List

Build a working **Grocery List** app: a page that adds items and lists them,
backed by its own database collection. By the end you'll have a new app in
your sidebar with no config wiring.

This page covers:

- [Define the app](#define-the-app)
- [Write the page](#write-the-page)
- [Run it](#run-it)
- [Next steps](#next-steps)

To generate everything below in one command, run:

```bash
homestead init-app grocery
```

This creates `apps/grocery/` with a starter app config, resource, and home
component you can edit. To write the files by hand instead, follow along.

## Define the app {#define-the-app}

Create `apps/grocery/app.homestead.ts` and default-export the app config
below. It declares one `grocery-item` collection and one route. The `icon`
and route `component` load on demand.

```ts
// apps/grocery/app.homestead.ts
import type { AppConfig } from '@rambleraptor/homestead-core/apps/types';

const groceryApp: AppConfig = {
  id: 'grocery',
  name: 'Grocery',
  description: 'A shared grocery list.',
  web: {
    icon: () => import('lucide-react').then((m) => m.ShoppingCart),
    section: 'Home',
    routes: [
      { path: '', index: true, component: () => import('./GroceryHome').then((m) => m.GroceryHome) },
    ],
  },
  resources: [
    {
      singular: 'grocery-item',
      plural: 'grocery-items',
      user_settable_create: true,
      fields: {
        name: { type: 'string', required: true },
        checked: { type: 'boolean', default: false },
      },
    },
  ],
};

export default groceryApp;
```

Homestead creates the `grocery-item` collection the next time you start the
server. Keep field names in snake_case, and `singular` / `plural` in
kebab-case.

## Write the page {#write-the-page}

This page lists the saved items and adds new ones. Create
`apps/grocery/GroceryHome.tsx`:

```tsx
// apps/grocery/GroceryHome.tsx
import { useEffect, useState } from 'react';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';

type Item = { id: string; name: string };

export function GroceryHome() {
  const [items, setItems] = useState<Item[]>([]);
  const [name, setName] = useState('');

  const load = () => aepbase.list<Item>('grocery-items').then(setItems);
  useEffect(() => void load(), []);

  async function add() {
    if (!name.trim()) return;
    await aepbase.create('grocery-items', { name });
    setName('');
    load();
  }

  return (
    <div className="p-6">
      <h1 className="font-display text-2xl">Grocery List</h1>
      <div className="my-4 flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} />
        <button onClick={add}>Add</button>
      </div>
      <ul>{items.map((i) => <li key={i.id}>{i.name}</li>)}</ul>
    </div>
  );
}
```

## Run it {#run-it}

Start the server:

```bash
homestead start
```

Sign in, then open `/grocery`. Your app appears in the sidebar under its
`section`. Add an item; it persists and reappears when you reload.

Homestead finds any `apps/<dir>/app.homestead.ts` on startup, so no config
edit is needed. To install an app from npm or wire one in by hand, add it to
the `apps` array in `homestead.config.ts`. If both declare the same `id`,
the entry in `homestead.config.ts` wins. To keep apps somewhere other than
`apps/` — or in several directories — point `HOMESTEAD_APPS_DIRS` at them
(see [App Config](./app-config#app-directories)).

## Next steps {#next-steps}

Your list now persists. From here an app can do more:

- **[Widgets](./widgets)** — add a "items remaining" card to the dashboard.
- **[App Flags](./app-flags)** — add typed, household-wide settings.
- **[Notifications](./notifications)** — send push notifications to users.
- **[Bulk Import](./bulk-import)** — let users import rows from a CSV.
