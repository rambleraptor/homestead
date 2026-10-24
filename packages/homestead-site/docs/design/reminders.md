# Reminders — Design

**Status:** Partly shipped (see §0) · superseded by
[`scheduled-notifications.md`](./scheduled-notifications.md), which argues the
`reminder` resource is three things wearing one noun and replaces it with a
user-parented delivery queue · **Audience:** contributors

> This is a design and decision record, not a guide. It answers two questions:
> what a Reminders app in Homestead should be, and how it should reach across
> the apps that already hold reminder-shaped data.

---

## 0. What shipped, and what this document is still proposing

A narrow slice of this design is live. It delivers the *outcome* — one list, two
delivery moments, apps raising reminders instead of pushing their own
notifications — without the `ReminderSource` / `reminder-subscription` /
`lead_days` machinery below, which remains unbuilt.

**Shipped:**

| Piece | Where |
|---|---|
| Reminders as their own tab | `events/components/EventsHome.tsx` (`/events?tab=reminders`) |
| `type` + `source_key` + `notify_users` on `reminder` | `events/resources.ts` |
| Two delivery crons, 09:00 and 18:00 | `reminders-notify-morning` / `-evening` → `events/crons/notifyReminders.ts` |
| Shared reconcile helper for app-raised reminders | `events/crons/materializer.ts` |
| Events migrated onto it | `events-materialize-reminders` → `events/crons/materialize.ts` |
| Bin night, the evening before | `home-pickup-reminders` → `home/crons/pickup-reminders.ts`, opt-in per person |
| `'reminder'` inbox type | `homestead-core/notifications/resources.ts` |

**The three departures worth knowing about, and why:**

1. **Materialize, don't scan.** §3.3 has apps declare a `ReminderSource` and a
   scanner the platform calls at send time. What shipped inverts it: an app's own
   daily cron *writes reminder records* keyed by a `source_key`, and the delivery
   crons treat them like any other reminder. The reminder becomes visible in the
   list the moment it's raised rather than at the moment it fires, an app needs no
   new extension point to participate, and reconciliation is a plain diff against
   what the app wrote last time. What it gives up is §3.3's single lookahead
   window — each app owns its own horizon.
2. **Two fixed hours, not a per-source hour.** §6.1 wanted a per-source hour
   override because 09:00 is the wrong time to mention tonight's bins. A morning
   and an evening slot answer that without a knob: a reminder is announced at the
   last slot before it comes due, so a 18:00 due time is an evening
   notification by construction.
