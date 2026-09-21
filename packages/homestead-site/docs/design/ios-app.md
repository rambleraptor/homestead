# Native iOS app — Design

**Status:** Proposal · **Audience:** contributors

> This is a design and decision record, not a guide. It answers one question:
> what a native iOS app for Homestead should be — what it looks like, how it
> talks to an instance, where it beats the installed web app, and what the
> server has to grow so that a phone can discover and render apps it has never
> heard of.

---

## 0. The shape of the answer

Homestead is one server per household, with an operator-chosen set of apps
declared in `homestead.config.ts`. The iOS app therefore can't be "the Todos app
and the Groceries app compiled into Swift". It has to be a **client for an
instance**, the way the CLI and the MCP endpoint are: it finds out at sign-in
which apps this household runs, and renders them.

The proposal is a native SwiftUI shell over three rendering tiers:

| Tier | What renders it | Which apps |
|---|---|---|
| **1. Native** | Hand-built SwiftUI screens | A short list where the phone is the better device: Groceries, Todos, Documents + Receipts capture, Gift Cards, Recipes (cook mode), the dashboard, the inbox, chat, settings |
| **2. Generic** | Schema-driven list / detail / form screens, from the resource definitions the server already publishes | Every other app, including apps an operator wrote themselves — People, Events, Home, Credit Cards, Health, and anything under `apps/` |
| **3. Web** | The SPA route in a `WKWebView`, chromeless, signed in with the phone's session | Routes that are an interactive surface rather than a record view: the games (Pictionary, Bridge, Minigolf), bulk import/export, superuser screens |

Everything the app does *outside* a screen — push, camera scanning, the Share
sheet, home-screen widgets, Siri — is where native earns its keep, and each of
those maps onto a server feature that already exists (the inbox, `:classify`,
`process-image`, dashboard widgets, custom methods). The server changes are
small and listed in §8; the biggest is teaching `notification-subscription` to
hold an APNs token beside a web-push one.

The honest caveat, up front: push for a self-hosted server is the one place a
native app is *harder* than the PWA, not easier. iOS web push needs no Apple key
because VAPID is self-issued; APNs needs the key of whoever published the app.
§7 works through the options. The recommendation is an operator-built app
(Xcode project in the repo, your own bundle id, your own key) first, with an
App Store build that talks to any instance as a later, separately-decided step.

---

## 1. Why native, honestly

The SPA is already a good phone app. It installs to the home screen per app
(`/api/app-manifest/:id`, `web.homeScreenIcon`), launches chromeless
(`?chrome=none`, `layout/chromeMode.ts`), works offline with an ordered write
queue (`guides/offline.md`), and — since iOS 16.4 — receives web push once
installed. A native app has to beat *that*, not a bookmark in Safari.

Where it does:

| Capability | Installed PWA on iOS | Native |
|---|---|---|
| Push | Works, but only for the installed web app, no badge count on the icon, notifications vanish if the user uninstalls the icon, permission prompt must be user-initiated inside the app | APNs: icon badges, notification actions ("Mark done", "Snooze"), grouped threads, delivery while the app is dead, critical/time-sensitive interruption levels for bin night |
| Camera → document | `<input capture>`: one photo, no edge detection, no multi-page | VisionKit's document scanner: perspective-corrected, multi-page, produces a PDF the `documents` pipeline already accepts |
| Getting things *in* from other apps | Copy/paste | Share extension: a PDF from Mail → Documents; a recipe URL from Safari → Recipes import; a screenshot → Receipts |
| Home screen | One icon per app | WidgetKit: the dashboard's widgets (next pickup, items left, countdown) on the home and lock screen, refreshed in the background |
| Voice / automation | Nothing | App Intents: "Add milk to the grocery list", "What's due today", Shortcuts, Focus filters |
| Offline | Cache API + queue, cleared by Safari after 7 days of disuse | A real database on disk, no eviction, background sync |
| Sign-in | Cookie/localStorage, re-login when Safari clears state | Keychain, refresh-token rotation, Face ID lock on open |
| Search | In-app only | Spotlight: a gift card or a person shows up in the system search |
| Feel | Good | Native navigation stacks, swipe actions, haptics, Dynamic Type, pull-to-refresh, context menus, no viewport tricks |

Where it doesn't: anything that is *content*. A recipe reads the same in both.
That is the argument for tiers 2 and 3 — the app should not re-implement the
long tail of screens whose only virtue is being a list.

---

## 2. Principles

