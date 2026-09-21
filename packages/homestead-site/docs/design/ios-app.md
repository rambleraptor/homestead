# iOS app — Design

**Status:** Proposal · **Audience:** contributors

> This is a design and decision record, not a guide. It answers one question:
> what an iOS app for Homestead should be, given that the web UI is already
> the product. The answer is deliberately small: the regular Homestead web UI
> in a native shell, plus the two things a web page cannot be — home-screen
> and lock-screen **widgets**, and **App Intents** so Siri and Shortcuts can
> read and write Homestead resources.

---

## 0. The shape of the answer

The iOS app does not re-implement any screen. It is:

| Part | What it is | Native code |
|---|---|---|
| **The shell** | A `WKWebView` showing the instance's web UI, full screen, with the instance URL as the only setup | Small: first-run URL, the web view host, a session bridge |
| **Widgets** | Every dashboard widget an app declares, as a WidgetKit widget on the home and lock screen, rendered from a declarative descriptor the server publishes | A generic timeline provider plus five widget templates |
| **App Intents** | Siri, Shortcuts, Spotlight, and interactive-widget actions over Homestead resources: generic ones that work on any app, typed ones for the frequent phrases | Entities, queries, and intents over a thin client |

Everything native shares one small library, `HomesteadKit`: the AEP client,
the session in the Keychain, and a cache of the records widgets and intents
need. The web UI keeps its own offline story, its own navigation, its own
login screen; the shell only mirrors its session into the Keychain so the
widgets and intents can act as the same user when the web view isn't running.

The server grows three things, all additive and useful beyond iOS: a
whole-instance manifest that carries widget descriptors and per-resource
display hints (§7.1–7.2), a server-computed `todos:today` method so the
cross-app Today card can be a widget (§7.3), and a native-host mode in the
SPA's auth strategy (§7.4).

What this design gives up, and why that's fine: a native list screen would
feel nicer than the web one, but it would be a second implementation of every
app, including the operator's own — the thing that made the earlier
full-native draft of this document large. The web UI already works on a phone
(chromeless mode, offline queue, per-app home-screen manifests); what it can't
do is sit on the lock screen or answer Siri. This design does exactly those.

---

## 1. Principles

1. **The web UI is the app.** Any screen a user sees inside the shell is the
   SPA, unmodified, served by their instance. A fix to a web screen ships to
   iOS the moment the server rebuilds; there is no iOS release for it.
2. **The instance is the product.** No Homestead-the-project account. First run
   asks for a server URL, the same way `homestead login` does, and everything
   the app knows comes from that server.
3. **Native only where a web page can't go.** Widgets and intents, and the
   plumbing they need (a session in the Keychain, a client, a cache, background
   refresh). Nothing else — no native chrome, no native forms, no second
   navigation.
4. **Same paths everywhere.** A widget's tap, an intent's "Open", a
   notification's `url`, and a Universal Link all land on an SPA route
   (`/todos`, `/documents/abc`). There is no second vocabulary of places.
5. **Server-side rules stay server-side.** Access, tags, app gating, and
   reference `onDelete` are enforced by the engine; widgets and intents go
   through the same `/api/aep` gateway as the browser and see exactly what the
   user may see.

---

## 2. The shell

### 2.1 First run

```
┌──────────────────────────────┐
│                              │
│        ⌂  Homestead          │
│                              │
│  Your household's server     │
│  ┌────────────────────────┐  │
│  │ https://home.example.  │  │
│  └────────────────────────┘  │
│  ● Reachable · signed out    │
│                              │
│  [        Continue        ]  │
│                              │
│  or scan the QR code from    │
│  Settings on another device  │
└──────────────────────────────┘
```

The one native screen. The URL field probes `GET /api/health`; a QR code on
the web app's Settings page encodes the URL (nothing else) so the rest of the
household never types it. After Continue, the web view loads the instance and
the SPA takes over — including sign-in, and the first-visit claim form on an
unclaimed instance. Multiple instances are a list behind a long-press on the
app icon and in the widget/intent configuration; switching swaps the web
view's data store, the Keychain session, and the cache as a unit.

