# App Flags

A flag is one typed value (`string`, `number`, `boolean`, or `enum`) shared
across the whole household — a feature toggle, a default store, anything too
small to deserve its own resource. You declare it in your app's
`app.config.ts` and read or write it with the `useAppFlag` hook. Operators can
edit any flag from the superuser Flag Management UI at
`/superuser/flag-management`.

## Table of Contents

- [Quick Start](#quick-start)
- [Declaring a Flag](#declaring-a-flag)
- [Reading and Writing a Flag](#reading-and-writing-a-flag)
- [Gating Your App on Visibility](#gating-your-app-on-visibility)
- [Gotchas](#gotchas)

---

## Quick Start

```ts
// 1. Declare the flag in your app's config.
// packages/homestead-apps/groceries/app.config.ts
export const groceriesApp: AppConfig = {
  id: 'groceries',
  // ...
  flags: {
    default_store: {
      type: 'string',
      label: 'Default store',
      description:
        'Store id pre-selected when adding new grocery items. Leave blank for no default.',
      default: '',
    },
  },
};
```

```tsx
// 2. Read or write it from any component.
import { useAppFlag } from '@rambleraptor/homestead-core/settings';

function DefaultStoreBadge() {
  const { value, setValue, isLoading } =
    useAppFlag<string>('groceries', 'default_store');

  if (isLoading) return null;
  return <span>Default store: {value || 'none'}</span>;
}
```

A flag with a `default` never returns `undefined`. The Flag Management
UI picks up the new flag automatically.

---

## Declaring a Flag

Flag declarations live on your app's `AppConfig` config under `flags`.
Each entry follows `AppFlagDef`:

```ts
export type AppFlagDef =
  | { type: 'string';  label: string; description: string; default?: string }
  | { type: 'number';  label: string; description: string; default?: number }
  | { type: 'boolean'; label: string; description: string; default?: boolean }
  | { type: 'enum';    label: string; description: string;
      options: readonly string[]; default?: string };
```

### Required vs. optional

- `label` — human-readable name, shown in the admin UI.
- `description` — one-line explainer, also shown in the admin UI.
  Required so operators always know what they're toggling.
- `default` — optional but **strongly recommended**. Without it, callers
  may see `undefined` until a value is written.
- `options` — required for `enum`, must be a tuple of strings.

### Naming

- App ids stay **kebab-case** (`gift-cards`).
- Flag keys must be **snake_case** (`show_archived`, `default_store`).

### Example: enum flag

```ts
// packages/homestead-apps/<feature>/app.config.ts
export const THEME_OPTIONS = ['light', 'dark'] as const;

export const exampleApp: AppConfig = {
  // ...
  flags: {
    theme: {
      type: 'enum',
      label: 'Theme',
      description: 'Color theme for the app.',
      options: THEME_OPTIONS,
      default: 'light',
    },
  },
};
```

Export the option tuple as a `const` so you can reuse it for narrow
call-site types.

---

## Reading and Writing a Flag

The single public hook is `useAppFlag` from
`@rambleraptor/homestead-core/settings`:

```ts
const { value, setValue, isLoading, isSaving, error } =
  useAppFlag<MyType>('app-id', 'flag_key');
```

| Field       | Description                                                    |
| ----------- | -------------------------------------------------------------- |
| `value`     | Current value, falling back to the declared default.           |
| `setValue`  | `(next) => Promise<void>` — writes the new value.              |
| `isLoading` | `true` while the value is first being fetched.                 |
| `isSaving`  | `true` while a `setValue` mutation is in flight.               |
| `error`     | Non-fatal fetch error (treated as "no value yet").             |
| `audience`  | Who the stored value applies to ([below](#rolling-a-flag-out-to-a-group)). |
| `inAudience`| Whether the signed-in person is in that audience.              |
| `storedValue` | The stored value regardless of audience (what Flag Management edits). |
| `setAudience` | `(audience) => Promise<void>` — changes who the value applies to. |

### Type narrowing

Pass the value type as a generic so call sites stay type-safe:

```ts
type Theme = 'light' | 'dark';
const { value } = useAppFlag<Theme>('settings', 'theme');
//      ^? Theme | undefined
```

`value` is only `undefined` if you didn't declare a `default`.

### Writing without reading

If you only need to write (e.g. an admin form), use the lower-level
`useUpdateAppFlag` hook. Import it from its hooks path — it isn't
re-exported from `@rambleraptor/homestead-core/settings`:

```ts
import { useUpdateAppFlag } from '@rambleraptor/homestead-core/settings/hooks/useUpdateAppFlag';

const update = useUpdateAppFlag();
await update.mutateAsync({ appId, key, value });
```

---

## Rolling a Flag Out to a Group

A flag's stored value applies to an **audience**: everyone (the default),
nobody, or the members of chosen groups. Anyone outside the audience reads the
flag's declared default, as if nothing had been set. That's how a new
experience is tried on a few people first:

1. In **Superuser → Permissions**, make a group (say, "Beta") and add the
   people who want to try it.
2. In **Flag Management**, set the flag, then change its **Applies to** from
   "everyone" to "these groups" and tick Beta.
3. When it's ready for the household, switch **Applies to** back to
   "everyone".

`useAppFlag`'s `value` already accounts for this, so a component needs no
extra check. The audience rides in a sibling field on the `app-flags` record
(`<flag>__audience`, a JSON list of group names; empty for everyone), which
the schema sync adds for every declared flag. Server-side reads
(`readAppFlag`) see the stored value and ignore audiences — they're for what
people see, not for how the server runs.

---

## Gating Your App on Visibility

Every app automatically receives an `enabled` flag, even without
declaring one. It's an `enum` flag with these options, defaulting to your
app's `defaultEnabled` config value (or `'all'` if unset):

| Value        | Meaning                                                       |
| ------------ | ------------------------------------------------------------- |
| `superusers` | Visible to superusers only (good for unfinished work).        |
| `all`        | Visible to all authenticated users.                           |
| `none`       | Hidden from everyone, including superusers.                   |
| `tagged`     | Visible only to users whose account `tags` intersect the app's `enabled_tags` flag (any-of). |

A sibling `enabled_tags` flag (a comma-separated tag list) is also
auto-injected for the `'tagged'` case. Both keys are reserved — don't
declare your own `enabled` or `enabled_tags` flag.

To gate your UI on visibility, use `useIsAppEnabled`:

```ts
import { useIsAppEnabled } from '@rambleraptor/homestead-core/settings';

const enabled = useIsAppEnabled('groceries');
if (!enabled) return null;
```

`useIsAppEnabled` (and the bulk-predicate variant
`useAppEnabledPredicate`) handle the role/tag check against the
current user.

---

## Gotchas

1. **Defaults are guaranteed at the call site.** A flag that declares a
   `default` never returns `undefined` — the default is always merged in.
   If you skip `default`, expect `undefined` until something is written.

2. **Household-wide, not per-user.** All flags share one stored value for
   the whole household; the only per-person variation is its audience
   ([above](#rolling-a-flag-out-to-a-group)). Flags are "household toggles",
   not user preferences. For per-user state, use an app's `userSettings`
   (backed by the `user-preference` resource; see CLAUDE.md).

3. **No realtime cross-tab sync.** Writing a flag updates the current tab
   immediately, but other tabs see the new value only on their next
   refetch. If you need instant cross-tab sync, layer your own
   `BroadcastChannel` on top.

4. **Don't redeclare `enabled` / `enabled_tags`.** They're auto-injected
   on every app and will override any declaration you add. Set
   `defaultEnabled` on the `AppConfig` config instead if you want a
   non-`'all'` default.
