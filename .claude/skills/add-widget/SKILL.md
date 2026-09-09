---
name: add-widget
description: Add a dashboard widget to an existing Homestead app — a self-contained lazy React component wired via the app config's `widgets` array. Use when the user asks to "add a widget", "show X on the dashboard", or "add a dashboard card for <app>".
---

# Add a Dashboard Widget

Apps contribute widgets to the dashboard through the `widgets` array on
their `AppConfig`. Each widget is an independent React component that
owns its own data fetching and chrome; the dashboard just lays widgets
out in `order`. Users can hide and reorder widgets from the dashboard
customization UI, so a widget must work standalone with zero props.

## The contract

`DashboardWidget` (in `@rambleraptor/homestead-core/apps/types`):

- `id` — stable and **unique across all apps**; prefix with the app id
  (e.g. `events-countdown`).
- `label` — shown in the dashboard customization UI (falls back to `id`).
- `component` — lazily loaded, receives **no props**:
  `() => import('./components/FooWidget').then((m) => m.FooWidget)`.
  Never import the component eagerly in `app.config.ts` — configs must
  stay free of React imports so the server can load them.
- `order` — lower renders first; default 100.

## Steps

### 1. Create the component

`packages/homestead-apps/<app>/components/<Name>Widget.tsx` (or the
core package for core apps). Pattern after an existing one, e.g.
`packages/homestead-apps/events/components/CountdownWidget.tsx`.

- Fetch data with the app's existing hooks — never add new data access
  inside the widget when a hook exists.
- Wrap content in the shared `SectionCard` chrome like the other
  widgets do.
- Handle the loading and empty states — the widget renders on everyone's
  dashboard, including users with no data yet.
- Put `data-testid` on the root and any interactive elements.
- Keep it read-mostly: link into the app (`react-router` `Link` to the
  app's base path, `/<app-id>`) for anything heavier than a quick action.

### 2. Wire it into the app config

In the app's `app.config.ts`, under the config's `web` object:

```ts
web: {
  // ...icon, routes...
  widgets: [
    {
      id: '<app>-<widget>',
      label: 'Human label',
      component: () =>
        import('./components/FooWidget').then((m) => m.FooWidget),
      order: 30,
    },
  ],
},
```

Pick `order` relative to the existing dashboard (grep `order:` across
`widgets:` blocks to see the current layout).

### 3. Test

- Vitest test under the app's `__tests__/` rendering the widget with
  the mocked aepbase client (see `src/test/setup.ts` conventions) —
  cover the data, loading, and empty states.
- `make ci && make test`.
- Visual check: boot the dev server and confirm the widget appears on
  the dashboard and can be hidden/reordered from the customization UI
  (it's picked up automatically — registration is just the config entry).

## Notes

- Nested/child apps' widgets are aggregated by the registry through the
  parent — declare them on whichever app owns the component.
- No new resources, flags, or routes are involved; if the widget needs
  data the app doesn't store yet, that's an add-resource task first.
