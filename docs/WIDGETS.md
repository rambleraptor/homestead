# Dashboard Widgets

Widgets are small, self-contained React components that modules contribute to
the home dashboard (`/dashboard`). Each widget owns its own data fetching and
presentation; the dashboard just discovers them through the module registry
and lays them out in declared order.

This document explains how the widget system works and how to add a new widget
to a module.

## Table of Contents

- [How It Works](#how-it-works)
- [Anatomy of a Widget](#anatomy-of-a-widget)
- [Adding a New Widget](#adding-a-new-widget)
- [WidgetCard API](#widgetcard-api)
- [Conventions and Best Practices](#conventions-and-best-practices)
- [Existing Widgets](#existing-widgets)

---

## How It Works

The pieces that wire a widget onto the dashboard:

| Concern              | Location                                                                 |
|----------------------|--------------------------------------------------------------------------|
| Widget type          | `frontend/src/modules/types.ts` — `DashboardWidget`                      |
| Module declaration   | `frontend/src/modules/<feature>/module.config.ts` — `widgets: [...]`     |
| Registry aggregation | `frontend/src/modules/registry.ts` — `getAllDashboardWidgets()`          |
| Renderer             | `frontend/src/modules/dashboard/components/DashboardHome.tsx`            |
| Standard chrome      | `frontend/src/shared/components/WidgetCard.tsx`                          |

A module declares any number of widgets in its `module.config.ts`. At render
time, `DashboardHome` calls `getAllDashboardWidgets()`, which flattens
`widgets` arrays from every registered module and sorts them by `order`
(default `100`, lower first). The dashboard then renders each widget in a
vertical stack; widgets receive **no props**.

### Widget type

```ts
// frontend/src/modules/types.ts
export interface DashboardWidget {
  /** Stable id, unique across all modules. */
  id: string;
  /** Self-contained widget component. Receives no props. */
  component: ComponentType;
  /** Lower numbers render first. Defaults to 100. */
  order?: number;
}
```

### Registry aggregation

```ts
// frontend/src/modules/registry.ts
export function getAllDashboardWidgets(): DashboardWidget[] {
  return moduleRegistry.modules
    .flatMap((m) => m.widgets ?? [])
    .sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
}
```

### Dashboard renderer

```tsx
// frontend/src/modules/dashboard/components/DashboardHome.tsx
const widgets = getAllDashboardWidgets();
// ...
<div className="max-w-3xl space-y-6">
  {widgets.map(({ id, component: Widget }) => (
    <Widget key={id} />
  ))}
</div>
```

---

## Anatomy of a Widget

A widget is a client component that:

1. Is marked `'use client'`.
2. Takes no props.
3. Fetches its own data via a module-scoped hook (typically a React Query hook
   that wraps the aepbase client).
4. Wraps its content in `<WidgetCard>` for consistent header chrome (icon,
   title link to the module home, collapse toggle).
5. Handles the loading and empty states explicitly.

Minimal example, lifted from `groceries/components/GroceriesWidget.tsx`:

```tsx
'use client';

import { Loader2, ShoppingCart } from 'lucide-react';
import { WidgetCard } from '@/shared/components/WidgetCard';
import { useGroceries } from '../hooks/useGroceries';

export function GroceriesWidget() {
  const { data: items, isLoading } = useGroceries();
  const remaining = items?.filter((item) => !item.checked).length ?? 0;

  return (
    <WidgetCard
      icon={ShoppingCart}
      title="Groceries"
      href="/groceries"
      data-testid="groceries-widget"
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-6 h-6 text-text-muted animate-spin" />
        </div>
      ) : remaining > 0 ? (
        <div className="flex items-baseline gap-2 py-2">
          <span className="font-display text-3xl text-text-main">{remaining}</span>
          <span className="font-body text-text-muted">
            {remaining === 1 ? 'item left to buy' : 'items left to buy'}
          </span>
        </div>
      ) : (
        <p className="font-body text-text-muted py-2">
          Nothing left to buy — your list is clear.
        </p>
      )}
    </WidgetCard>
  );
}
```

---

## Adding a New Widget

Suppose you want to add a widget to the `recipes` module that shows the
number of recipes cooked this week. Follow these steps.

### 1. Create the widget component

Place it under your module's `components/` folder. The convention is one file
per widget, named `<Name>Widget.tsx`:

```
frontend/src/modules/recipes/components/RecipesCookedThisWeekWidget.tsx
```

```tsx
'use client';

import { ChefHat, Loader2 } from 'lucide-react';
import { WidgetCard } from '@/shared/components/WidgetCard';
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

If the data hook you need doesn't exist, add it under
`src/modules/<feature>/hooks/` first. Reuse an existing hook when one
already covers your data — widgets don't need their own.

### 2. Register the widget in `module.config.ts`

Import the component and append it to the module's `widgets` array. Pick a
**globally unique** id (prefix with the module id) and an `order` that
positions it relative to widgets from other modules.

```ts
// frontend/src/modules/recipes/module.config.ts
import { RecipesCookedThisWeekWidget } from './components/RecipesCookedThisWeekWidget';

export const recipesModule: HomeModule = {
  // ...existing fields...
  widgets: [
    {
      id: 'recipes-cooked-this-week',
      component: RecipesCookedThisWeekWidget,
      order: 30,
    },
  ],
};
```

For reference, here is the groceries module's declaration:

```ts
// frontend/src/modules/groceries/module.config.ts
widgets: [
  {
    id: 'groceries-remaining',
    component: GroceriesWidget,
    order: 10,
  },
],
```

No registry edits are needed — `getAllDashboardWidgets()` discovers every
module's widgets automatically.

### 3. Verify on the dashboard

```bash
cd frontend && npm run dev
```

Visit `/dashboard` and confirm the widget appears in the right slot relative
to other widgets.

### 4. Run the gate

```bash
make ci && make test
```

If you add an e2e check, follow the existing widget testid pattern
(`<feature>-widget` or `<feature>-<slug>-widget`) so the Page Object can
target it without CSS selectors.

---

## WidgetCard API

`<WidgetCard>` is the standard wrapper that gives every widget a consistent
look (rounded card, icon chip, link-style title, collapse toggle).

```ts
// frontend/src/shared/components/WidgetCard.tsx
export interface WidgetCardProps {
  icon?: LucideIcon;          // header chip icon
  title: ReactNode;           // shown inside the link
  href: string;               // module home route
  children?: ReactNode;       // body, hidden when collapsed
  defaultCollapsed?: boolean; // default false
  className?: string;         // outer card extras
  bodyClassName?: string;     // body wrapper extras
  'data-testid'?: string;     // outer card test id
}
```

Notes:

- The title is automatically wrapped in a `next/link` to `href`. Point this
  at the module's home route so users can drill in by clicking the title.
- Collapse state is local to the widget instance (not persisted). Keep
  `defaultCollapsed` `false` unless the body is expensive or noisy.
- The collapse toggle exposes `data-testid="widget-collapse-toggle"`; if you
  need to interact with it in e2e tests, scope the lookup to your widget's
  outer testid.

---

## Conventions and Best Practices

**Naming**

- Component file: `<Name>Widget.tsx` under `src/modules/<feature>/components/`.
- Widget id: `<module-id>-<slug>` (e.g. `groceries-remaining`,
  `people-upcoming-events`). Ids must be unique across the whole app.
- Test id: same as the widget id with a `-widget` suffix, or just
  `<module>-widget` when the module only has one.

**Order values**

`order` controls global widget ordering, not per-module. Choose values with
gaps (10, 20, 30, …) so future widgets can slot in without renumbering. The
default is `100`; widgets without an explicit order land at the bottom in
declaration order.

**Data fetching**

- Use a React Query hook from your module's `hooks/` directory. The widget
  benefits from the same cache as the rest of the module — the dashboard
  won't refetch data the user already loaded elsewhere.
- Always render an `isLoading` branch and an empty branch. Avoid showing
  `0` with no context; phrase the empty state in plain English.
- Don't pass props in. If a widget needs configuration, wire it through
  module flags (`HomeModule.flags`) and read the value with
  `useModuleFlag(...)`.

**Visuals**

- Wrap the body in `<WidgetCard>` rather than a custom container. The
  dashboard relies on consistent card geometry.
- Keep widgets compact. The dashboard column is `max-w-3xl`; widgets that
  need more space should link out to a full-page view via the title `href`.
- Use the project palette (`text-text-main`, `text-text-muted`,
  `font-display`, `font-body`, `bg-bg-pearl`, `text-brand-navy`, etc.).

**Performance**

- Widgets render on the dashboard regardless of which module the user is
  about to use, so cheap data fetches matter. Prefer queries that the rest
  of the app already runs.
- Skip widgets that depend on data the dashboard user can't see — gate them
  with module flags or visibility checks rather than rendering an empty card.

**Don'ts**

- Don't import another module's components into your widget. Modules stay
  self-contained.
- Don't accept props on a widget component. The registry contract is
  zero-prop components.
- Don't write data from a widget. Widgets are read-only summaries; provide
  a CTA that links into the module for mutations.

---

## Existing Widgets

The current widgets in the repo (good references when you write your own):

| Module     | Widget                                                                 | Id                          | Order |
|------------|------------------------------------------------------------------------|-----------------------------|-------|
| Groceries  | `frontend/src/modules/groceries/components/GroceriesWidget.tsx`        | `groceries-remaining`       | 10    |
| People     | `frontend/src/modules/people/components/UpcomingEventsWidget.tsx`      | `people-upcoming-events`    | 20    |

Find the latest list with:

```bash
grep -rn "widgets:" frontend/src/modules/*/module.config.ts
```