1. **The instance is the product; the app is a viewer for it.** No account
   with Homestead-the-project. First run asks for a server URL, the same way
   `homestead login` does. Everything the app knows about the household comes
   from that server at runtime.
2. **Apps are data the client discovers, not code it ships.** The app renders
   whatever the instance runs, including the operator's own apps. A stock app
   *may* have a nicer native screen (tier 1), but nothing works *only* if it
   does.
3. **Same routes, same ids, same paths.** A notification's `url` (`/todos`,
   `/documents/abc`) opens the same place on the phone as in the browser.
   Universal links use the instance's own origin; the web view uses the same
   paths. There is no second URL scheme to keep in sync.
4. **The web is an escape hatch, not a foundation.** A screen can fall back to
   the SPA, and users should mostly not notice when it does. But the shell,
   navigation, auth, cache, push, camera, and widgets are native, so the
   fallback is per-route, never per-app.
5. **Server-side rules stay server-side.** Access (`enforce.ts`), tags,
   app-access gating, and reference `onDelete` are enforced by the engine; the
   app never reimplements them, it only hides what the server says the caller
   can't reach (`/api/permissions/me`, the app-access map in the manifest).

---

## 3. The central decision: rendering an open-ended app set

### 3.1 The three tiers, and how an app lands in one

An app's routes are React components (`AppRoute.component`). The phone can't
run them. So the question for every route is *what does the phone render
instead*, and the answer is decided by data the server publishes:

```
route in the manifest
  ├─ has a native screen registered for its (appId, path)?   → tier 1
  ├─ is a resource view (index / :id) of a declared resource? → tier 2
  └─ otherwise (a game board, an import wizard, superuser)   → tier 3
```

Tier 1 is a table inside the iOS app keyed by `(appId, routePath)`. Tier 2 is
computed: a route whose `path` is `''` or `':id'` on an app with resources is a
list or a detail of those resources. Tier 3 is the default for everything
else. An operator app with a plain CRUD shape therefore gets native list,
detail, and form screens with zero iOS work; an operator app that ships a
bespoke React surface gets it in a web view.

### 3.2 What tier 2 renders from

The engine already publishes everything a generic screen needs:

| Need | Source |
|---|---|
| Which apps exist, their names, icons, base paths, routes, dashboard widgets | `AppConfig` via the registry; today only `/api/app-manifest/:id` (one app, PWA-shaped) — §8.1 adds a whole-instance manifest |
| Which apps *this* user may open | The app-access map + tags, applied server-side to the manifest |
| Each resource's fields, types, `required`, `enum` values, `reference` targets, file fields, `parents` | `GET /api/aep/aep-resource-definitions` — the wire schema. `enum` and `reference` are folded into the wire `description` (`one of: …`, `reference to a <resource> record (by id)`), so the app parses those two phrasings back out; the MCP surface does the same today |
| Custom methods (verb, target, request/response schema) | `GET /api/custom-methods` |
| Which fields to show as title / subtitle / badge | Not published. §8.2 adds a `display` hint to `ResourceDefinition`, with a heuristic fallback (first required string → title; a `status`/enum → badge; a money-like number → trailing text) |
| Filter bar | `web.filters` on the app config, already declarative (`AppFilterDecl`) |

With that, a generic list is a `List` of rows (title, subtitle, badge), a
detail is a grouped form of the record's fields rendered by type (string,
number, boolean toggle, date picker, enum picker, reference picker that
searches the target resource, file field with a thumbnail and `:download`),
and a create/edit form is the same view in edit mode with `required`
enforced client-side and the server's error surfaced inline. Parented
resources (`transactions` under a `gift-card`, `perks` under a `credit-card`)
render as sections on the parent's detail.

This is deliberately the *same* shape as the CLI's `homestead resources` and
the MCP `resource` surface: one reading of the schema, three clients.

### 3.3 What tier 3 needs

A `WKWebView` pinned to the instance origin, loading `<basePath>?chrome=none`,
with the session handed over. The SPA's `browserSession()` strategy reads its
token from `localStorage`, so the shell injects a `WKUserScript` at document
start that seeds the same keys the strategy uses, then the SPA boots signed
in. When the phone rotates its access token, the shell re-seeds. The web view
never gets a refresh token — a one-hour access token is enough for a game.
Navigation inside the web view is confined to the instance origin;
`window.open` and external links hand off to Safari.

---

## 4. What it looks like

### 4.1 First run