### 2.2 The web view

A single `WKWebView`, full screen behind the safe areas, loading the
instance's origin with the SPA's normal chrome (the sidebar and header are
the app's navigation; the shell adds none). Specifics that make a wrapped
site feel like an app:

| Concern | Behaviour |
|---|---|
| Origin | Navigation is confined to the instance origin. External links open in `SFSafariViewController`; `window.open` is routed the same way |
| Camera and files | `<input type="file" capture>` already works in `WKWebView` — the groceries photo import and document upload need nothing extra |
| Back | Edge-swipe back is enabled on the web view (`allowsBackForwardNavigationGestures`), matching the SPA's history |
| Pull to refresh | A `UIRefreshControl` that reloads the current route; the SPA's own data refetch handles the rest |
| Offline | The SPA's offline banner and queue work unchanged; the shell shows nothing of its own. A failed *initial* load (no cache yet, no network) gets a native retry page |
| Foreground | On return to foreground the shell hands the SPA the current session (§2.3) and the SPA's existing app-version poll picks up a rebuilt SPA |
| Universal Links | `https://home.example.com/anything` opens the app and loads that path in the web view; the server serves the association file (§7.5) |
| Home-screen icon | The app's own. The per-app "Add to Home Screen" manifests remain for the browser; on iOS a per-app launcher **widget** (§3.5) replaces them |
| Data store | One `WKWebsiteDataStore` per instance, so two households never share `localStorage` |

Nothing here needs a change to the SPA except the session bridge below.

### 2.3 The session bridge

Widgets and intents must act as the signed-in user while the web view is
not running, so the session cannot live only in the page's `localStorage`.
Today the SPA owns it: `api/aepbase.ts` stores the access and refresh tokens
in `localStorage` and rotates them against `POST /api/auth/refresh`. The
bridge makes the **Keychain the source of truth** and lets whichever side is
running do the refresh:

```
web view (SPA)                        native (HomesteadKit)
──────────────                        ─────────────────────
boot: session ← bridge.get()   ◄───   Keychain (App Group)
login / refresh / logout       ────►  bridge.set(session) → Keychain
                                      widget or intent runs while the app is closed:
                                        access token expired → native refreshes,
                                        writes the new pair to the Keychain
foreground: session ← bridge.get()  ◄─ (picks up native's rotation before any request)
```

- The SPA detects the host through a `window.webkit.messageHandlers.homestead`
  handler and swaps its auth strategy for `nativeSession()` (§7.4), a sibling
  of the existing `browserSession()` in `@rambleraptor/homestead-client`. The
  strategy reads the session from the bridge instead of `localStorage`, and
  reports every login, rotation, and logout back to it. The login screen, the
  federated Google flow, and change-password are untouched — they are web
  pages.
- Only one side rotates at a time by construction: the SPA only while the
  page is alive and foreground; native only when no web view is running.
  Both re-read the Keychain before their first request after a hand-off.
- Sign out in the web UI clears the Keychain; `logout-all` on another device
  makes the next native refresh fail, and the widget shows "Signed out — open
  Homestead" until the user signs in again.
- The Keychain item uses `kSecAttrAccessibleAfterFirstUnlock` so background
  widget refresh works with the phone locked, and it is excluded from iCloud
  Keychain (a session is bound to a device).
- An optional Face ID / passcode gate on app open is a shell-level setting; it
  covers the web view, not the widgets (which show what any glance at a lock
  screen shows: nothing marked private — §5.4).

---

## 3. Widgets (WidgetKit)

The dashboard is the web app's answer to "what now"; on a phone that answer
belongs on the home screen and the lock screen, where it costs no tap. Every
dashboard widget an app declares becomes a WidgetKit widget, rendered from a
declarative descriptor the server publishes (§7.2). An app author declares a
widget once and gets the web dashboard (their React component) and WidgetKit
(the descriptor) from one entry in `app.config.ts`.

### 3.1 The shipped widgets, and what each becomes

| Widget | Descriptor kind | Home screen | Lock screen | Configurable |
|---|---|---|---|---|
| `todos-today` (the cross-app Today card) | `remote` — a server-computed payload (§7.3) | Medium / large: up to 3 / 8 lines, urgency-colored | Rectangular: the top line; inline: "Bins tonight · 4 todos" | — |
| `todos-active` | `list` over `todo`, `status == "pending" && in_main == true` | Small: count; medium: first 4 titles, each with a checkbox | Circular: count | Project |
| `groceries-remaining` | `count` over `grocery`, `checked == false` | Small: "7 left" with the store breakdown; medium: the first few unchecked items with checkboxes | Circular: count | Store |
| `events-countdown` | `countdown` over `event`, id from the `countdown_event_id` flag, cells from the `show_*` flags | Small: days; medium: the flag-selected cells | Inline: "Costa Rica in 42 days" | Event (overrides the household flag for this one widget) |
| `events-upcoming` | `list` over `event`, next N by month/day | Medium: 4 rows with relative day labels | Rectangular: next one | — |
| `credit-cards-upcoming-perks` | `list` over `perk`, closing within the urgent window | Medium: perk, card, days left, value | Rectangular: the most urgent | — |
| `home-next-pickup` | `next-date` over `garbage-pickup`, `pickup_date >= today` | Small: "Tomorrow · Recycling + garbage"; medium: the following days too | Rectangular: next day + stream chips; inline: "Bins tonight" | — |

A widget with no `native` block is simply not offered. The set the user has
hidden on the web dashboard is not consulted: placing a widget is already an
explicit choice.

```
┌ small ──────────┐  ┌ medium ──────────────────────────┐  ┌ lock screen ───────┐
│ Groceries       │  │ Today                            │  │ ▣ Bins tonight     │
│                 │  │ ● Bins go out tonight            │  │   Recycling+garbage│
│   7 left        │  │ ● Call the vet                   │  └────────────────────┘
│ Costco 4 · TJ 3 │  │ ● Maya's birthday is Thursday    │  ◔ 7   (circular: count)
└─────────────────┘  │ ○ Costco: 4 items               ›│
                     └──────────────────────────────────┘
```

### 3.2 The Today card is the interesting one

On the web, Today is assembled client-side from six sibling hooks through
pure lane builders (`todos/today/lanes.ts`: `buildPickupItems`,
`buildPerkItems`, …, each `(data, now) → TodayItem[]`). A widget can't run
six queries on a timeline budget, and re-implementing "is this today" in
Swift would be the second copy the hook's own comment warns against. So Today
becomes a **collection custom method**, `POST /api/aep/todos:today`, that
fetches the same six inputs server-side with the caller's token, runs the same
lane builders (they are pure and already take `now` as an argument, so they
move to a shared module unchanged), and returns the sorted `TodayItem[]`. The
React widget may keep composing client-side or call the method; the widget
reads the method. This is the `remote` descriptor kind: any widget whose logic
is more than a filter declares a method returning a fixed payload —
`{ headline?, rows: [{ title, detail?, urgency?, link }], link }` — and the
widget renders it with one template.

### 3.3 How a widget gets its data

The widget extension and the app share an App Group container holding the
Keychain session and a small on-disk cache, so a widget renders from cache
instantly, then asks the network. The timeline provider is one generic
implementation over the descriptor:

```
timeline(for configuration):
  entry(now)   ← evaluate the descriptor against the cache
  refresh at   ← the next moment the answer can change:
                 countdown / next-date → local midnight
                 pickup                → 18:00 the evening before (matches the reminder cron)
                 count / list / remote → +30 min, capped by WidgetKit's daily budget
  in the background, fetch the descriptor's query; if it differs, reload
```

Reloads outside that schedule: any write the app or an intent makes
(`WidgetCenter.reloadTimelines` after it lands), app foreground, and — when
the instance has APNs configured (§6) — a `content-available` push.

### 3.4 Interactive rows and configuration

- **Interactive (iOS 17+).** A `list` row can carry a checkbox bound to an App
  Intent (§4): tick a grocery item or complete a todo on the home screen
  without launching the app. Only one-tap idempotent writes are offered this
  way (`checked = true`, `status = completed`); anything with a form opens the
  app at the record's route.
- **Configuration.** A widget that filters by a reference (store, project,
  event) is an `AppIntentConfiguration` whose parameter is the matching entity
  (§4.2), so the configuration sheet offers a picker from the cache. Every
  configuration also carries the instance.
- **Deep links.** Each widget's `widgetURL` is the descriptor's `link` on the
  instance origin — a Universal Link into the shell, and a plain web link
  anywhere the app isn't installed.

### 3.5 The launcher widget

A small widget that is just an app's icon and name, opening its `basePath`.
It replaces the browser's per-app "Add to Home Screen" for people who used
that, using the same `web.homeScreenIcon` PNGs, and needs no descriptor — the
manifest already lists every app the user may open.

### 3.6 Later, noted

Live Activities for a recipe in cook mode (step timer on the Dynamic Island)
and for a shopping trip (items left, on the lock screen while at the store).
Both are natural but need per-activity push tokens, so they wait on §6.

---

## 4. Siri and Shortcuts (App Intents)

Everything a person does more than once a day in Homestead is a sentence:
"add milk", "what's on the list", "when is bin night", "how much is left on
the REI card". App Intents makes those sentences work from Siri, the
Shortcuts app, Spotlight, the Action button, and interactive widgets, with
one definition each.

### 4.1 Two layers

*Generic intents* work on any app the instance runs, including operator apps,
using the schema the way the CLI and the MCP surface do:

| Intent | Parameters | What it does |
|---|---|---|
| **Find records** | app (entity), resource (entity), text | Searches the cache (title/subtitle from the `display` hint, §7.1), falls back to the server; returns `RecordEntity` values Shortcuts can chain into other actions |
| **Open** | a `RecordEntity` | Opens the shell at the record's route |
| **Add to** | resource, title, optional notes | Creates a record with the `display.title` field set; anything more opens the shell at the resource's route with the title as a query parameter the SPA's create form would honour (a small SPA addition) |
| **Run** | a `RecordEntity`, a method | Runs an item-target custom method whose request schema is empty (`:download`, `:parse-receipt`) |

*Typed intents* ship for the frequent phrases, where a specific sentence
deserves a specific answer:

| Phrase (App Shortcut) | Intent | Runs in background | Result |
|---|---|---|---|
| "Add *milk* to my groceries" | `AddGroceryItem(name, store?)` | yes | Dialog "Added milk"; snippet: the store's remaining count |
| "What's on my grocery list" | `ShowGroceryList(store?)` | yes | Snippet view: unchecked items grouped by store, each a checkbox |
| "Check off *milk*" | `CheckOffGrocery(item)` | yes | Dialog; disambiguates from the cache when two match |
| "Add a todo: *call the vet*" | `AddTodo(title, project?)` | yes | Dialog; project defaults to main |
| "What's due today" | `WhatsDueToday()` | yes | Snippet: the `todos:today` payload, same rows as the widget |
| "Complete *call the vet*" | `CompleteTodo(todo)` | yes | Dialog |
| "When is bin night" / "What goes out" | `NextPickup()` | yes | "Recycling and garbage go out tomorrow evening" |
| "How much is on the *REI* card" | `GiftCardBalance(card)` | yes | Dialog + snippet with the balance; "Open" continues into the web UI |
| "Log that I cooked *chili*" | `LogCooked(recipe)` | yes | Creates the recipe's `log` child |
| "Scan a document" | `ScanDocument()` | opens the app | Opens the shell at `/documents` with a query parameter that opens the upload sheet (a small SPA addition) |
| "Ask Homestead *…*" | `AskHomestead(question)` | yes | Posts to `POST /api/chat`; the reply is the dialog. Registered only when the instance reports chat configured |

The last row is the escape hatch for the long tail: rather than an intent per
question, anything that isn't one of the frequent, fast actions above goes to
the assistant, which already has a tool per resource. Typed intents are for
the ten things you say weekly; chat is for the rest.

### 4.2 Entities and queries

`RecordEntity` is one `AppEntity` for the generic layer, with a stable id
(`instance + collection + id`), a display representation from the `display`
hint, and the app's icon. App Intents needs static property declarations, so
it exposes `title`, `subtitle`, `app`, `resource`, `url`, and `updated` —
enough for Shortcuts to filter and sort — rather than every field.

The typed layer has its own entities (`GroceryItemEntity`, `TodoEntity`,
`GiftCardEntity`, `RecipeEntity`, `StoreEntity`, `ProjectEntity`,
`EventEntity`), decoded from the same cached JSON. Every `EntityQuery`
resolves against the cache first — Siri's turnaround budget is short and the
cache is on disk — and only goes to the server on a miss. Suggested entities
(what Siri offers when a parameter is ambiguous) come from recency.

Entities from the typed apps are also indexed for **Spotlight**, so a gift
card or a recipe appears in system search with the app's icon and opens the
shell at its route. Records of a resource whose `access.model` is `private`
(Health) are never indexed and never appear in a widget.

### 4.3 Where the writes go

An intent runs as the signed-in user through `HomesteadKit`, so the engine's
access rules apply unchanged. Writes go straight to the server; if there is
no network the intent says so in its dialog ("I'll need a connection for
that") rather than pretending — the native side deliberately has no write
queue of its own, because two queues (the SPA's and a native one) would be
two things that can disagree about order. An intent on an instance with no
session returns `needsToContinueInApp`, and the shell opens on the web
login screen.

### 4.4 Naming, honestly

App Shortcut phrases must contain the app's name, so out of the box it is
"Add milk to *Homestead*". That reads fine for a generic build. An operator
build (§8) sets the display name in `Homestead.xcconfig`, and a household that
names the app after itself gets "add milk to Willow Street", which is how
people actually talk. The phrase list stays the same.

### 4.5 What falls out for free

Because the intents expose parameters and entities, users compose them with
no more code: "when I arrive at Costco, show the Costco list"; "every Sunday
at 18:00, what's due this week"; "when the Action button is pressed, scan a
document"; a Focus filter limiting Homestead's notifications to reminders
during Work. None of these are features to build.

---

## 5. What the native side is made of

```
packages/homestead-ios/
├── HomesteadKit/            Swift package, no UIKit — testable with `swift test` on Linux CI
│   ├── Client/              AEP client: list (page tokens), get, create, merge-patch, delete,
│   │                        custom methods (collection + item), manifest + definitions loaders
│   ├── Session/             Keychain-backed session, refresh rotation, the bridge's native half
│   ├── Schema/              Wire schema → field types, enums, references; `display` hints
│   ├── Widgets/             Descriptor evaluation → one of five entry shapes
│   └── Cache/               App-Group SQLite: (instance, collection, id, update_time, json)
├── Homestead/               The shell: first-run screen, WKWebView host, bridge, settings sheet
├── HomesteadWidgets/        WidgetKit extension: generic timeline provider + templates
├── HomesteadIntents/        App Intents, entities, queries, App Shortcuts, Spotlight indexing
└── Homestead.xcodeproj
```

### 5.1 The client

Hand-written and instance-agnostic: list with page tokens, get, create,
merge-patch, delete, invoke a custom method, load the manifest and the
resource definitions. Records are open JSON (`[String: JSONValue]`); the
typed entities in §4.2 are `Decodable` views over that JSON, so an operator
adding a field to `gift-card` breaks nothing. The engine's OpenAPI document
(`/api/aep/openapi.json`) is the reference the client is tested against, not
something it is generated from — the resource set is per-instance.

### 5.2 The cache

Deliberately small: it exists so widgets render instantly and entity queries
answer within Siri's budget, not to make the native side an offline client.
It holds the manifest, the definitions, the result of every placed widget's
query, and the collections the typed entities cover (grocery items, todos,
gift cards, recipes, stores, projects, events) — a few hundred rows per
household. It is refreshed by widget timelines, by `BGAppRefreshTask`, and on
app foreground, with a full re-list per collection (the engine doesn't yet
filter on `update_time`; §7.6 notes the two-line change that would make this
incremental, not required at this size).

### 5.3 Background refresh

`BGAppRefreshTask`, scheduled on every background: refresh the session if
close to expiry, re-list the cached collections, reload widget timelines,
update the inbox badge from the unread `notifications` count.

### 5.4 Privacy

- A resource with `access: { model: 'private' }` is excluded from the cache,
  from widgets, and from Spotlight, so nothing private is ever on a lock
  screen or in system search.
- The cache and the Keychain session live in the App Group container with
  file protection `completeUntilFirstUserAuthentication`, and are excluded
  from iCloud and iTunes backups.
- Signing out wipes both.

---

## 6. Notifications

Not the point of this design, but a consequence of it that has to be stated.
The web UI's push notifications are Web Push through a service worker, which
iOS delivers only to a Safari home-screen web app — **not** inside a
`WKWebView`. So on its own, the shell has no push at all, which would make it
worse than the PWA at the one thing bin night needs. Three ways to close that
gap, in order of cost:

| Option | What it gives | Cost |
|---|---|---|
| **Local scheduling** | The shell pulls the user's `scheduled-notification` queue on each background refresh and schedules each as a `UNNotificationRequest` — on time, offline, no key. Covers reminders, bin night, perk windows, event reminders: most of what a household is notified about | A background fetch; the inbox row is written by the server's dispatcher as today, so nothing double-records |
| **APNs** | Ad-hoc pushes too ("the grocery list was updated"), icon badges, `content-available` refreshes for widgets, notification actions bound to intents | A `.p8` key on the server — meaning the app's publisher's key. Fine for an operator-built app (§8); for a single App Store app it means a project-run relay, a service someone must operate |
| **Nothing** | Inbox polled on background refresh, badge only | — |

**Recommendation:** ship local scheduling in the first release; make the
server's `notification-subscription` able to hold an APNs token behind a
`PushSender` seam (§7.7) so an operator build can turn APNs on with its own
key; leave the relay as a later, separately-decided step. Whatever arrives,
tapping it opens the shell at the notification's `url`.

---

## 7. Server and SPA changes

All small, all additive.

### 7.1 A whole-instance manifest: `GET /api/app-manifest`

Today the route serves one app's PWA manifest (`/api/app-manifest/:id`). Add
the collection form, authenticated, returning the apps the *caller* may open
(access map and tags applied), each with `id`, `name`, `description`,
`basePath`, `homeScreenIcon`, `navOrder`, `section`, `widgets[]` (§7.2 shape
only), and the resource singulars it declares. Alongside, per resource, an
optional `display` hint on `ResourceDefinition` — the same one the MCP
`resource` surface and the chat search tool could use for display names:

```ts
display: {
  title: 'merchant',        // row title / entity title
  subtitle: 'amount',       // formatted by the field's type
  badge: 'status',          // an enum field, if any
  icon: 'gift',             // Lucide name; mapped to an SF Symbol on the phone
}
```

Carried on the wire as an `x-homestead-display` property extension, the way
`x-aepbase-reference` already is. Optional; a heuristic fills in what's
missing (first required string → title, an enum → badge).

### 7.2 Declarative widget descriptors

Add an optional `native` block to `DashboardWidget`:

```ts
{
  id: 'groceries-remaining',
  label: 'Groceries',
  order: 20,
  component: () => import('./components/RemainingWidget'),
  native: {
    kind: 'count',                              // 'count' | 'list' | 'countdown' | 'next-date' | 'remote'
    resource: 'grocery',
    filter: 'checked == false',
    groupBy: 'store',                           // optional; a reference field → one line per target
    format: '{count} left',
    link: '/groceries',
    check: { field: 'checked', value: true },   // optional: makes rows interactive (§3.4)
    configure: 'store',                         // optional: a reference field the user can pin
  },
}
```

| Kind | Fields | Renders |
|---|---|---|
| `count` | `resource`, `filter`, `format`, optional `groupBy` | A number, optionally broken down |
| `list` | `resource`, `filter`, `sort`, `limit`, `title`/`detail` fields, optional `check` | Rows; interactive when `check` is set |
| `countdown` | `resource`, the id source (`flag: 'countdown_event_id'` or `configure`), the date fields, optional `cells` flags | Days/weeks/… to a date |
| `next-date` | `resource`, `dateField`, `filter`, `title`/`detail` fields | The next upcoming row, then the following few |
| `remote` | `method: '<plural>:<verb>'` | The fixed payload `{ headline?, rows: [{ title, detail?, urgency?, link }], link }` from a collection custom method |

Nothing about the block is iOS-specific — an Android app or a terminal
dashboard would read the same thing. The web dashboard ignores it.

### 7.3 `todos:today`

A collection custom method on `todo` that runs the Today lane builders
server-side and returns the sorted `TodayItem[]` (§3.2). The builders move
from `todos/today/lanes.ts` to a module both the React hook and the method
import; the six data fetches happen through `serverClient(auth.token)` so the
result is scoped exactly as the browser's would be.

### 7.4 `nativeSession()` in the client package, and host detection in the SPA

A new auth strategy beside `browserSession()`: `token()` and `userId()` read
from the bridge; `setSession()` and `clear()` write through it; the refresh in
`api/aepbase.ts` reports each rotated pair the same way. The SPA picks it when
`window.webkit?.messageHandlers?.homestead` exists and otherwise behaves as
today. The bridge surface is four messages — `get`, `set`, `clear`, and
`open(url)` for external links — and nothing else crosses it.

### 7.5 Universal links

Serve `/.well-known/apple-app-site-association` when `ios.bundleId` and
`ios.teamId` are configured, covering `/`: every app path is a valid deep
link into the shell.

### 7.6 Later, not required: `update_time` in filters and ordering

`engine/filter.ts` and `engine/order.ts` exclude the standard fields on
purpose. Allowing `update_time` in both turns the cache's full re-list into
`filter=update_time > "<last sync>"&order_by=-update_time`. Deletes still need
a periodic id-only reconcile. Two lines; not needed at household size.

### 7.7 Optional: APNs behind a `PushSender`

`notification-subscription.subscription_data` gains a `kind: 'webpush' | 'apns'`
discriminator (absent = `webpush`, so existing rows are untouched);
`sendNotificationToUser` fans out through a `PushSender` per kind; a
`notifications.apns` block in `HomesteadConfig` is env-sourced like VAPID.
The existing `:send-notification` test push then works for the phone unchanged.
Only relevant to an operator build with its own key (§6).

---

## 8. Build, distribution, CI

- `packages/homestead-ios/` as in §5. `HomesteadKit` has no Apple-framework
  imports, so its client, schema, descriptor, and cache tests run with
  `swift test` on the Linux runner the repo already uses. The app, widgets,
  and intents targets need one `macos-latest` job running `xcodebuild` against
  a simulator.
- A contract test boots the server the way the e2e suite does, signs in,
  loads the manifest and definitions, evaluates every shipped widget
  descriptor, and resolves every typed entity — the guard that keeps a schema
  change from silently blanking a widget.
- **Distribution.** Because nothing in the first release needs an APNs key,
  a single App Store listing that talks to any instance is viable from day
  one — the main obstacle a full-native design had. An **operator build** is
  the same project with `Homestead.xcconfig` (bundle id, team id, display
  name, optional default instance URL, optional APNs) filled in; `homestead
  ios init` in the CLI writes it. TestFlight covers a household.

---

## 9. Alternatives considered

**A full native app** (three rendering tiers, native screens for the main
apps, schema-driven screens for the rest — the earlier draft of this
document). Superseded: every native screen is a second implementation of a
web screen that already works, including for apps the operator wrote, and
the things that made the native draft worth doing — widgets, intents, the
Share sheet, Spotlight — are all available to a shell without rebuilding a
single screen. Kept in git history for the day a specific screen (document
capture with VisionKit, a gift-card wallet) earns a native version; the shell
can host one route natively without changing anything else.

**Capacitor.** The closest cousin of this design, in the language the repo
already speaks. Not chosen because the two native surfaces this app exists
for — WidgetKit and App Intents — are Swift either way, and Capacitor's
plugin layer would sit between the SPA and a bridge that is four messages.
Its camera, filesystem, and push plugins buy nothing the `WKWebView` and §6
don't already cover.

**PWA only.** Already good, and this design keeps it good: nothing here
changes the browser experience. It cannot put a widget on a lock screen or
answer Siri, which is the entire delta.

**A native session UI** (instance picker + login screen in Swift). Rejected:
the web login already handles password, federated sign-in, the claim form,
and change-password. The shell only mirrors the result (§2.3).

---

## 10. Phases

| Phase | Ships | Proves |
|---|---|---|
| **0 — Shell** | First-run URL, the web view host, the session bridge (§7.4), Universal Links (§7.5), multi-instance | The web UI is a good iOS app with ~1k lines of Swift |
| **1 — Widgets** | §7.1–7.3 on the server; the generic timeline provider; the seven shipped widgets on home and lock screen; the launcher widget | The descriptor covers every shipped widget without per-widget Swift |
| **2 — Intents** | Generic intents and `RecordEntity`; the typed intents and App Shortcuts; interactive widget rows; Spotlight | "Add milk to Homestead" works from the lock screen |
| **3 — Notifications** | Local scheduling from the `scheduled-notification` queue; badge from the inbox; APNs seam (§7.7) for operator builds | Bin night, on time |
| **4 — Decide** | App Store listing vs. operator builds only; a push relay or not | Project decisions, not code |

Phase 0 is days, not weeks, and most of phase 1 is server-side.

---

## 11. Open questions

1. **Should the shell hide the SPA's sidebar in favour of the web's chromeless
   mode?** The SPA supports `?chrome=none`; a wrapped app with the full sidebar
   looks like a website, one without it needs some way to switch apps.
   Leaning: keep the SPA's chrome — it *is* the navigation — and revisit if
   it feels wrong in phase 0.
2. **Native write queue for intents, or none?** §4.3 says none, to avoid two
   queues. The cost is that "add milk" fails offline from Siri while it
   succeeds offline in the web view. Acceptable for a first release?
3. **Where do `display` hints live** — the `x-homestead-display` extension
   (clean) or the description-folding trick `enum`/`reference` use (zero
   engine change)? Leaning extension.
4. **Is the launcher widget enough to retire per-app home-screen manifests on
   iOS**, or should the shell also register itself for the per-app manifest
   URLs so an existing home-screen bookmark opens the app? Leaning: enough.
5. **How much of `todos:today` belongs to the todos app?** Once it is a
   server method, it is a household-level "what now" endpoint that other
   clients (the CLI, MCP) would want. It may deserve to live in core as a
   route rather than under one app's resource.
