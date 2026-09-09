# Dashboard Widgets

A widget is a small React component your app shows on the home dashboard
(`/dashboard`) — a compact, read-only summary of your app's data (items left
to buy, upcoming events, perks due soon) with a link into the full app. Add
one when your app has an at-a-glance number or list worth surfacing on the
home screen.

This page covers:

- [How widgets work](#how-widgets-work)
- [Add a widget to your app](#add-a-widget-to-your-app)
- [WidgetCard reference](#widgetcard-reference)
- [Conventions and gotchas](#conventions-and-gotchas)
- [Find existing widgets](#find-existing-widgets)

---

## How widgets work

You declare a widget in your app's `app.config.ts`, and the dashboard renders
it automatically — no dashboard or registry edits needed.

Each widget takes **no props** and fetches its own data. The dashboard
collects the widgets from every installed app, drops widgets for apps the
viewer can't access, and stacks the rest vertically. It orders them by each
widget's `order` value (lower first), then applies the viewer's saved
ordering and hidden-widget choices from the dashboard customization UI.

---

## Add a widget to your app

Write the component, then register it in `app.config.ts`. The example below
adds a `recipes` widget showing meals cooked this week.

### 1. Write the widget component

Put it under your app's `components/` folder, one file per widget named
`<Name>Widget.tsx`:

```
packages/homestead-apps/recipes/components/RecipesCookedThisWeekWidget.tsx
```

The component takes no props, fetches its own data via an app-scoped hook,
wraps its content in `<WidgetCard>`, and handles the loading and empty states:

```tsx
import { ChefHat, Loader2 } from 'lucide-react';
import { WidgetCard } from '@rambleraptor/homestead-core/shared/components/WidgetCard';
import { useRecipeLogs } from '../hooks/useRecipeLogs';

export function RecipesCookedThisWeekWidget() {
  const { data: logs, isLoading } = useRecipeLogs({ since: 'this-week' });
  const count = logs?.length ?? 0;

  return (
    <WidgetCard
      icon={ChefHat}
      title="Cooked this week"
      href="/recipes"
      data-testid="recipes-cooked-this-week-widget"
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-6 h-6 text-text-muted animate-spin" />
        </div>
      ) : count > 0 ? (
        <div className="flex items-baseline gap-2 py-2">
          <span className="font-display text-3xl text-text-main">{count}</span>
          <span className="font-body text-text-muted">
            {count === 1 ? 'meal cooked' : 'meals cooked'}
          </span>
        </div>
      ) : (
        <p className="font-body text-text-muted py-2">
          No meals logged yet this week.
        </p>
      )}
    </WidgetCard>
  );
}
```

Import shared chrome (`WidgetCard`) from the
`@rambleraptor/homestead-core/...` alias, and your app's own hook as a relative
`../hooks/...` import. If the data hook you need doesn't exist, add it under
`packages/homestead-apps/<feature>/hooks/` first, or reuse an existing hook
that already covers your data.

### 2. Register the widget in `app.config.ts`

Append an entry to the app's `widgets` array. Set:

- `id` — globally unique across all apps; prefix it with the app id.
- `label` — shown in the dashboard customization UI. Falls back to `id`.
- `component` — a lazy thunk, `() => import(...).then((m) => m.X)`.
- `order` — position relative to other apps' widgets. Lower renders first;
  defaults to 100.

```ts
// packages/homestead-apps/recipes/app.config.ts
export const recipesApp: AppConfig = {
  // ...existing fields...
  web: {
    // ...icon, routes...
    widgets: [
      {
        id: 'recipes-cooked-this-week',
        label: 'Cooked this week',
        component: () =>
          import('./components/RecipesCookedThisWeekWidget').then(
            (m) => m.RecipesCookedThisWeekWidget,
          ),
        order: 30,
      },
    ],
  },
};
```

The groceries app's declaration (under `web`):

```ts
// packages/homestead-apps/groceries/app.config.ts
web: {
  // ...icon, routes...
  widgets: [
    {
      id: 'groceries-remaining',
      label: 'Groceries',
      component: () =>
        import('./components/GroceriesWidget').then((m) => m.GroceriesWidget),
      order: 10,
    },
  ],
},
```

### 3. Verify it appears

Start the dev stack:

```bash
make dev
```

Visit `/dashboard` and confirm the widget appears in the expected slot
relative to other widgets. Then run the gate:

```bash
make ci && make test
```

If you add an e2e check, give the widget a testid matching the pattern
`<feature>-widget` or `<feature>-<slug>-widget` so the Page Object can target
it without CSS selectors.

---

## WidgetCard reference

`<WidgetCard>` is the standard wrapper for a widget: a rounded card with an
icon chip, link-style title, optional config gear, and a collapse toggle. Its
props:

```ts
export interface WidgetCardProps {
  icon?: LucideIcon;          // header chip icon
  title: ReactNode;           // shown inside the link
  href: string;               // app home route
  configHref?: string;        // optional config page; renders a gear
  configLabel?: string;       // a11y label for the gear; defaults to "Configure widget"
  children?: ReactNode;       // body, hidden when collapsed
  defaultCollapsed?: boolean; // default false
  className?: string;         // outer card extras
  bodyClassName?: string;     // body wrapper extras
  'data-testid'?: string;     // outer card test id
}
```

Notes:

- Point `href` at your app's home route so clicking the title drills into the
  app. The title links via `react-router-dom`'s `<Link>`.
- Set `configHref` to add a settings gear in the header linking to the
  widget's config page. The gear exposes `data-testid="widget-config-link"`.
- Collapse state is local to the widget and not persisted. Leave
  `defaultCollapsed` at `false` unless the body is expensive or noisy.
- The collapse toggle exposes `data-testid="widget-collapse-toggle"`. In e2e
  tests, scope the lookup to your widget's outer testid.

---

## Conventions and gotchas

**Naming**

- Component file: `<Name>Widget.tsx` under
  `packages/homestead-apps/<feature>/components/`.
- Widget id: `<app-id>-<slug>` (e.g. `groceries-remaining`,
  `events-upcoming`). Ids must be unique across the whole app.
- Test id: same as the widget id with a `-widget` suffix, or just
  `<app>-widget` when the app only has one.

**Order values**

`order` ranks a widget against widgets from all other apps, not just your own.
Choose values with gaps (10, 20, 30, …) so future widgets can slot in without
renumbering. The default is `100`. The viewer can reorder and hide widgets in
the dashboard customization UI, so treat `order` as a default, not a
guarantee.

**Data fetching**

- Use a React Query hook from your app's `hooks/` directory. The widget shares
  the app's cache, so the dashboard reuses data the user already loaded.
  Prefer queries the rest of the app already runs.
- Always render an `isLoading` branch and an empty branch. Phrase the empty
  state in plain English rather than showing a bare `0`.

**Visuals**

- Wrap the body in `<WidgetCard>`, not a custom container.
- Keep widgets compact. The dashboard column is `max-w-3xl`; link out via the
  title `href` for anything that needs more space.
- Use the project palette (`text-text-main`, `text-text-muted`,
  `font-display`, `font-body`, `bg-surface-white`, `text-brand-navy`).

**Don'ts**

- Don't accept props. Widgets are zero-prop. For configuration, declare an app
  flag (`AppConfig.flags`) and read it with `useAppFlag(...)` from
  `@rambleraptor/homestead-core/settings`.
- Don't import another app's components.
- Don't write data from a widget. Widgets are read-only; link into the app for
  mutations.
- Don't import the component eagerly. Keep the lazy
  `component: () => import(...)` form.

---

## Find existing widgets

The widgets in the repo are good references when you write your own (for
example `packages/homestead-apps/groceries/components/GroceriesWidget.tsx`).
List them all:

```bash
grep -rn "widgets:" packages/homestead-apps/*/app.config.ts
```