```
┌──────────────────────────────┐   ┌──────────────────────────────┐
│                              │   │ ‹ home.example.com           │
│        ⌂  Homestead          │   │                              │
│                              │   │  Sign in                     │
│  Your household's server     │   │  ┌──────────────────────┐    │
│  ┌────────────────────────┐  │   │  │ email                │    │
│  │ https://home.example.  │  │   │  ├──────────────────────┤    │
│  └────────────────────────┘  │   │  │ password             │    │
│                              │   │  └──────────────────────┘    │
│  ● Reachable · Homestead 1.x │   │  [        Sign in         ]  │
│  [        Continue        ]  │   │                              │
│                              │   │  ─────── or ───────          │
│  Scan a QR code from Settings│   │  [ G  Continue with Google ] │
└──────────────────────────────┘   └──────────────────────────────┘
```

- The URL field probes `GET /api/health` and `GET /api/setup`. An unclaimed
  instance (`needsSetup: true`) shows the claim form instead of sign-in — the
  same one-shot `POST /api/setup` the SPA uses.
- "Continue with Google" appears only when the instance advertises OAuth
  providers; the button list comes from the server, not the app.
- A QR code on the web app's Settings page encodes the instance URL (and
  nothing else) so the rest of the household never types it.

### 4.2 The tab bar

```
┌──────────────────────────────┐
│ Good evening, Alex        ⚙︎ │
│                              │
│ ┌──────────────────────────┐ │   Home — the dashboard. Widgets are
│ │ Bin night tonight  🗑     │ │   native cards, same order and hidden
│ │ Recycling + garbage      │ │   set as the web (user-preference).
│ └──────────────────────────┘ │
│ ┌──────────────────────────┐ │
│ │ Groceries   7 left   ›   │ │
│ │ Todos       3 today  ›   │ │
│ └──────────────────────────┘ │
│ ┌──────────────────────────┐ │
│ │ Costa Rica     42 days   │ │
│ └──────────────────────────┘ │
│                              │
├──────┬──────┬──────┬─────────┤
│ Home │ Apps │ Chat │ Inbox ③ │
└──────┴──────┴──────┴─────────┘
```

Four tabs. Settings lives behind the gear, as it does in the web header.

- **Home** is the dashboard. Each widget is a card with the number or list the
  web widget shows and a chevron into the app. The card content comes from a
  declarative widget descriptor (§8.3), which is also what the WidgetKit
  widgets render.
- **Apps** is the sidebar: a grid of the apps this user can open, in `navOrder`,
  grouped by `section`, using the same `/app-icons/*.png` the home-screen
  manifests use. Tapping one pushes that app's index route on the tab's
  navigation stack. Long-press: "Add to Home Screen" (a WidgetKit shortcut
  widget) and "Pin to tab bar" for the two or three apps someone opens daily.
- **Chat** is present when `GET /api/chat` reports `configured: true`, hidden
  otherwise — the app never shows a feature the instance has switched off.
- **Inbox** is the notifications app with the unread count as the badge, and
  it is what a push opens.

### 4.3 A generic (tier 2) app

People, rendered from its resource definition and a `display` hint:

```
┌──────────────────────────────┐   ┌──────────────────────────────┐
│ ‹ Apps        People      +  │   │ ‹ People                 Edit│
│ ┌──────────────────────────┐ │   │                              │
│ │ 🔍 Search                │ │   │  Maya Chen                   │
│ └──────────────────────────┘ │   │  Sister                      │
│ Filters: Relationship ▾      │   │                              │
│                              │   │  CONTACT                     │
│ Maya Chen         Sister   › │   │  Phone      +1 415 555 0142 │
│ Dev Patel         Friend   › │   │  Email      maya@…           │
│ Grandma Rose      Family   › │   │                              │
│ …                            │   │  DATES                       │
│                              │   │  Birthday   March 4          │
│                              │   │  Anniversary  —              │
│                              │   │                              │
│                              │   │  NOTES                       │
│                              │   │  Allergic to shellfish.      │
│                              │   │                              │
│                              │   │  [ Share… ]   [ Delete ]     │
└──────────────────────────────┘   └──────────────────────────────┘
```

- Swipe actions on rows: delete (with the engine's `onDelete` 409 surfaced as
  "Still referenced by 3 documents"), and any item-target custom method whose
  request schema is empty — `:download` on a file, `:parse-receipt`, a
  `:send-notification`.
- Reference fields render as links: `created_by` shows the user's display
  name; a `store` on a grocery item shows the store and opens it. This is the
  same `reference` → display-name resolution the chat search tool does.
