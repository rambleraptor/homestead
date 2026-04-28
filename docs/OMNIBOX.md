# Omnibox

The Omnibox is Homestead's natural-language command bar. A user types
something like _"add milk to groceries"_ or _"show me Sarah"_ and the
app either jumps to the matching module's list view (with filters
prefilled) or opens an action form (with fields prefilled).

This guide covers what the Omnibox does at runtime and how to add
support for it from a new module.

## Table of Contents

- [User-Facing Behavior](#user-facing-behavior)
- [Architecture](#architecture)
- [Adding Omnibox Support to a Module](#adding-omnibox-support-to-a-module)
  - [Step 1 — Pick synonyms](#step-1--pick-synonyms)
  - [Step 2 — Wire the list component](#step-2--wire-the-list-component)
  - [Step 3 — (Optional) Declare filters](#step-3--optional-declare-filters)
  - [Step 4 — (Optional) Add forms](#step-4--optional-add-forms)
  - [Step 5 — Register the adapter on the module](#step-5--register-the-adapter-on-the-module)
- [Worked Examples](#worked-examples)
- [Access Control](#access-control)
- [Testing](#testing)
- [Reference](#reference)

---

## User-Facing Behavior

- **Entry points:** the magnifying-glass button in the header and the
  `/search` page.
- **Input:** a single-line text box. Submit with **Enter**.
- **Output:** rendered inline on `/search`. The Omnibox decides between
  two intent shapes:
  - **List intent** — renders the target module's list/home component,
    optionally seeded with filter values.
  - **Form intent** — renders one of the module's declared action forms
    with prefilled values. After a successful submit, the dispatcher
    automatically swaps to the same module's list view so the user sees
    the new record.
- **Banner:** the matched module + intent rationale show above the
  result, including a "fallback" badge when keyword matching was used
  instead of the LLM.

## Architecture

Code lives under `frontend/src/shared/omnibox/`:

| File | Responsibility |
|---|---|
| `types.ts` | `OmniboxAdapter`, `OmniboxForm`, `OmniboxIntent`, `OmniboxParseResponse` |
| `manifest.ts` | Builds the JSON manifest fed to the LLM by walking the module registry |
| `parseFallback.ts` | Deterministic keyword scorer used when the LLM is unavailable |
| `useOmniboxParse.ts` | React Query mutation that POSTs to `/api/omnibox/parse` |
| `OmniboxInput.tsx` | The search-bar input |
| `OmniboxDispatcher.tsx` | Routes a parsed intent to either list or form view |
| `OmniboxListView.tsx` | Renders the module's `listComponent` with filter seed |
| `OmniboxFormView.tsx` | Resolves the form, validates prefill, wires submit + toast |
| `useCanUseOmnibox.ts` | Visibility gate (superuser or `settings.omnibox_access === 'all'`) |

The server-side parser is at
`frontend/src/app/api/omnibox/parse/route.ts`. It takes the user's
query and the module manifest and returns an `OmniboxIntent`. When a
`GEMINI_API_KEY` is configured it asks Gemini 2.5 Flash; otherwise it
uses the keyword scorer in `parseFallback.ts`. The page that hosts it
all is `frontend/src/app/(app)/search/page.tsx`.

The flow at a glance:

```
user query
    │
    ▼
useOmniboxParse  ──►  POST /api/omnibox/parse  ──►  Gemini  (or  parseFallback)
    │                                                    │
    └────────────────────  OmniboxIntent  ◄──────────────┘
                                │
                                ▼
                        OmniboxDispatcher
                          ├── kind: 'list'  →  OmniboxListView   →  module.omnibox.listComponent
                          └── kind: 'form'  →  OmniboxFormView   →  form.render() → form.useMutation()
                                                                          │
                                                                          └─ on success → swap to list view
```

## Adding Omnibox Support to a Module

A module opts in by setting an `OmniboxAdapter` on its `module.config.ts`:

```ts
omnibox?: {
  synonyms: string[];
  listComponent: ComponentType;
  forms?: OmniboxForm[];
};
```

That's the entire surface. Filters live separately on
`HomeModule.filters` (so the visible `<FilterBar>` and the manifest
read from one source).

### Step 1 — Pick synonyms

`synonyms` is the bag of words the LLM (and fallback) match queries
against. Include the module's own name, common shorthands, and likely
nouns from typical user phrasing. For a Chores module, for example,
`['chores', 'task', 'tasks', 'todo', 'todos']`.

### Step 2 — Wire the list component

`listComponent` is the component the dispatcher renders for a list
intent. It should be the same top-level list/home component the module
already renders at its base route. The component reads any seeded
filter values through the existing `<ModuleFiltersProvider>` context,
so list intents with filters "just work" if your list already uses the
shared filter machinery.

```ts
import { ChoresHome } from './components/ChoresHome';

export const choresOmnibox: OmniboxAdapter = {
  synonyms: ['chores', 'task', 'tasks', 'todo', 'todos'],
  listComponent: ChoresHome,
};
```

### Step 3 — (Optional) Declare filters

Filters are declared at the module top level, **not** on the adapter:

```ts
filters: [
  {
    key: 'name',
    label: 'Name',
    type: 'text',
    description: "A substring of the chore's name.",
  },
],
```

The `description` is shown to the LLM, so write it as if you were
explaining the field to a non-developer. The same decls drive the
rendered `<FilterBar>` for the module's list page.

### Step 4 — (Optional) Add forms

A form lets the Omnibox jump straight into an action — "add milk to
groceries" creates a grocery item without an extra navigation step.
Each form is an `OmniboxForm`:

```ts
export interface OmniboxForm<TValues = Record<string, unknown>> {
  id: string;                              // e.g. 'create-chore'
  label: string;                           // shown in the inline banner
  description: string;                     // shown to the LLM
  render: (props: {
    initialValues: Partial<TValues>;
    onSubmit: (values: TValues) => Promise<void>;
    onCancel: () => void;
    isSubmitting: boolean;
  }) => ReactNode;
  useMutation: () => {
    mutateAsync: (values: TValues) => Promise<unknown>;
    isPending: boolean;
  };
  paramSchema: z.ZodType<Partial<TValues>>;
  successMessage?: (values: TValues) => string;
}
```

Notes:

- `paramSchema` is a Zod schema describing the values the LLM may
  prefill. Make every field `optional()` — the LLM only fills what it
  can extract from the user's query. The shared form view runs
  `paramSchema.safeParse(prefill)` before rendering and silently drops
  invalid fields.
- `render` takes `initialValues`, `onSubmit`, `onCancel`,
  `isSubmitting` and returns the module's existing form component
  (wrap, don't rewrite). Using a render function lets each module
  bridge to its own form prop shape without a new wrapper file.
- `useMutation` should return your existing React Query mutation.
- `successMessage` produces the toast text on success. The dispatcher
  also automatically swaps to the list view on success.

### Step 5 — Register the adapter on the module

Import the adapter and assign it on the module config:

```ts
import { choresOmnibox } from './omnibox';

export const choresModule: HomeModule = {
  id: 'chores',
  name: 'Chores',
  // …other fields…
  omnibox: choresOmnibox,
  filters: [/* optional filter decls */],
};
```

The registry picks it up automatically — there's no separate registration
step. After a server restart the new module appears in the manifest fed
to the parser.

## Worked Examples

### Minimal: list-only adapter

The dashboard module declares the smallest possible adapter — no forms,
no filters. From `frontend/src/modules/dashboard/module.config.ts:22`:

```ts
omnibox: {
  synonyms: ['dashboard', 'home', 'overview', 'summary'],
  listComponent: DashboardHome,
},
```

A query like _"go home"_ resolves to a list intent for `dashboard` and
just renders `DashboardHome`.

### List + filters

People declares a `name` filter at the module level so queries like
_"show me Sarah"_ render the People list seeded with
`{ name: 'Sarah' }`. From
`frontend/src/modules/people/module.config.ts:27`:

```ts
omnibox: peopleOmnibox,
filters: [
  {
    key: 'name',
    label: 'Name',
    type: 'text',
    description:
      "A substring of the person's name. Used by the People list's name filter.",
  },
],
```

### List + form

Groceries adds a single `add-grocery-item` form. From
`frontend/src/modules/groceries/omnibox.tsx:134`:

```ts
const createGroceryItemParamSchema = z.object({
  name: z.string().optional(),
  notes: z.string().optional(),
  store: z.string().optional(),
});

export const groceriesOmnibox: OmniboxAdapter = {
  synonyms: ['groceries', 'grocery', 'shopping', 'list', 'food', 'produce', 'supermarket'],
  listComponent: GroceriesList,
  forms: [
    {
      id: 'add-grocery-item',
      label: 'Add grocery item',
      description: 'Add an item to the grocery shopping list.',
      paramSchema: createGroceryItemParamSchema,
      useMutation: () => {
        const m = useCreateGroceryItem();
        return {
          mutateAsync: (values) => m.mutateAsync(values as GroceryItemFormData),
          isPending: m.isPending,
        };
      },
      render: ({ initialValues, onSubmit, onCancel, isSubmitting }) => (
        <AddGroceryForm
          initialValues={initialValues as Partial<GroceryItemFormData>}
          onSubmit={(v) => onSubmit(v as Record<string, unknown>)}
          onCancel={onCancel}
          isSubmitting={isSubmitting}
        />
      ),
      successMessage: (values) =>
        `Added ${typeof values.name === 'string' ? values.name : 'item'} to groceries`,
    },
  ],
};
```

A query like _"add milk to groceries at Whole Foods"_ resolves to a
form intent with `{ name: 'milk', store: 'Whole Foods' }`. The
`AddGroceryForm` renders with those values prefilled, the user
confirms, and the dispatcher swaps to `GroceriesList` on success.

## Access Control

Visibility of the Omnibox is gated by the `settings.omnibox_access`
module flag (see `useCanUseOmnibox.ts`):

- **Superusers** always see the search button and `/search` page.
- **Other users** see them only when the household has flipped
  `settings.omnibox_access` to `'all'`.

The same gate runs server-side inside `/api/omnibox/parse`, so a user
who can't see the UI also can't call the endpoint directly.

## Testing

- **Unit:**
  `frontend/src/shared/omnibox/__tests__/OmniboxDispatcher.test.tsx`
  exercises list rendering, the "intent not recognized" banner, the
  unknown-module error, and the fallback flag. When you add a new form,
  add a unit test that mounts the dispatcher with a `kind: 'form'`
  intent and asserts your render function runs.
- **Manifest:** if your module relies on the LLM picking the right
  synonyms, sanity-check by running the dev server and trying the
  phrasings you'd expect users to type. The fallback scorer also lets
  you verify routing without a `GEMINI_API_KEY` set — useful in CI and
  local dev.
- **E2E:** existing modules with Omnibox forms have Playwright POMs
  that hit `/search`. Follow that pattern when adding flows you want
  covered end-to-end.

## Reference

- Types: `frontend/src/shared/omnibox/types.ts`
- Manifest builder: `frontend/src/shared/omnibox/manifest.ts`
- Parse endpoint: `frontend/src/app/api/omnibox/parse/route.ts`
- Fallback scorer: `frontend/src/shared/omnibox/parseFallback.ts`
- Dispatcher: `frontend/src/shared/omnibox/OmniboxDispatcher.tsx`
- Page: `frontend/src/app/(app)/search/page.tsx`
- Visibility gate: `frontend/src/shared/omnibox/useCanUseOmnibox.ts`
- Module hook into the system: `HomeModule.omnibox` /
  `HomeModule.filters` in `frontend/src/modules/types.ts`