3. **`notify_users`, not per-user subscriptions.** §3.2's
   `reminder-subscription` is still the right shape for "subscribe me to every
   warranty expiry". For the two cases that shipped, the opt-in already exists
   elsewhere (`event-reminder`; the Home app's `pickup_reminder` setting), so the
   materializer resolves it once and stamps the audience on the row. A reminder
   created by a cron can't be *owned* by a user — the engine stamps the caller as
   owner — so an audience field was needed regardless.

Everything from §1 on is the original proposal, left intact: `lead_days` is still
the answer to "30 days before this warranty lapses", and §6's app-by-app survey
is still the roadmap. Read the sections below as "what a full Reminders platform
should be", and this section as "what exists".

---

## 1. The problem

"Reminders" exists in Homestead today in three disconnected forms, and the
interesting part is what falls between them.

### 1.1 One app implements reminders properly

The events app has the whole thing, end to end:

| Piece | Where |
|---|---|
| Per-user opt-in resource | `event-reminder` (`packages/homestead-apps/events/resources.ts`), parented under `user`, `lead: day_of \| week_before \| both` |
| UI control | `EventReminderSelect.tsx` — a four-way select on each event card |
| Read/write hook | `useEventReminder.ts` — models absence-of-record as `none` |
| Scheduler | was `events-notify`, `dailyAtHour: 9`; now `events-materialize-reminders` plus the two shared delivery crons (§0) |
| Fan-out + dedup | was `events/crons/notify.ts`; the fan-out now lives in `events/crons/notifyReminders.ts` and serves every app |

The design decisions in there are good and worth keeping:

- **The subject and the subscription are separate records.** The `event` is
  household-wide; the `event-reminder` is user-parented. Two people can want
  different lead times for the same birthday, and neither sees the other's
  choice.
- **Absence means off.** No record is written until someone opts in, so the
  collection stays small and "off" needs no representation.
- **The inbox is the dedup ledger.** Each send writes a `notification` stamped
  with `source_id`, `notification_type`, and `scheduled_for`; the cron reads
  prior rows back and skips any `(record, lead, occurrence)` triple it already
  sent. `runOnStart` catch-ups and restarts can't double-notify, and next
  year's occurrence is a different `scheduled_for`, so it isn't confused with
  this year's.

### 1.2 One app has a notify button

`groceries:send-notification` (`groceries/methods/send-notification.ts`) pushes
"The grocery list has been updated" to the caller, on demand. It is a
notification, not a reminder — nothing schedules it and nothing remembers it.

### 1.3 The delivery layer already speaks "reminder", partially

`packages/homestead-core/server/notifications.ts` and the `notification`
resource carry a reminder vocabulary:

```ts
notification_type: { enum: ['day_of', 'day_before', 'week_before', 'system'] }
scheduled_for:     { type: 'string', format: 'date-time' }
```

Two things stand out. `day_before` is **declared in three files and produced by
nothing** — a vestige of a lead-time vocabulary only events partly implements.
And the vocabulary is a closed enum of three English phrases, so it cannot
express "30 days before this warranty lapses" at all. Lead time is a *number of
days*; encoding it as an enum is the reason reminders can't generalize past
events.

### 1.4 Everywhere else, the dates exist and nothing watches them

This is the actual gap. Records across the household already carry the instant
a reminder would fire on — nobody is being reminded of any of it:

| App | Date already stored | The reminder nobody gets |
|---|---|---|
| `home` | `garbage-pickup.pickup_date` (+ `status: delayed`, `original_date`) | "Bins out tonight" — and "the holiday pushed Thursday to Friday" |
| `documents` | warranty `coverage_end`; `policy_term_end` on home/auto insurance; `expiration_date` on a vision prescription | "This warranty lapses in 30 days." `warranty.ts` literally says a *"future Home app reminds you about"* this |
| `credit-cards` | `redemption.period_end` | "You haven't used this perk and the window closes Sunday" |
| `hsa` | `service_date` on receipts still `status: Stored` | The annual "reimburse these before you forget they exist" |
| `recipes` | `log.date` | (Weak fit — see §8) |
| `todos` | **nothing** — a todo has `title`, `status`, `project`, `category` and no due date at all | Everything |
| `gift-cards` | **nothing** — no expiry field exists | Dormant balances |

So the failure isn't that reminders are missing. It's that a reminder is
currently a **per-app feature**, and every app that wants one has to rebuild the
same four things: an opt-in resource, a select control, a daily cron, and dedup
logic. Events paid that cost once. Nobody else has, and the copy-paste bill for
six more apps is what this design is trying to avoid.

---

## 2. Goals and non-goals

### Goals

- **One place a person looks** to see what's coming up, across every app.
- **Standalone reminders.** "Remind me to call the plumber Thursday" has
  nowhere to live today. Todos have no dates; events are yearly-recurring only.
- **Derived reminders without retyping.** When an app already stores the date,
  a reminder subscribes to it. A warranty's expiry is never entered twice.
- **One extension point.** An app opts into reminders by *declaring* a source,
  the same way it declares `crons`, `syncs`, `migrations`, and `widgets` — not
  by writing another cron.
- **One scheduler, one dedup path.** The events cron's logic moves into the
  platform and is deleted from the app.
- **Per-user by default.** Reminders are addressed to people, not households.
- **Permission-correct.** A derived reminder must never leak the existence of a
  record the recipient can't read.

### Non-goals (this iteration)

- **A recurrence engine.** No RRULE, no iCal import. A small enum covers
  standalone reminders; derived sources own their own date math (events already
  has `yearly-nth-weekday` and should keep it).
- **SMS.** No provider exists and none is worth adding.
- **New delivery infrastructure.** Web push and the inbox are the channels
  reminders launch on. Email is *not* a non-goal — it already works (§6.6) —
  but wiring it is deliberately deferred past phase 1.
- **Assignment and accountability.** A reminder notifies; it does not track who
  did the thing. That's what todos are for.
- **Location or arrival triggers.** Time-based only.
- **Replacing todos.** §7 covers the boundary, which is a real risk.

---

## 3. Shape of the app

Two resources, plus one `AppConfig` extension point.

### 3.1 `reminder` — the standalone case

A plain top-level household collection, so it inherits everything a normal
collection gets:

```ts
{
  singular: 'reminder',
  plural: REMINDERS,
  description: 'A one-off or recurring thing to be reminded about.',
  user_settable_create: true,
  fields: {
    title:      { type: 'string', required: true },
    notes:      { type: 'string' },
    due_at:     { type: 'string', format: 'date-time', required: true },
    recurrence: {
      type: 'string',
      enum: ['none', 'daily', 'weekly', 'monthly', 'yearly'],
      default: 'none',
    },
    status: {
      type: 'string',
      enum: ['pending', 'done', 'dismissed'],
      default: 'pending',
    },
    // Set when this reminder was raised from another app's record rather than
    // typed by a person. Mirrors the inbox's `source_collection`/`source_id`
    // pair so both layers describe provenance the same way.
    source_collection: { type: 'string' },
    source_id:         { type: 'string' },
    created_by: { type: 'string', reference: { resource: 'user' } },
  },
}
```

Being an ordinary resource buys three things for free, which is most of the
argument for this shape:

- **Chat works with no wiring.** `server/chat/tools.ts` generates
  create/read/update/delete tools from every registered definition, so
  "remind me to call the plumber Thursday" becomes a `create_reminder` call the
  moment the resource exists.
- **Filters, bulk import/export, and the permissions model** apply unchanged.
- **`homestead resources` and the OpenAPI doc** describe it automatically.

### 3.2 `reminder-subscription` — who wants to hear about what

`event-reminder`, generalized. User-parented, so path scoping keeps each
person's choices private with no extra rules:

```ts
{
  singular: 'reminder-subscription',
  plural: REMINDER_SUBSCRIPTIONS,
  parents: ['user'],
  fields: {
    // The declared ReminderSource this subscribes to (§3.3), e.g.
    // 'documents.warranty-expiry'.
    source: { type: 'string', required: true },
    // Days of warning. [0] = morning of; [0, 7] = both. Replaces the
    // day_of/week_before/both enum with the number it always was.
    lead_days: { type: 'array', items: { type: 'number' }, required: true },
    // Optional: narrow to one record. Absent = every occurrence this source
    // produces. This is the events case (one birthday) vs. the warranty case
    // (all of them).
    record_id: { type: 'string' },
  },
}
```

`lead_days` is the change that makes the whole thing generalize. `[0]` and
`[0, 7]` reproduce `day_of` and `both`; `[30]` expresses the warranty case the
current enum cannot.

As with `event-reminder`, **absence means off** — nothing is written until
someone opts in.

### 3.3 `ReminderSource` — the extension point

An app declares where its dates are, alongside `crons` and `syncs` on its
`AppConfig`:

```ts
export interface ReminderSource {
  /** Stable id, unique across apps. Also the subscription's `source` value. */
  id: string;
  /** `singular` of the resource the dates come from. */
  resource: string;
  /** Label for the settings UI, e.g. 'Warranty expiry'. */
  title: string;
  description: string;
  /** Lead times offered, in days. First is the default. */
  leads: number[];
  /**
   * When true a household member is subscribed unless they opt out, instead of
   * the reverse. For sources where silence is the surprising outcome — the bins
   * going out is the canonical one.
   */
  defaultOn?: boolean;
  /** Lazy import of the server-only scanner. Same convention as CronHook. */
  load: () => Promise<{ default: ReminderScanner }>;
}

/** Returns every occurrence falling inside the scheduler's lookahead window. */
export type ReminderScanner = (
  ctx: ReminderScanContext,
) => Promise<ReminderOccurrence[]>;

export interface ReminderOccurrence {
  /** Id of the record this is about — the dedup key and `record_id` match. */
  recordId: string;
  /** RFC3339 instant the thing happens. Leads count backwards from here. */
  dueAt: string;
  title: string;
  body: string;
  /** Where a tap should land, e.g. `/home` or `/documents/42`. */
  url: string;
  /**
   * Restrict delivery to these user ids. Omit for a household-wide occurrence.
   * §6 explains why a source over a private collection must set this.
   */
  audience?: string[];
}
```

The split matters: `id`/`title`/`leads` are plain data and safe in the browser
bundle (the settings UI renders from them), while `load` keeps the scanner
server-only behind a lazy import, exactly like `CronHook.load` and
`ResourceCustomMethod.load`.

### 3.4 One scheduler

The Reminders app owns a single `dailyAtHour: 9` cron. Each firing:

1. Collects every declared source via `getAllReminderSources()` — the same
   aggregation shape as `getAllCronHooks()` / `getAllMigrations()`.
2. Runs each scanner over a lookahead equal to that source's largest offered
   lead, collecting occurrences.
3. For each user, loads their `reminder-subscription` rows, and for each
   `(occurrence, lead)` pair where `dueAt - lead` is today, checks the inbox
   dedup key and sends via `sendNotificationToUser`.

Steps 3's dedup and fan-out are lifted almost verbatim from the old
`events/crons/notify.ts` — the point is that they get written once and the app
crons go away. (This much did happen, in `events/crons/notifyReminders.ts`; what
did not is the scanner-driven step 2 — see §0.)

The Reminders app **registers its own `reminder` collection as a source**, so
the standalone case isn't special-cased. That's the proof the extension point
is real rather than a hook events happens to fit.

---

## 4. What this costs the notification layer

Two small changes, both additive:

- Add `lead_days: { type: 'number' }` to the `notification` resource, and add
  `'reminder'` to the `notification_type` enum. (The enum value shipped; the
  `lead_days` field waits on the subscription model.) `day_of` / `week_before` /
  `day_before` stay for the rows that already exist. (Enum values are folded
  into the wire `description` by the translator, so this is not a breaking
  schema change.)
- The dedup key becomes
  `(source_collection, source_id, scheduled_for, lead_days)` — the current
  triple with the lead expressed as a number.

Nothing about VAPID, subscription cleanup, or the inbox write path changes.

---

## 5. Migrating events onto it

Events is the test: if porting it doesn't delete code, the abstraction is
wrong. It does.

| Today | After |
|---|---|
| `event-reminder` resource | `reminder-subscription` with `source: 'events.occurrence'`, `record_id: <event id>` |
| `lead: 'day_of' \| 'week_before' \| 'both'` | `lead_days: [0]` / `[7]` / `[0, 7]` |
| `events/crons/notify.ts` (≈190 lines: bucketing, fan-out, dedup, content) | a scanner returning occurrences (≈40 lines: `nextOccurrence` + wording) |
| `events-notify` cron declaration | deleted — one platform cron replaces it |

**What actually happened** (§0): `crons/notify.ts` was deleted and `events-notify`
with it; the fan-out and dedup moved to the shared delivery crons as this table
predicted. `event-reminder` stayed as it is rather than becoming a
`reminder-subscription` — the materializer reads the existing `lead` enum and
resolves it to an audience — so the migration below is still pending, along with
the `lead_days` generalization that motivates it.
| `EventReminderSelect` + `useEventReminder` | a generic `<ReminderBell>` (§6.3) |

The `event-reminder` rows migrate with a one-shot `Migration` (the app already
ships `events-split-date`, so the pattern is in place), mapping `lead` to
`lead_days` and writing the new records under the same user parent. Per CLAUDE.md's
two-release rule, `event-reminder` is marked `deprecated: true` first and the
definition removed only in a later release, with a migration declaring the drop.

---

## 6. Integration, app by app

### 6.1 The straightforward ones

- **`home` / garbage pickups.** `pickup_date` is already a plain ISO `date`,
  and the record carries `status: delayed` with `original_date` and a
  human-readable `note` ("Thanksgiving — 1 day delay"). This is the best-fitting
  source in the repo and the one most worth having: `defaultOn: true`, lead
  `[0]` fired the evening before, with the delay note carried straight into the
  body. It also argues for a per-source hour override, since 09:00 is the wrong
  time to tell someone about tonight's bins.
- **`credit-cards` / perk windows and annual fees.** Two different reminders
  with very different costs — see §6.2b, which works the app through in full.
  It is the source that proves the scanner path had to exist.
- **`hsa` / stored receipts.** Not date-anchored at all — the reminder is a
  standing "you have N receipts still `Stored`" nudge. Better modeled as a
  recurring standalone `reminder` the app seeds than as a derived source, which
  is a useful boundary case: not everything reminder-shaped is a date on a row.


### 6.2b Credit cards, worked through

Worth doing in detail, because this app breaks the simplest assumption in §3.3
and is the clearest case of *two* reminders hiding behind one app name.

**A. The annual fee posts.** "The $695 fee on the Platinum posts in 30 days —
you've redeemed $240 of it this year." Once a year per card. It is the reminder
that actually costs money to miss, because it is the one where the answer might
be *cancel the card*.

This one is easy: `credit-card.anniversary_date` is a stored `date-time` on a
**top-level, id-addressable, household-shared** resource, so it is the plain
`dateField` case with nothing special about it. `useCreditCardStats` already
computes `coveragePercent` and `netValue`, so the body writes itself. Ship this
first.

**B. A perk window closes unused.** "$50 dining credit expires Sunday."
Recurring, and where all the difficulty is.

#### The date does not exist in the database

`perk` has **no date field at all**. Its deadline is computed:
`getCurrentPeriod(perk.frequency, card.reset_mode, card.anniversary_date)` in
`credit-cards/utils/periodUtils.ts`. The only stored `period_start` /
`period_end` live on a **`redemption`** — a row that exists only *after* the
perk has been used.

So the record that would carry the reminder's due date is precisely the record
that exists only once the reminder is no longer wanted. There is nothing for
`ReminderSource.dateField` to point at, and this is the first source that
*requires* the `load`-a-scanner path rather than merely preferring it.

The good news: `periodUtils.ts` is pure TypeScript — no React, no DOM — so a
server-side scanner imports it directly and the notification cannot disagree
with the UI about when a perk expires. That is worth stating as a constraint:
**`periodUtils.ts` must stay React- and DOM-free**, because a reminder now
depends on it running headless.

#### What the integration needs

1. **A three-level traversal, with no flat endpoint.** Perks are
   `/credit-cards/{id}/perks/{id}`; redemptions are
   `/credit-cards/{id}/perks/{id}/redemptions/{id}`. There is no flat `/perks`.
   `useCreditCardPerks` and `usePerkRedemptions` already walk
   cards → perks → redemptions client-side and inject the parent ids; the
   scanner repeats that walk server-side, at roughly `1 + cards + perks`
   requests per firing. At household scale (a few cards, a dozen perks) that is
   ~15 round-trips a day — fine, but it is the concrete instance of open
   question §9.4, and it should be measured rather than assumed.

2. **`ReminderOccurrence.recordId` is not enough.** §3.3 assumed a bare id. A
   perk is not addressable by id alone. The chat tooling already hit exactly
   this and wrote it down — `ReferenceCheck` in `server/chat/tools.ts` notes
   that "only targets addressable by id alone" can be checked, because "a
   parent-scoped target can't be fetched without its parent path". **Fix the
   contract before phase 3**: `ReminderOccurrence` should carry a *path*
   (`credit-cards/{id}/perks/{id}`), and `reminder-subscription.record_id`
   likewise. Cheap now; a stored-data migration later.

3. **Volume control, which is the real UX risk here.** A monthly perk's window
   closes twelve times a year. Three cards with four monthly perks each is ~144
   notifications a year from one source — enough to train someone to swipe the
   whole app away. Three levers, and this source needs all of them: lead scaled
   by frequency (monthly ≈ 3–5 days, annual ≈ 30), **one digest per card**
   rather than one push per perk, and a value floor so a $7 streaming credit
   doesn't buy the same interruption as a $200 travel credit.

4. **"Unredeemed" is ambiguous, and the app has already half-answered it.**
   `getRedemptionStatus` returns `none | partial | full`, but `isRedeemed` is
   true for `partial` — $50 used of a $200 credit sorts to the bottom of the
   widget as done. A reminder probably wants `none` **and** `partial`, since
   partial is money still on the table. That means the reminder's rule
   deliberately differs from the widget's sort, which is fine but should be a
   decision rather than an accident.

5. **A 7-day threshold already exists — reuse it, don't add a third.**
   `UpcomingPerks.tsx` and `UpcomingPerksWidget.tsx` both hard-code
   `daysUntilDeadline <= 7` as "urgent". The reminder's default lead should be
   that same number, read from one shared constant instead of a third copy.

6. **A timezone sharp edge the reminder would make loud.** The period math uses
   local-component `Date` constructors deliberately — `toLocalISODate` exists
   precisely because `toISOString().split('T')[0]` shifts the day — and
   `dateKey()` compares by slicing the first ten characters off the stored
   string. Redemptions are written client-local; the cron runs server-local. A
   household member in another timezone can already store a `period_start` that
   doesn't `dateKey`-match the server's computed period, and
   `sumRedeemedForPeriod` would then miss it. Today that is a quiet mismatch in
   a widget's sort order. With reminders it becomes a push notification telling
   someone to use a credit they already used — worth fixing at the source
   before turning this source on.

#### What it does *not* need

Nothing about `audience` (§6.2): `credit-card`, `perk`, and `redemption` are
household-shared — none declares a `private` access model — so every member may see
every perk and the scanner can return occurrences unrestricted.

And dedup works unchanged: `scheduled_for` is the period's `end`, which is
naturally distinct per period, so next month's window is never confused with
this month's — the same property the events cron gets from an occurrence date.

#### The action button this source wants

`useRedeemPerk` already encapsulates exactly the thing you want to do from the
notification: it pre-computes the current period and records the redemption. A
*Mark redeemed* button on the push itself would be the whole interaction, with
no app visit — which makes this the strongest case in the repo for the service
worker's missing notification `actions` (§6.6).

### 6.2 The one with a real obstacle

**`documents` is the highest-value source and the hardest.** Two problems, both
worth stating before anyone estimates it:

1. **The dates aren't dates.** Doc-type extraction instructs the model to
   *"prefer an ISO date (YYYY-MM-DD) when unambiguous; otherwise record it
   exactly as shown"* — so `coverage_end` may hold `"Dec 2027"` or
   `"2 years from purchase"`. The scanner must parse leniently and **skip what
   it can't resolve**, rather than guess. A reminder fired on a
   misparsed date is worse than no reminder.
2. **Documents are private.** `document` and `collection` are in
   `access: { model: 'private' }` (`documents/resources.ts`) — a member
   sees their own rows plus whatever a grant reaches. The reminder cron holds an
   **admin token**, so its scanner sees every document in the household. A naive
   implementation would push "Your Acme warranty lapses in 30 days" to someone
   with no grant on it, leaking both the document's existence and its title.

   This is why `ReminderOccurrence.audience` exists. A scanner over a private
   collection must resolve the recipient set through the permissions model
   (`resolve()` in `homestead-core/permissions/resolve.ts`) and return it
   explicitly. The scheduler intersects `audience` with the subscriber list
   before sending. **A source over a private collection that omits `audience`
   is a bug**, and the registry should reject it at boot rather than leak at
   09:00 — cheap to check, since the model is declared on the resource.

### 6.3 Shared UI

- **`<ReminderBell source="..." recordId="..." />`** in
  `homestead-core/reminders/components/` — the generalization of
  `EventReminderSelect`. Any app drops it on a card; it reads and writes the
  subscription and renders the source's declared `leads` as options.
- **A "Due soon" dashboard widget** merging standalone and derived occurrences,
  sitting alongside the existing `events-upcoming` widget.
- **A settings section per source**, auto-generated from the declarative half of
  each `ReminderSource` — the same treatment `userSettings` already gets.
- **`/reminders`**: today / this week / later, with done and snooze. Snooze is
  a `due_at` write for a standalone reminder, and a suppression row for a
  derived one (see §9).

### 6.4 Chat

Beyond the free CRUD tools, the assistant becomes the natural entry point for
the standalone case, since natural language is where "next Thursday at 4"
belongs. Worth noting the resolution of relative dates happens model-side; the
resource stores an absolute `due_at`, so there's no ambiguity in storage.


### 6.5 Platform surfaces, not feature apps

The first pass of this doc looked only at feature apps. Several of the better
integrations aren't apps at all — they're platform concerns that today have a
date, a deadline, or a failure nobody is told about.

- **Personal access tokens.** `personal-access-token.expires_at` exists
  (`resources/builtins.ts`) and *nothing warns on it*. A PAT expiring silently
  breaks whatever script was using it, and the failure surfaces as a confusing
  401 somewhere else. `defaultOn: true`, audience = the token's owner (the
  collection is owner-scoped already), lead `[14, 1]`.