- "Share…" opens the record-scope grant sheet — the native counterpart of
  `ShareRecordDialog` — listing household users and groups from
  `/api/permissions/me`.
- Field types the schema can't express well (a `metadata` object) render as a
  read-only JSON block rather than being hidden.

### 4.4 Tier-1 native screens

These are the screens where a phone is the better device, and each leans on a
server feature that already exists.

**Groceries.** A checklist grouped by store, with a big "Photo → list" button.
The camera (or a photo of the paper list on the fridge) posts to
`POST /api/aep/groceries:process-image`, and the parsed items land in a review
sheet before they're created. Checking an item off is an optimistic update
that queues offline — the store aisle is the canonical offline place. The
"list updated" push (`groceries:send-notification`) becomes a tappable APNs
notification with a "Show list" action.

**Todos.** Today / Active / Templates as segmented tabs; a todo row has a
swipe-to-complete and a long-press to move to tomorrow. A Lock Screen widget
shows today's count. "Add a todo" is an App Intent, so Siri and Shortcuts can
call it.

**Documents and Receipts capture.** The single most valuable native screen.

```
┌──────────────────────────────┐   ┌──────────────────────────────┐
│ ‹ Documents           Scan ▣ │   │ ‹ New document               │
│ ┌────────────┐┌────────────┐ │   │ ┌──────────────────────────┐ │
│ │ ▤ Car      ││ ▤ Vet bill │ │   │ │  [ page 1 of 2 preview ] │ │
│ │ insurance  ││ 2026-08-30 │ │   │ └──────────────────────────┘ │
│ │ Ready      ││ Classified │ │   │  Classifying…  ●●●○          │
│ └────────────┘└────────────┘ │   │                              │
│ ┌────────────┐┌────────────┐ │   │  Type      Medical receipt ✓ │
│ │ ▤ Lease    ││ ▤ Passport │ │   │  Provider  Dr. Okafor        │
│ │            ││ ⚠ needs    │ │   │  Amount    $140.00           │
│ │            ││   review   │ │   │  Date      Aug 30, 2026      │
│ └────────────┘└────────────┘ │   │  People    Maya Chen         │
│ Collections: Tax 2026 · Car  │   │                              │
│                              │   │  Mirrored to Receipts ›      │
│                              │   │  [        Looks right      ] │
└──────────────────────────────┘   └──────────────────────────────┘
```

  Scan opens VisionKit's document camera; the pages become one PDF, uploaded
  as the `documents` file field (online-only, like the web), then `:classify`
  runs and the sheet fills in the extracted metadata with the confidence meter.
  The `post_classify` mirror into Receipts (`receipts.md` §0) means a scanned
  medical bill shows up in both places with nothing extra on the phone. The
  same capture sheet is what the Share extension opens for a PDF or image
  shared from Mail or Files.

**Gift Cards.** The list is a wallet: cards with merchant, remaining balance,
and a color from the merchant name. The detail shows the number large, with a
barcode rendered client-side when the number is scannable, a copy button, and
the transactions (the parented child) as a ledger with "Spend" inline. This is
the screen someone opens at a register, so it's cached for offline and opens
in under a second.

**Recipes.** A cook mode: ingredients as a checklist on the left half of a
landscape layout, steps on the right, the screen kept awake, and the
`recipes` `log` child written when you tap "Cooked this". Recipe import from
a URL comes in via the Share sheet and goes to the existing import route.

**Events and Home.** Their widgets are the point: the countdown and the next
pickup are WidgetKit widgets, medium and lock-screen sizes, with the pickup
one refreshed the evening before from the `scheduled-notification` queue.

Everything else in the stock set — People, Credit Cards, Health (private
records, so it also gets the Face ID lock by default), Receipts' list view —
is tier 2 and looks like §4.3.

### 4.5 Inbox, Chat, Settings

- **Inbox** lists `notifications` under the signed-in user, newest first,
  grouped by day, with unread as bold. Tapping marks read and follows `url`.
  A "Scheduled" section shows the `scheduled-notification` queue with the
  swipe-to-cancel the web design (`scheduled-notifications.md`) describes.
- **Chat** posts `{ messages }` to `POST /api/chat` and renders the reply.
  The endpoint is request/response rather than streaming, so the UI shows the
  typing indicator until the JSON returns; a streaming variant is a server
  change to make later, not a blocker. Tool calls the assistant made are shown
  as collapsible "Looked at 3 gift cards" rows.