- **Failed background work.** Every cron firing, sync, and async method leaves
  an `operation` record with a `status` and an `error` (`apps/cron.ts` brackets
  each firing). Today a failing cron is visible only if a superuser happens to
  open `/superuser/operations`. A daily "3 operations failed since yesterday"
  reminder to superusers needs **no new data at all** — the ledger is already
  there, and the retention sweep over `operations` already proves the scan is cheap.

  One caveat worth writing down: this reminder can't report its own scheduler
  failing. It degrades to silence in exactly the case you most want to hear
  about, so it is a convenience, not monitoring.
- **Access grants never expire.** `access-grant` has no expiry field — sharing a
  document collection is permanent until someone revokes it by hand. Building
  grant expiry is a real change to the permissions model; a **reminder on a
  record-scope grant** ("you shared *Insurance* with Dana six months ago — still
  right?") gets most of the value for none of that risk. Worth considering as
  the cheap answer to a gap the permissions design left open.
- **Backups.** `homestead backup` is a manual CLI command (`homestead-cli/src/backup.ts`)
  with no schedule and nothing nagging about it. "You haven't backed up in 30
  days" is a reminder whose consequences are worse than any other on this list.
  The wrinkle: the reminder fires in the SPA, and the action is on a terminal —
  so it's a nudge, not a fix, unless backup gets a server-side trigger.
- **Actions, in both directions.** The `action` / `run` pair is a user-defined
  automation backed by a script, with `last_run_at` — and **no schedule field**.
  So: (a) remind when an action hasn't run or its last run failed, and more
  interestingly (b) let a reminder's due date *trigger an action* instead of only
  pushing a notification. That second direction hands the actions runtime the
  scheduler it currently lacks, and it's a small addition — an optional
  `action_id` on `reminder` and a branch in the scheduler. It also changes what
  the app is, from a notifier into a household scheduler, so it deserves an
  explicit yes or no rather than arriving by accident.

### 6.6 Delivery surfaces beyond web push

- **Email already works.** `EmailProvider.sendMessage` is implemented on the
  Gmail provider (`core/server/email/gmail.ts`), and `homestead.config.ts`
  documents the `gmail.send` scope. Email is *wiring*, not new capability — which
  makes the original "no email" non-goal wrong, and it's corrected in §2. It
  matters more than it sounds: web push requires a registered device with an
  enabled subscription, so today a household member who never granted
  notification permission is unreachable by any reminder at all. A per-user
  channel preference belongs in the settings section §6.3 already proposes.
- **Notification action buttons.** `public/sw.js` handles `push` and
  `notificationclick` but declares **no `actions`** on the notification. Adding
  *Snooze* / *Done* buttons to the push itself is where a reminder is actually
  useful — on a phone, not in the app — and it's the change that makes the
  snooze question in §9 worth resolving rather than academic. Small, self-
  contained, and it needs a route the service worker can hit without the SPA
  being open.
- **Inbound email.** `documents-ingest-email` already polls a mailbox every five
  minutes, files attachments, and dedups on provenance fields. Forwarding an
  appointment confirmation to the household address could raise a reminder the
  same way it raises a document — reusing the ingestion, dedup, and trashing
  machinery wholesale. Speculative, but it's the cheapest natural-language entry
  point after chat.
- **MCP.** `/api/mcp` re-exposes the chat tools over MCP under the caller's own
  token (`server/src/routes/mcp.ts`, gated by the settings app's `mcp_tools`
  flag). Because `reminder` is a plain resource, an external agent gets
  create/read/update/delete on household reminders **the moment the resource
  exists** — no MCP-specific work. This is the strongest argument for keeping
  `reminder` an ordinary collection rather than something bespoke.

### 6.7 Patterns worth copying rather than reinventing

- **`favorite`** (`resources/builtins.ts`) is already the polymorphic,
  user-parented pointer that `reminder-subscription` wants to be:
  `target_resource` (a singular) + `target_id` (a bare id), owner-scoped by its
  `user` parent, and explicitly tolerant of a stale target — *"a stale favorite
  is inert: pickers simply don't resolve it."* A derived reminder pointing at a
  deleted record should behave the same way, and the wording of that comment is
  the precedent to follow.
- **Per-user settings.** `userSettings` is already used by `dashboard`, `events`,
  and `people`, and renders an auto-generated form. Quiet hours, channel choice,
  and digest-vs-individual all fit it with no new UI.
- **PWA placement.** `AppWebConfig.homeScreenIcon` lets an app be installed to a
  phone's home screen under its own name and start path. Reminders is the app in
  this repo that most wants that, and it costs one field.

### 6.8 The consumer that isn't built yet

`home/app.config.ts` says, in its own words: *"The asset inventory and
maintenance schedule are planned follow-ups."*

A maintenance schedule **is** a reminders feature — furnace filter every three
months, gutters twice a year, water heater flushed annually — and it is the one
consumer that would exercise parts of this design nothing else does: recurrence
measured *from the last completion* rather than from a fixed calendar date, plus
a completion log so "every 3 months" means three months after you actually did
it.

That's a real constraint on §3.1's `recurrence` enum, which as drafted only
handles fixed calendar intervals. Either the enum grows an "interval since last
completion" mode, or home maintenance owns its own resource and registers as a
source. **This is worth deciding before phase 1 ships**, because it's the
difference between a `recurrence` enum and a slightly richer recurrence model —
cheap now, a migration later.

---

## 7. The risk: reminders vs. todos

These two overlap enough to become confusing, and the repo makes the tension
sharper than usual: **`todo` has no due date field**. So the honest options are:

**(a) Todos gain `due_at` and become a reminder source.** A todo is a thing to
do; a reminder is a time to be told. They compose: a dated todo raises a
reminder, and the reminder links back with `source_collection: 'todos'`. One
list of work, one list of pings.

**(b) Reminders absorb dated todos.** Simpler to build, worse to live with —
you'd end up with two half-lists and no clear rule for which to open.

**Recommendation: (a).** It's a two-field change to `todo` (`due_at`, plus a
declared source), it leaves each app's job intact, and it turns the largest
"nothing watches this" row in §1.4 into the platform's second consumer. It also
keeps the `reminder` resource honestly scoped to things that are *purely* a
ping — "move the car for street cleaning" — rather than making it a todo list
with worse ergonomics.