- **Settings** mirrors the web settings app: this device's push registration
  (`NotificationDevices`, now with the APNs row), personal access tokens,
  connected apps, change password, sign out everywhere (`/api/auth/logout-all`),
  plus native-only rows: Face ID lock, which apps show on the tab bar, cache
  size and "clear offline data", and the instance switcher for people who
  belong to two households.

### 4.6 Beyond the app

| Surface | What it does | Backed by |
|---|---|---|
| **WidgetKit** | Dashboard widgets on the home and lock screen; a per-app launcher widget | Widget descriptors (§8.3); a timeline provider that fetches with the Keychain token |
| **Share extension** | PDF/image → Documents (or Receipts); URL → Recipes import; text → a Todo | The same upload + `:classify` path; the import routes |
| **App Intents** | "Add X to groceries", "What's on the list", "Mark X done", "How much is on the REI gift card" | Plain CRUD through the client; each intent is a thin wrapper on a resource create/list |
| **Spotlight** | Records of tier-1 apps indexed by title; opens the detail | `CSSearchableItem` per cached record |
| **Universal links** | `https://home.example.com/todos/abc` opens the app | `/.well-known/apple-app-site-association` served by the server (§8.5) |
| **Notification actions** | "Done", "Snooze until tomorrow", "Show list" without opening the app | Category on the APNs payload; the action posts the write directly |
| **Background refresh** | Widgets and the inbox badge stay current | `BGAppRefreshTask` polling the inbox and widget queries |

---

## 5. Architecture on the phone

```
packages/homestead-ios/
├── HomesteadKit/            Swift package, no UIKit: the parts we can unit-test on Linux
│   ├── Client/              AEP client: list (page tokens), get, create, merge-patch, delete,
│   │                        custom methods (collection + item, multipart for file fields),
│   │                        operations polling (AEP-151), resource-definition + manifest loaders
│   ├── Auth/                InstanceStore, session (Keychain), refresh rotation, PKCE flow,
│   │                        a `Credential` seam mirroring the TS client's auth strategies
│   ├── Schema/              Wire-schema → `ResourceSchema` (fields, enums, references, files,
│   │                        parents), `display` hint parsing, the tier-2 heuristics
│   ├── Store/               On-disk record cache (GRDB/SQLite), write queue, sync engine
│   └── Models/              Typed structs for tier-1 apps (GroceryItem, Todo, GiftCard, …),
│                            decoded from the same JSON records tier 2 renders dynamically
├── Homestead/               The SwiftUI app: shell, tabs, tier-1 screens, tier-2 renderer,
│                            tier-3 web view host, settings
├── HomesteadWidgets/        WidgetKit extension
├── HomesteadShare/          Share extension
├── HomesteadIntents/        App Intents
└── Homestead.xcodeproj
```

### 5.1 Records are JSON first, structs second

The engine's records are open objects, and tier 2 needs them that way. So the
cache stores each record as `(collection, id, path, update_time, json)`, and
the typed models for tier-1 apps are `Decodable` views over that same JSON.
One cache, one sync engine, two ways to read it. This also means an operator
adding a field to `gift-card` doesn't break the native Gift Cards screen — it
ignores what it doesn't know, and the tier-2 detail still shows the field.

### 5.2 Offline: the same contract as the web

The SPA's rules (`guides/offline.md`) are the spec, and the phone keeps them so
the two clients never disagree about what a queued write means:

| Rule | Phone |
|---|---|
| Reads serve the cache | Every list/detail reads the store; the network refreshes it |
| Writes apply instantly and queue, in order | A `pending_writes` table; the UI reads the store, which already reflects the write; a temp id is swapped for the server id on replay, including in later queued writes that reference it |
| Rejected replay rolls back | The stored pre-image is restored and the row is flagged so the user sees why |
| File uploads are online-only | The capture sheet says so and holds the scan locally until reconnect — better than the web, which just fails |
| No realtime | Polling. The engine has no change feed; §8.6 sketches the incremental step and the feed, neither required for phase 1 |

Sync on foreground and on `BGAppRefreshTask`: drain the queue oldest-first,
then refetch the collections the user has opened recently plus every widget's
query. Today that is a full re-list per collection: the engine's filter and
`order_by` deliberately exclude the standard fields, so a client can't ask for
"rows changed since my last sync". Household collections are small enough that
this is fine for a first release; §8.6 is the two-line server change that turns
it into an incremental fetch.

### 5.3 The web-view host