---

## 8. Deliberately excluded

- **Recipes.** "You haven't cooked this in a while" is a recommendation, not a
  reminder — no date exists to fire on, and the notification would be unwanted
  noise on a schedule nobody chose. It belongs on the dashboard, not in push.
- **Gift cards.** Would need a new `expires_on` field with no reliable source to
  populate it. Revisit if and when the field earns its place on its own merits;
  adding schema *for* a reminder is backwards.
- **Groceries.** The existing `:send-notification` button is a different
  interaction (broadcast on change, not schedule). Leave it alone. Recurring
  staples ("milk every week") are a plausible later source, but they're really a
  shopping-list feature wearing a reminder's clothes.
- **People.** "You haven't spoken to X in a year" fails the same test recipes
  does — no date exists to fire on, and the reminder is a judgement nobody asked
  for. Birthdays already live in events, which is the right split.
- **Games.** No dates, no resource definitions. Not a fit, and listing it here
  only so nobody has to re-check.

---

## 9. Open questions

1. **Snoozing a derived reminder.** A standalone reminder snoozes by moving
   `due_at`. A derived one can't — the date belongs to another app's record.
   Options: a `reminder-suppression` row under the user keyed by
   `(source, record_id, scheduled_for)`, or reusing the inbox row that already
   exists as the dedup ledger by marking it dismissed. The second adds no
   schema and the ledger is already the right shape; it's the likely answer,
   but it overloads a row whose current job is purely "this was sent."