One `WKWebView` per tier-3 route, created on demand, origin-restricted,
session seeded as in §3.3, with the SPA's `?chrome=none` so the tab bar isn't
duplicated. It shares the cookie store across instances of the host but never
across instances of Homestead (one `WKWebsiteDataStore` per server URL).

---

## 6. Auth

Three ways in, chosen by what the instance advertises, all ending in the same
`Session` object (access token, refresh token, user, instance URL) stored in
the Keychain with `kSecAttrAccessibleAfterFirstUnlock` so background refresh
works while the phone is locked.

1. **Password** → `POST /api/auth/login`. Returns a one-hour access token and
   a 30-day rotating refresh token; the app refreshes on 401 and proactively at
   ~50 minutes. This is the baseline that works on every instance.
2. **Federated (Google) sign-in.** The engine's provider flow
   (`/api/aep/oauth/<name>/start` → callback → `successRedirect#token=…`) is
   built for the SPA and mints an engine token via a fragment. Rather than
   adding a custom-scheme variant of that, the app uses the instance's own
   **OAuth authorization server** when it's enabled: `ASWebAuthenticationSession`
   against `/oauth2/authorize` with PKCE (S256 is already mandatory, dynamic
   registration already exists, public clients already get no secret), and the
   server's login page handles password *or* Google itself. One native code
   path; the server keeps all the provider logic. The redirect URI is a
   Universal Link on the instance origin (`https://home.example.com/ios/callback`),
   which is both more secure than a custom scheme and needs nothing new
   registered on the phone.
3. **Personal access token** — for a shared device or a kiosk: paste a PAT.
   PATs can't change passwords or mint tokens, which is exactly right there.

Local: an optional Face ID / passcode gate on app open (`LocalAuthentication`),
on by default for the Health app's screens because its records are private.
Multiple instances are a list in Settings, like CLI profiles; switching
swaps the store, cookies, and session as a unit.

---

## 7. Push, and the distribution problem

This is the design's one genuinely hard trade-off, so it gets its own section.

**The mechanics are easy.** APNs needs, on the server, a `.p8` key, key id,
team id, and bundle id, configured in `homestead.config.ts` from env the way
VAPID is. `notification-subscription.subscription_data` gains a discriminator
(§8.4), the app registers its device token as one, and
`sendNotificationToUser` fans out by kind. Payloads carry `url`, `tag` (as the
collapse id), the inbox row id, and a category for actions. The web's
`NotificationDevices` settings list already models "one row per device", so
the APNs row slots in beside "Chrome on macOS".

**The key is the problem.** APNs authenticates the *sender* with the key of the
*app's publisher*. If the iOS app is one App Store listing that talks to any
Homestead instance, then every operator's server would need that one key —
which is the same as publishing it. Home Assistant solves this with a push
relay run by the project; Nextcloud does the same. Both cost someone money and
put a third party in the delivery path of a system whose whole point is that
there isn't one.

Options, with what each costs:

| Option | Push works | Who builds the app | Cost |
|---|---|---|---|
| **A. Operator-built.** The Xcode project lives in the repo; the operator sets their bundle id and drops in their own APNs key; TestFlight to the household | Yes, first-party, no relay | The operator (an Apple developer account, ~$99/yr) | Matches the audience — people who already run a box and write TS apps. Doesn't scale to a non-technical household on its own |
| **B. App Store app + project-run relay.** One listing; servers post to `push.myhomestead.dev`, which holds the key and forwards to APNs | Yes | The project | A hosted service with an uptime obligation, and a hop that sees notification *envelopes* (it can be blind to content if the payload is encrypted with a per-device key the app holds — worth doing if B ever ships) |
| **C. App Store app, no push.** Widgets and the badge come from background refresh; the inbox is polled | Delayed by minutes to hours, at iOS's discretion | The project | Cheap, but it makes the native app *worse* than the PWA at the one thing bin night needs |
| **D. App Store app, local notifications from the queue.** The app pulls `scheduled-notification` rows and schedules them as `UNNotificationRequest`s on-device | For *scheduled* notifications, yes, exactly on time, offline; for ad-hoc pushes (someone updated the list), no | The project | Surprisingly good: most household notifications are scheduled ones (reminders, bin night, perk windows) |

**Recommendation:** A now, and make the code shape B-ready — the server sends
to a `PushSender` interface, one implementation talks to APNs directly, a
relay would be a second. D is worth doing regardless: it costs a background
fetch and makes scheduled reminders fire even when the server is unreachable.
Whether to ever do B is a project decision about running services, not a
design question, and it should stay open until someone who isn't the operator
of their own box wants the app.

---

## 8. Server changes

All small, all additive, all useful to more than the iOS app.

### 8.1 A whole-instance manifest: `GET /api/app-manifest`

Today the route serves one app's PWA manifest. Add the collection form,
authenticated, returning the apps the *caller* can open (access map + tags
applied), each with `id`, `name`, `description`, `basePath`, `routes[]`
(`path` only), `homeScreenIcon`, `navOrder`, `section`, `placement`,
`filters`, `widgets[]` (§8.3), and the resource singulars it declares. This is
the same information the SPA's registry holds, serialized. The CLI's
`homestead resources` could use it too, to group output by app.

### 8.2 `display` hints on `ResourceDefinition`

```ts
display: {
  title: 'merchant',            // row title
  subtitle: 'balance',          // row subtitle, formatted by the field's type
  badge: 'status',              // trailing pill (an enum field)
  icon: 'gift',                 // optional, Lucide name → SF Symbol map on the phone
  sort: 'merchant',             // default list order (`-field` for descending)
}
```

Optional; the tier-2 heuristic fills in what's missing. Folded into the wire
`description` like `enum` and `reference` are, or carried as an
`x-homestead-display` extension the way `x-aepbase-reference` is — the latter
is cleaner and the precedent exists. The MCP `resource` surface and the chat
search tool can use `title` for display names instead of guessing.

### 8.3 Declarative widget descriptors

A dashboard widget is a React component and can't be rendered by a phone or by
WidgetKit. Add an optional `native` block to `DashboardWidget`:

```ts
{
  id: 'groceries-remaining',
  order: 20,
  component: () => import('./components/RemainingWidget'),
  native: {
    kind: 'count',                                  // 'count' | 'list' | 'countdown' | 'next-date'
    resource: 'grocery-item',
    filter: 'checked == false',
    title: 'Groceries',
    format: '{count} left',
    link: '/groceries',
  },
}
```