2. **Per-source firing hour.** 09:00 suits birthdays and warranties, and is
   wrong for tonight's bins. Adding `hour?: number` to `ReminderSource` means
   the scheduler runs more than once a day (cheap — it's a list scan), but it
   makes "did today's reminders run?" a less crisp question in the Operations app.
3. **Timezone.** `dailyAtHour` is server-local (`apps/cron.ts`), which is fine
   for a single-household box and wrong the moment someone travels. Probably
   out of scope, but it should be a written-down limitation rather than a
   surprise.
4. **Lookahead cost.** Each firing runs every scanner over the full lookahead.
   With `listAll()` over documents and pickups that's fine at household scale;
   it should be measured, not assumed, before more sources land.
5. **Does a reminder trigger anything, or only notify?** §6.5 makes the case
   for an optional `action_id` that fires an `action` on the due date, which
   would give the actions runtime the scheduler it lacks. It also turns this
   from a notifier into a household scheduler. Decide deliberately.
6. **What happens to a household member with no push subscription?** Today they
   are simply unreachable — every reminder silently no-ops for them. Email (§6.6)
   fixes it; until then the settings UI should at least *say so* rather than
   showing lead-time controls that will never fire.
7. **Should `reminder` be household-shared or user-private?** ~~A
   `personal-reminder` twin may be needed~~ — **superseded.** Forking the
   resource the way todos did is the wrong answer, and reminders would be the
   second instance of it. See [Per-record visibility](./record-visibility): a
   declared `visibility` field plus a *filtered* household grant gets both modes
   in one collection, reusing enforcement the engine already compiles to SQL.
   Worth settling before the scheduler exists and rows accumulate, since
   reminders can then ship with the field and need no migration.

---

## 10. Suggested phasing

Each phase ships something usable on its own.

| Phase | Ships | Why this order |
|---|---|---|
| 1 | `reminder` resource, `/reminders` page, the platform cron, "Due soon" widget | Standalone reminders work. Chat support arrives free with the resource. No other app is touched. |
| 2 | `ReminderSource` + `reminder-subscription` + `<ReminderBell>`; port events; migrate `event-reminder` rows | The extension point is validated against the one app that already does this properly, and net deletes code (§5). |
| 3 | Sources for `home` pickups and `credit-cards` **annual fees** | Two easy, high-value sources, both anchored on a stored date. Proves the scanner contract without the perk-window difficulty. |
| 3b | `credit-cards` perk windows | Needs the §6.2b work first: a path-shaped `ReminderOccurrence`, digest batching, and the timezone fix. |
| 4 | `documents` expiry source, with `audience` enforcement and lenient date parsing | The hardest source, done once the contract is stable — and the one carrying the permissions risk (§6.2). |
| 5 | `todo.due_at` + todos as a source | The §7 decision, deferred until reminders have proven themselves. |

Two things sit outside that sequence rather than inside it:

- **Platform sources (§6.5)** — expiring PATs, failed operations, stale backups —
  are each small enough to land opportunistically once phase 2 exists. The
  failed-operations one is the best value per line of code in this whole
  document: the ledger already exists, the scan is already proven cheap, and it
  is the only entry here that tells you something is *broken* rather than merely
  upcoming.
- **Email delivery (§6.6)** is independent of every phase and can land whenever;
  it's the difference between reminders reaching the household and reaching only
  the members who granted push permission.

Phase 1 is worth doing even if nothing after it happens: it fills the "call the
plumber Thursday" hole that no current app covers.