Four kinds cover every shipped widget: `count` (groceries remaining, active
todos), `list` (today's todos, upcoming events, upcoming perks), `countdown`
(the events countdown, with its flag-controlled cells), `next-date` (next
pickup). A widget without `native` is simply absent from the phone's Home tab
and WidgetKit. The descriptor is served in §8.1's manifest.

### 8.4 APNs subscriptions and a `PushSender`

- `notification-subscription.subscription_data` gets a `kind: 'webpush' | 'apns'`
  discriminator (absent = `webpush`, so existing rows are untouched), and for
  APNs holds `{ kind: 'apns', token, bundle_id, environment: 'sandbox' | 'production' }`.
- `sendNotificationToUser` in `homestead-core/server/notifications.ts` fans out
  through a `PushSender` per kind. The web-push one is today's code; the APNs
  one uses HTTP/2 + a JWT signed with the `.p8` (no new dependency beyond a JWT
  signer; `node:http2` is enough).
- `notifications.apns` block in `HomesteadConfig`, env-sourced like VAPID.
- `:send-notification` on a subscription already exists for the test push, so
  the settings "Send test" button works for the phone unchanged.

### 8.5 Universal links

Serve `/.well-known/apple-app-site-association` from the server when
`ios.bundleId` / `ios.teamId` are configured, covering `/` — every app path is
a valid deep link. Tier-3 routes still open in the app (in the web-view host).

### 8.6 Later, not required: incremental sync, then a change feed

Two steps, in order of size:

1. **Let `update_time` be filtered and ordered.** `engine/filter.ts` and
   `engine/order.ts` both exclude the standard fields on purpose (no consumer
   ever asked). Allowing `update_time` in both turns the phone's full re-list
   into `filter=update_time > "<last sync>"&order_by=-update_time`. Deletes
   still need the full list (a deleted row has no `update_time` to find), so
   the app does one cheap id-only reconcile per collection per day.
2. **A change feed.** `GET /api/events` as SSE, emitting
   `(collection, id, op, update_time)` for records the caller can read. Both
   clients would replace their polling with it.

Neither is in the first release; a full re-list per collection is enough and
matches "Realtime subscriptions (polling only)" in `CLAUDE.md`.

---

## 9. Repo layout, build, CI

- `packages/homestead-ios/` as in §5. `HomesteadKit` is a plain Swift package
  with no Apple-framework imports so its client, schema, and store tests run
  with `swift test` on the Linux CI runner the repo already uses. The app
  target, widgets, and extensions need a `macos-latest` job with `xcodebuild
  -scheme Homestead -destination 'platform=iOS Simulator'`.
- Configuration for an operator build is one file, `Homestead.xcconfig`:
  bundle id, team id, and an optional default instance URL — nothing else
  changes between households. `homestead ios init` in the CLI writes it.
- The e2e suite gains a small Swift-side contract test: boot the server the
  way Playwright does, sign in, load the manifest and definitions, render the
  tier-2 schema for every stock resource, and fail if any field type is
  unhandled. That is the guard that keeps a new field kind from silently
  becoming a blank row on phones.

---

## 10. Alternatives considered

**Wrap the SPA in Capacitor.** The cheapest path to push, camera, and the Share
sheet, in the language the repo already speaks. It was seriously considered.
It loses the things in §1's table that are about *feel* and *system
integration* — WidgetKit, App Intents, Spotlight, real navigation stacks,
notification actions that write without launching a web view — and it keeps
every screen at the web's quality ceiling. If the goal were only "push and a
camera", Capacitor would win. The tier-3 web-view host means this design can
still borrow Capacitor's move for any single route, so the two approaches
converge rather than compete.

**Pure schema-driven (tier 2 only).** Covers every app on day one with the
least code. Rejected as the *whole* answer because the screens that justify a
native app — capture, the grocery aisle, the register — are precisely the ones
a generic form serves worst. Kept as the floor.

**Per-app native rewrites (tier 1 only).** The "obvious" native app. Rejected
because it can't render an operator's own apps, which is the product.

**A `homestead://` URL scheme.** Rejected in favor of Universal Links on the
instance origin: no second path vocabulary, works for the OAuth redirect, and
a link in a household chat opens the app or the web depending on what's
installed.

**Generating a Swift client from `/api/aep/openapi.json`.** Tempting — the
OpenAPI output is the engine's contract, and the round-trip test in
`homestead-server/test` keeps it honest. But the resource set is
per-instance, so a generated client is only right for the instance it was
generated against. A hand-written AEP client over dynamic records is small
(list/get/create/patch/delete/invoke/operation) and instance-agnostic; the
OpenAPI document is still the reference it's tested against.

---

## 11. Phases

| Phase | Ships | Proves |
|---|---|---|
| **0 — Spike** | Instance picker, password sign-in, Apps tab from the manifest, tier-2 list/detail/form, tier-3 web host, Settings | The three-tier model renders every stock app without per-app code. §8.1 and §8.2 land on the server |
| **1 — Daily use** | Offline store + queue, Home tab with §8.3 widgets, Inbox, Face ID, PKCE sign-in, multi-instance | Someone can use it instead of the PWA for a week |
| **2 — Native tier** | Groceries, Todos, Documents/Receipts capture, Gift Cards, Recipes cook mode; Share extension; WidgetKit; App Intents; Spotlight | The reasons in §1 are real |
| **3 — Push** | APNs via §8.4 in the operator build; local scheduling of `scheduled-notification` rows (§7 D); notification actions | Bin night, on time, with a "Done" button |
| **4 — Decide** | Whether to run a relay and publish to the App Store (§7 B) | A project decision, not a code one |

Phase 0 is a couple of weeks of one person's time and is deliberately mostly
server work, because §8.1–8.3 are the parts that make the phone possible
without making it a fork of the web.

---

## 12. Open questions

1. **Who builds the app for a non-technical household?** §7's option A assumes
   the operator can use Xcode and TestFlight. If the answer is "most can't",
   phase 4 is not optional and should be planned earlier.
2. **How much of a tier-2 form should be editable?** Everything the schema
   says is settable, or only fields the `display` hint lists? Proposal: all of
   them, with `deprecated: true` fields hidden — the schema is the contract.
3. **Where do `display` hints live** — an `x-homestead-display` wire extension
   (clean, one more thing the translator emits) or the description-folding
   trick (`enum`/`reference` precedent, zero engine change)? Leaning extension.
4. **Does the Health app's "private to you" deserve stronger on-device
   handling** — encrypted store column, excluded from Spotlight, excluded from
   iCloud backup? Proposal: yes to all three, keyed off the resource's
   `access: { model: 'private' }`, which the definition already declares and
   which the manifest (§8.1) can pass through.
5. **Should tier-3 routes be allowed at all in a first release**, or is a
   "open in browser" link enough for the games? A web view is more work than it
   looks (session seeding, origin pinning, back gestures). Leaning: ship the
   link in phase 0, the host in phase 1.
