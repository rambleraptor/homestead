# Scheduled notifications — Design

**Status:** Release 1 shipped · supersedes most of
[`reminders.md`](./reminders.md) · **Audience:** contributors

> **Decided:** losing the checklist is accepted (§5.4) and household fan-out is
> out of scope for now (§7) — "remind me", not "remind us".

> **What shipped, and the two places the build departed from this document,**
> are in §6.4. Release 2 — dropping the `reminder` definition — is still ahead.

> One resource, `scheduled-notification`: a notification that hasn't been sent
> yet. It replaces the `reminder` collection, both delivery crons, the
> materializer, and the `notify_users` / `visibility` machinery around them.

---

## 1. What's actually wrong with reminders

The reminders design isn't wrong about the *outcome* — one delivery pipeline,
apps raising things instead of pushing their own notifications, two moments a
day when the house interrupts you. It's wrong about the **noun**. `reminder` is
three things wearing one resource:

1. **A checklist item.** `title`, `notes`, `status: pending | done`, a tab you
   look at, a checkbox you tick.
2. **An app's scaffolding.** A row per bin night, per event occurrence, per perk
   window, written by a materializer, keyed by `source_key`, reconciled daily.
3. **The delivery queue.** The thing the notify crons read to decide who gets
   pushed what, when.

Those three have incompatible requirements, and the code already says so out
loud. From `RemindersSection.tsx`:

> A reminder someone typed in is the point of the page. A reminder an *app*
> raised […] is scaffolding: it exists so the notification crons have something
> to deliver […] Left mixed in, the second kind buries the first within a
> fortnight, so app reminders are folded away behind a count.

> App rows are also read-only here. Their content is reconciled from the source
> record on every materializer run, so an edit would be silently reverted and a
> delete would reappear tomorrow.

A list where most rows are hidden by default, can't be edited, and come back if
you delete them is not a list. It's a queue with a list's UI bolted on. Every
awkward part of the current design follows from refusing to say that:

| Symptom | Root cause |
|---|---|
| `notify_users` exists at all | One row addresses many people, so the audience needs its own field. A cron-created row can't be *owned* by a user (the engine stamps the caller), so the audience couldn't be the owner either. |
| `visibility: private \| household` + a `per-record` access model | Same. A household-visible row that only pings one person needs two separate notions of "whose is this". |
| Delivery at exactly 09:00 and 18:00 | Two fixed slots are the cheapest way to fan out a shared row. `windowEnd()`, `MORNING_HOUR`/`EVENING_HOUR`, `MAX_LOOKBACK_DAYS`, and two near-identical cron handlers all exist to make that work. |
| Dedup by reading the inbox back | The reminder row has no per-recipient state, so "did we already tell Alice about this?" has to be reconstructed from `notification.source_id + scheduled_for`. |
| Reminders live in the **events** app | `reminder`, both delivery crons, and `materializer.ts` sit under `packages/homestead-apps/events/` and are imported by `home` and `credit-cards` via a relative `../../events/crons/materializer` path. Delivery infrastructure is a core concern wearing a feature app's clothes. |

Today that's ~883 lines across 58 files mentioning "reminder".

**The reframe:** keep #3, drop #1 and #2 as a stored noun. A scheduled
notification is a `notification` with a future `send_at`. Nothing more. Apps
that derive dates keep deriving them — they just write queue entries instead of
inventing checklist rows. The checklist, if it's ever wanted back, belongs on
`todo.due_at`, not on a second list next to it.

---

## 2. The resource

Lives in the **notifications core app**
(`packages/homestead-core/notifications/resources.ts`), next to `notification`
and `notification-subscription`. That's what "system level" means in this
codebase: a core app, always installed, owned by no feature. (`builtins.ts` is
for definitions with no owning app at all — `user-preference`, `action`, `run`
— and notifications is a real app with a real UI.)

**Parented under `user`**, like both its siblings:

```ts
{
  singular: 'scheduled-notification',
  plural: SCHEDULED_NOTIFICATIONS,          // 'scheduled-notifications'
  description:
    'A notification queued for delivery to this user at a future instant.',
  user_settable_create: true,
  parents: ['user'],
  fields: {
    // --- what gets delivered: mirrors `notification` ---
    title:   { type: 'string', required: true },
    message: { type: 'string', required: true },
    url: {
      type: 'string',
      description: 'path opened when the notification is tapped',
    },

    // --- when ---
    send_at: {
      type: 'string',
      format: 'date-time',
      required: true,
      description: 'RFC3339 instant (UTC) to deliver at',
    },

    // --- state: this row is its own delivery ledger ---
    status: {
      type: 'string',
      enum: ['scheduled', 'sent', 'canceled', 'missed', 'failed'],
      default: 'scheduled',
    },
    sent_at:  { type: 'string', format: 'date-time' },
    attempts: { type: 'number', description: 'delivery attempts so far' },
    last_error: { type: 'string' },
    notification_id: {
      type: 'string',
      reference: { resource: 'notification' },
      description: 'the inbox row this produced, under the same user',
    },

    // --- provenance ---
    source_app: {
      type: 'string',
      description:
        'id of the app that scheduled this (events, home, …); unset when a person did',
    },
    source_key: {
      type: 'string',
      description:
        "the scheduling app's stable idempotency key; opaque to everything else",
    },
    source_collection: { type: 'string' },
    source_id:         { type: 'string' },
  },
}
```

URL: `/users/{user_id}/scheduled-notifications/{id}`. Add the row to the
parent/child table in `CLAUDE.md`.

### 2.1 Why user-parented is the whole design

Every field the reminder design had to invent falls out of the parent path:

- **No `notify_users`.** Fan-out happens at *schedule* time, one row per
  recipient. Three people opted into bin night → three rows.
- **No `visibility`, no per-record access model.** `checkUserScope`
  (`engine/crud.ts`) already denies cross-user access on any user-parented
  subtree, superusers excepted. A scheduled notification is private by
  construction, the same way an inbox row is.
- **No cron-ownership problem.** The reminder design's `notify_users` exists
  because "a reminder row created by a cron cannot be *owned* by a user — the
  engine stamps the caller as owner, and the caller here is the scheduler."
  Under a parent path, the row's addressee is the path segment, not `_owner`.
  The scheduler writing to `/users/alice/scheduled-notifications` is
  unambiguous.
- **No inbox-replay dedup.** `status` on the row *is* the ledger. "Have we told
  Alice yet?" is a column, not a reconstruction.
- **Per-person send times are free.** Two rows, two `send_at` values. Nothing in
  the schema has an opinion about it.

The cost is row count: a household-wide ping is N rows instead of 1. At
household scale (2–6 people) that is not a cost. If it ever were, the fix is a
template row and a fan-out at delivery — but that's the design we're leaving.

### 2.2 Two fields worth arguing about

**`status` vs. deleting.** Cancel is a status change, not a delete — see §5.
The row has to survive as its own tombstone or a materializer resurrects it
tomorrow, which is exactly the bug the current Reminders tab documents.

**All five enum values are emitted.** `reminders.md` correctly criticised
`notification_type.day_before` for being "declared in three files and produced
by nothing". So: `scheduled` on create, `sent` on success, `canceled` by a
person, `missed` when the dispatcher finds a row too stale to send (§4),
`failed` after the retry budget is spent. `missed` and `failed` could collapse
into one value; they're kept apart because "we never tried" and "we tried and
push broke" want different follow-ups. Adding enum values later is a safe
PATCH, so this is reversible either way.

### 2.3 One adjacent change

`notification` has no `url` — the click-through only exists in the transient
push payload, so an inbox row can't link anywhere. Add `url` to `notification`
too, and have the dispatcher copy it across. Additive, one field, unblocks a
tappable inbox.

---

## 3. Interfaces

Three of them, for three kinds of caller.

### 3.1 Server-side: apps that derive dates

Replaces `reconcileReminders` and every direct `sendNotificationToUser` call in
a cron. Lives in
`packages/homestead-core/server/scheduled-notifications.ts`:

```ts
/** Queue one notification for one user. */
export function scheduleNotification(
  token: string,
  userId: string,
  plan: Omit<PlannedNotification, 'userId'>,
): Promise<ScheduledNotification>;

/** Cancel one. Idempotent; a no-op on a row that already left `scheduled`. */
export function cancelScheduledNotification(
  token: string,
  userId: string,
  id: string,
): Promise<void>;

/** Make this app's queue match `planned`. The materializer's replacement. */
export function reconcileScheduled(
  token: string,
  sourceApp: string,
  planned: PlannedNotification[],
  opts: { now: Date; keyPrefix?: string },
): Promise<ReconcileResult>;

export interface PlannedNotification {
  /** Bare user id. Fan-out is the caller's job — one entry per recipient. */
  userId: string;
  /** App-unique, stable, derived from the source record — never the clock. */
  sourceKey: string;
  title: string;
  message: string;
  url?: string;
  /** RFC3339 UTC. */
  sendAt: string;
  sourceCollection?: string;
  sourceId?: string;
}
```

**Reconcile rules**, scoped to rows carrying this `source_app`, keyed by
`(user_id, source_key)`:

| Situation | Action |
|---|---|
| Key in plan, no row | create, `status: 'scheduled'` |
| Key in plan, row is `scheduled` and content or `send_at` drifted | patch |
| Key in plan, row is `sent` / `canceled` / `missed` / `failed` | leave alone |
| Key not in plan, row is `scheduled` with a future `send_at` | delete (withdrawn) |
| Any row whose `send_at` has passed | leave alone |

Two invariants hold this together:

1. **Only past rows are ever deleted for age, and not by the reconcile.** A plan
   only ever contains future keys, so a canceled row can never be resurrected
   while its moment is still ahead. Old rows are swept by platform retention:
   `scheduled-notification` declares `retention: { days: 30, field: 'send_at',
   where: 'has(source_app)' }`, so an app's rows go 30 days after their moment
   and a row a person scheduled is never swept. (This replaced a per-app
   `pruneAfterDays` the reconcile used to apply.)
2. **A moved date is a new `source_key` when a re-announce is wanted.**
   Patching `send_at` on an unsent row moves the delivery. Once sent, reconcile
   won't touch it — so a producer that wants "the event moved, tell them again"
   must fold the instant into the key (`event:123:day_of:2026-05-04`), which is
   what today's keys already do. This replaces the current behavior where
   editing `due_at` re-notified as a side effect of the dedup key's shape.

A materializer shrinks to: compute the plan, hand it over. `events/crons/materialize.ts`
loses its `notify_users` resolution (it just fans out into per-user plan
entries instead) and `home/crons/pickup-reminders.ts` loses its
`../../events/crons/materializer` cross-app import.

### 3.2 Client-side: the Notifications app

Two tabs where there's one page today.

**Inbox** — unchanged. **Scheduled** — what's queued for you:

```
Scheduled                                    [+ Remind me]

  Today
    6:00 PM   Bins out tonight            [home]        [Cancel]
              Trash and Recycling.

  Thursday
    9:00 AM   Next week: Dad's birthday   [events]      [Cancel]
    4:00 PM   Call the plumber                    [Edit] [Cancel]

  ▸ Recently sent and canceled (6)
```

- Sorted by `send_at`, grouped by day, `status == 'scheduled'` only.
- A row scheduled by an app carries its badge (`getAppById(source_app)?.name`)
  and gets **Cancel only**. Editing an app row is meaningless — reconcile
  reverts it — which is the same lesson `RemindersSection` learned, applied up
  front instead of in a doc comment. To change it for good, change the thing
  behind it: the event's reminder setting, the pickup opt-in.
- A row a person made gets **Edit** and **Cancel**.
- Sent/canceled rows collapse behind a disclosure, until retention sweeps them.

Hooks mirror the existing ones (`useScheduledNotifications`,
`useScheduleNotification`, `useCancelScheduledNotification`), written against
the plain aepbase client on `/users/{me}/scheduled-notifications`.

**"Remind me", not "remind us".** `checkUserScope` means the browser can only
write under the signed-in user, so the plain client covers scheduling for
yourself and nothing else. That is the whole user-facing scope: no new server
route, no `recipients` parameter, no admin token anywhere near the SPA. §7
records the escape hatch if that changes.

Household delivery is unaffected, because it was never a browser concern.
Bin night still reaches everyone who opted in, and an event still reaches
everyone with an `event-reminder` — those are producers running under the
scheduler's admin token, fanning out into per-user rows server-side (§3.1).
The only thing that goes away is a person typing a reminder *at* somebody else,
and the honest read is that the household reminders worth having are the ones
an app already knows how to derive.

### 3.3 Chat: free

`scheduled-notification` is a registered definition with
`user_settable_create: true`, so `server/chat/tools.ts` generates
`create_/read_/update_/delete_scheduled_notification` with no wiring, and the
chat system prompt already instructs the model to fill a `user_id` param with
the signed-in user's id. "Remind me at four to take the chicken out" and "cancel
that" (a PATCH to `status: 'canceled'`) both work the day the resource lands.

This is the same argument `reminders.md` §3.1 made for `reminder` being an
ordinary resource, and it survives the reframe intact.

---

## 4. The dispatcher

One cron on the notifications app, replacing both `reminders-notify-*` hooks:

```ts
crons: [
  {
    id: 'notifications-dispatch',
    title: 'Deliver scheduled notifications',
    intervalSeconds: 60,
    runOnStart: true,
    load: () => import('./crons/dispatch'),
  },
],
```

Each tick:

1. List users. For each, list
   `/users/{id}/scheduled-notifications` with
   `filter: status == 'scheduled' && send_at <= '<now>'`.
   The engine's filter parser supports `<=` on schema fields
   (`engine/filter.ts`), and RFC3339 **UTC** strings sort lexicographically —
   so `send_at` must always be written with `toISOString()`, never a
   local-offset RFC3339 string. Worth a comment on the field and an assertion
   in the helper.
2. For each due row older than `LATE_GRACE_HOURS` (12): PATCH
   `status: 'missed'`, send nothing. A ping about last night's bins at
   tomorrow's breakfast is noise. This replaces `MAX_LOOKBACK_DAYS: 7`, which
   was that generous only because the delivery windows were 9 hours wide.
3. Otherwise `sendNotificationToUser(token, userId, {...row, notificationType: 'reminder'})`,
   then PATCH `status: 'sent'`, `sent_at`, `notification_id`.
4. On failure: increment `attempts`, record `last_error`, leave
   `status: 'scheduled'` so the next tick retries. At `attempts >= 3`, PATCH
   `status: 'failed'`. No separate retry queue — the row is the queue.

**Minute granularity is the point.** "Bins out tonight" is `send_at: 18:00`,
not "the evening slot". `windowEnd()`, `MORNING_HOUR`, `EVENING_HOUR`,
`ReminderSlot`, the two thin `notify-morning.ts` / `notify-evening.ts` wrappers,
and `MAX_LOOKBACK_DAYS` all delete.

**Cost:** one filtered list per user per minute — a handful of indexed SQLite
reads a minute on a household-sized instance. If that ever mattered, the fix is
engine-side parent-wildcard listing (`/users/-/scheduled-notifications`), which
the router doesn't do today and shouldn't be built for this.

**Idempotency** is a column read, not an inbox replay. A `runOnStart` catch-up,
a restart mid-tick, or a producer re-running its plan can't double-send,
because the send and the status PATCH bracket each other on the same row. The
worst case — a crash between the push and the PATCH — resends once, which is
strictly better than the current worst case (an inbox write failing leaves a
row that will resend on every subsequent firing).

---

## 5. Removing things

Four different verbs hide behind "remove a reminder", and the current design
answers them all with the same delete button. Separating them is most of the
usability win.

### 5.1 Cancel one queued notification

**PATCH `status: 'canceled'`.** Not a delete, for one reason: a delete of an
app-scheduled row comes back on the next reconcile. The row is its own
tombstone, and §3.1's sweep-only-the-past rule guarantees the tombstone
outlives the plan entry it's suppressing.

Deleting is still allowed (it's an ordinary resource), and for a row a person
created it's equivalent. The UI always cancels; the semantics are the same for
hand-made rows and correct for app ones.

A `:cancel` custom method would make intent explicit and let the server refuse
to cancel an already-sent row. It's not worth the wiring: a PATCH to `sent` is
harmless (the dispatcher only ever reads `scheduled`), and PATCH is what the
chat tools already generate.

### 5.2 Stop a whole class of them

"Stop telling me about bin night" is not a queue operation. It's the opt-in
behind the producer — `pickup_reminder` on the Home app, the `event-reminder`
row for an event — and turning it off makes the next reconcile withdraw every
future row for that user automatically. That already works, and it's why
`event-reminder` **survives this change**: it's the preference, not the
scaffolding.

The Scheduled tab should link to it. An app-badged row's badge is the affordance:
tap `[home]` → the Home app's reminder setting.

### 5.3 Clear one that already fired

The existing inbox: `read` / mark-as-read on `notification`. Unchanged.

### 5.4 Delete the reminders feature

See §6. Short version: the `reminder` collection, its tab, its form, its four
hooks, both delivery crons, and `materializer.ts` all go. `event-reminder`,
the `pickup_reminder` flag, the perk reminder settings, and the whole
`notification` inbox stay.

**What is given up, deliberately:** the checklist. `status: 'pending' | 'done'`,
the "here's what's outstanding" view, ticking a box. A scheduled notification
has no completion state because a notification isn't a task — it fires and it's
over. This is an accepted loss, not an oversight: it is the half of `reminder`
that never worked (§1), and keeping it is what forces the resource back into
being two nouns.

There is no plan to restore it here. If a dated checklist is ever wanted, it is
`todo.due_at` plus a producer that schedules a notification per dated todo —
one list, in the app that already owns lists. `reminders.md` §7 flagged the todo
boundary as "a real risk"; this is that risk resolving in todos' favour, which
is the outcome that keeps a second list from growing back.

---

## 6. Migration

Two releases, per `CLAUDE.md`'s retirement rule.

### 6.1 Release 1 — add and switch over

1. Add `scheduled-notification` + `SCHEDULED_NOTIFICATIONS`, add `url` to
   `notification`, add the `notifications-dispatch` cron.
2. Add `server/scheduled-notifications.ts` (§3.1) and the Scheduled tab (§3.2).
3. Convert the producers to `reconcileScheduled`, fanning
   `notify_users` out into per-user plan entries:
   `events/crons/materialize.ts`, `home/crons/pickup-reminders.ts`,
   `credit-cards/crons/perk-reminders.ts`.
4. One-shot migration `notifications-adopt-reminders`: for each `reminder` with
   `status != 'done'` and a future `due_at`, write one scheduled notification
   per recipient — `notify_users` if set, else `created_by` for a `private` row,
   else every user — carrying `source_app: reminder.type`,
   `source_key: reminder.source_key`, `send_at: due_at`. Idempotent on
   `(user, source_app, source_key)`; skip rows already adopted.
   This is the one place a hand-typed household reminder still fans out to
   everybody — a migration runs under an admin token, so existing rows carry
   over intact. It doesn't contradict §3.2: what stops is *creating* new ones
   that way, not honouring the ones already there.
5. Delete `reminders-notify-morning` / `-evening` and their handlers, and
   **remove the Reminders UI entirely** — the tab, the section, the form, the
   hooks, `reminderDate.ts`, `materializer.ts`, and the e2e coverage for all of
   it. The Events page goes back to one page.

At this point nothing writes `reminder`, nothing reads it for delivery, and
nothing renders it. The definition alone survives, so the adoption migration
has a collection to read.

### 6.2 Release 2 — remove

Shipped. Two corrections to what this section used to say, because both were
wrong in ways that changed the work:

**Removing the definition does not delete anything.** `syncResourceDefinitions`
only creates, patches, and no-ops — it has no delete path. Taking `reminder` out
of `events/resources.ts` merely stops managing it; the table and every row in it
would sit in the database indefinitely.

**`drops` is the wrong tool.** It authorizes dropping a *column* inside a
still-declared resource (`{ resource, field }`); there is no resource-level
equivalent, and `drops: [{ resource: 'reminder' }]` isn't even a valid entry.

The only way to remove a collection is to delete its definition through the
engine — `DELETE /aep-resource-definitions/reminder`, which routes to
`removeResource` → `dropResourceTable`. So the release removes the definition
*and* ships `notifications-drop-reminders-collection`, a `destructive: true`
migration that makes that call.

That migration lives in the **notifications** app, not events, and the reason is
ordering. Migrations run in app-registration order and, within an app, in array
order — so declaring it immediately after `notifications-adopt-reminders`
guarantees the adoption reads the collection before this deletes it. Filed under
events it would run *earlier* (events registers before the core apps), and a
single instance upgrading across both releases at once would lose every
hand-typed reminder to a `DROP TABLE` with no undo.

### 6.3 Inventory

"Reminder" appears in 58 files, but the word covers four separate things and
only two of them go. The dividing line: **the standalone `reminder` resource and
its delivery machinery disappear; every per-user opt-in that decides whether you
hear about something stays.**

**Disappears — the `reminder` noun**

| | |
|---|---|
| `events/resources.ts` | the `reminder` definition (the `event` and `event-reminder` defs stay) |
| `events/components/RemindersSection.tsx` | 307 lines |
| `events/components/ReminderForm.tsx` | 229 lines |
| `events/hooks/` | `useReminders`, `useCreateReminder`, `useUpdateReminder`, `useDeleteReminder` |
| `events/utils/reminderDate.ts` | whole file — form helpers *and* the slot constants |
| `events/types.ts` | `Reminder`, `ReminderFormData`, `ReminderStatus`, `ReminderVisibility`, `isAppReminder` |
| `events/index.ts` | drops `Reminder` / `ReminderFormData` / `ReminderStatus` — a package-API change |
| `events/components/EventsHome.tsx` | the tab machinery and `?tab=reminders`; back to one page |
| tests | `RemindersSection.test.tsx` (97), `notifyReminders.test.ts` (60), `reminderDate.test.ts`, `e2e/reminders-crud.spec.ts` (70) |
| `events/e2e/EventsPage.ts`, `e2e/helpers.ts` | the reminder half of the POM |

**Disappears — the delivery machinery**

| | |
|---|---|
| `events/crons/notifyReminders.ts` | 200 lines: `windowEnd`, `recipientsFor`, inbox-replay dedup, `MAX_LOOKBACK_DAYS` |
| `events/crons/notify-morning.ts`, `notify-evening.ts` | the two slot wrappers |
| `events/crons/materializer.ts` | replaced by `reconcileScheduled` in core |
| `reminders-notify-morning` / `-evening` | both hook declarations |

**Stays — every opt-in**

`event-reminder` (the resource, `EventReminderSelect`, `useEventReminder`,
`useEventReminders`, `EventCard`'s control), `ReminderOptInToggle` and the whole
`user-settings` opt-in surface, `PICKUP_REMINDER_SETTING`,
`PERK_REMINDER_SETTING`, `usersWithFlag`, and the toggles rendered by
`UpcomingPickups` / `UpcomingPerks`. These answer "do I want to hear about
this", which is §5.2's question and not the queue's business.

**Stays — the inbox.** `notification`, `notification-subscription`,
`NotificationsHome`, the badge, `sendNotificationToUser`, VAPID, and the
`'reminder'` value in `notification_type` — which the dispatcher keeps
stamping, so inbox history spanning the change reads consistently.

**Changes rather than disappears — the producers.** They keep their cron
ids, their horizons, their `source_key` schemes, and their opt-in resolution.
Two edits each: `reconcileReminders` → `reconcileScheduled` with per-user plan
entries instead of `notify_users`, and a literal delivery hour in place of the
imported slot constant. `home/crons/pickup-reminders.ts` and
`credit-cards/crons/perk-reminders.ts` currently import `EVENING_HOUR` /
`MORNING_HOUR` from `../../events/utils/reminderDate` — that cross-app reach
into a feature app goes away, and 18:00 and 09:00 become ordinary numbers on a
minute-granularity dispatcher rather than the only two times that exist.

### 6.4 What shipped, and where the build departed

Release 1 is in. The resource, `server/scheduled-notifications.ts`, the
`notifications-dispatch` cron, the Scheduled tab, the converted producers,
and the adoption migration all landed; the `reminders-notify-*` crons,
`notifyReminders.ts`, `materializer.ts` and the reminder write paths are gone.
Two things came out differently from §6.1, both for reasons the build surfaced.

**The migration adopts only hand-typed reminders.** §6.1 step 4 said to adopt
every pending reminder. That is wrong, and the reason is `runOnStart`: all three
producers declare it, so they rebuild their whole horizon within seconds of the
boot the migration runs on. Because the migration pass is fired off in the
background by `syncSchema` and the cron scheduler starts immediately after
(`server.ts`), the two genuinely race — and an adopted row plus a rebuilt row
for the same occurrence is a duplicate with nothing to distinguish it. So the
rule became: **if something else knows how to recreate it, let it.** Adopted rows
carry no `source_app`, which means no reconcile ever sees them and the race
cannot happen. What's carried over is exactly what nothing else can rebuild.

**`fanOut` is part of the producer API.** §3.1 left fan-out as "the caller's
job" and left each producer to write the loop. All three wanted the identical
one, so it's a named export next to `reconcileScheduled` — which also puts the
"one row means one person" rule somewhere it can be stated once.

Two smaller additions, both foreseen in §2.3 and §4: `notification` gained `url`
(so an inbox row can link somewhere), and `sendNotificationToUser` now returns
the inbox row's id, which the dispatcher stores on `notification_id`.

**Then there were two producers.** Perk-window reminders were withdrawn after
the fact — a monthly perk closes twelve times a year, and even digested per card
and floored by value it was more interruption than the app earned. What's left
is the pair worth having: event reminders and bin night. The perks list and its
dashboard widget still show what's closing; you look at them when you want to
know, which is the right posture for that app. §6.6 covers what removing a
producer costs.

**The Reminders UI is gone, not read-only.** §6.1 originally kept a read-only
list through Release 1, on the reasoning that the adoption migration runs once
and anything typed afterwards would be stranded. Closing the write paths does
solve that, and a read-only list has some transitional value — but it also
leaves a page whose only job is to apologise for itself. The whole surface went
instead: the tab, the section, the form, the four hooks, `reminderDate.ts`, the
orphaned `materializer.ts`, and the e2e spec and POM methods. `EventsHome` is a
single page again. What survives is the definition, so the migration has
something to read, and §6.2 is now only the drop.

### 6.5 Two consequences worth knowing about

**The `per-record` access model loses its only production user.** `reminder` is
the sole resource declaring `access: { model: 'per-record' }` — `documents` uses
`model: 'private'`, everything else is `shared`. The mechanism stays (the
`per-record` case in `permissions/household.ts`, the `translate.ts` encoding,
`resolve.ts`, and [`record-visibility.md`](./record-visibility.md)) but nothing
exercises it end to end once `reminder` is gone; only unit tests and a synthetic
`'thing'` fixture cover it. **Don't delete it** — it's the answer for the next
resource that is some-mine-some-ours, and todos is the obvious candidate. Do
know that it becomes untested-in-production, and that a scheduled notification
doesn't need it (the parent path does that job).

**One test fixture names a dead resource.**
`permissions/__tests__/householdFilter.test.ts` builds an inline `reminder`
definition to assert the per-record grant filter. It keeps compiling — the
fixture is a literal, not an import — but it should be renamed to whatever the
next per-record resource is, or to a neutral `thing`, so it stops describing
something that no longer exists.

---

### 6.6 Removing a producer

`credit-cards-drop-perk-reminders` is the worked example, and it exists because
**deleting a producer is not the same as deleting what it produced.** Two things
outlive the cron, and neither is obvious:

**The queue keeps its rows.** A producer writes up to its horizon — 30 days, for
perks — and the thing that would normally take those rows back is that same
producer's next reconcile. Delete the cron and the withdrawal never comes: the
notifications keep firing for a month, and the only way to stop them is
cancelling each by hand. So a producer's removal ships a migration that deletes
its still-`scheduled` rows. Deleted, not cancelled — cancelling exists so a
materializer can't resurrect a row, and there is no materializer left. Rows that
already fired stay as the record of what was sent.

**The opt-in may block its own removal.** Dropping a `userSettings` entry
removes a flattened column (`credit_cards__perk_reminder`) from
`user-preference`. Whether that is a non-event or a lasting problem depends on
something you can't see from the code:

- **Nobody ever toggled it on** → the column is empty, and an empty column drops
  without ceremony (`columnHasValues` in `engine/db.ts` is a `WHERE … IS NOT
  NULL LIMIT 1`). Nothing to do. This is the likely case for a setting that
  defaults to `false`.
- **Somebody did** → `updateResourceSchema` throws
  (`engine/registry.ts`), `syncSchema` catches and logs it, and boot carries on.
  The column lingering is harmless in itself. What is not harmless is that the
  PATCH carries the **whole** `user-preference` schema and the throw happens
  before any DDL, so nothing in it applies — including fields for settings other
  apps add later. One un-droppable column freezes the whole resource's schema,
  silently, on every subsequent boot.

The `drops:` escape hatch does **not** help: `collectAuthorizedDrops()` is
passed only to `syncResourceDefinitions`, and `syncUserSettingsSchema` sends no
`X-Homestead-Authorized-Drops` header, so a declared drop is invisible to it.
The only way through is an empty column.

Hence the clearing loop, which is really about determinism rather than repair:
migrations run *before* the user-settings sync inside `syncSchema`, so nulling
the values there makes the drop land on the same boot **whether or not anyone
opted in**, instead of the outcome depending on a household's history.

**Since fixed.** `authorizedDrops` is now threaded into both generated-schema
syncers — `syncUserSettingsSchema` and `syncAppFlagsSchema`, which had the same
gap — so a `userSettings` or flag removal authorizes its own column drop exactly
as a resource-field removal does. Name the resource by its `singular` in the
migration's `drops`: `{ resource: 'user-preference', field:
'credit_cards__perk_reminder' }`, or `{ resource: 'app-flag', … }`.

`credit-cards-drop-perk-reminders` keeps its clearing loop *and* declares the
drop. They're belt and braces rather than alternatives: the loop empties the
column, and the declaration means the sync still succeeds if the loop only got
partway.

## 7. Deliberately not doing

- **Recurrence on the row.** A repeating scheduled notification is the producer's
  job — an event recurs yearly, a pickup calendar recurs weekly, and
  re-materializing each occurrence from the real source beats a rule copied onto
  the queue entry. If a hand-made repeat is ever wanted, `repeat` +
  `repeat_until` plus a re-schedule step in the dispatcher is the only change,
  and the dispatcher is the one place that would touch.
- **Channels.** No `channels: ['push','inbox']` field. `sendNotificationToUser`
  does push-plus-inbox and that's the only behavior there is. Add the field when
  email delivery lands, not before.
- **A digest.** "Everything due today in one push" is appealing and is a
  dispatcher-level feature (group a tick's due rows per user before sending),
  not a schema one. It can be added later without touching the resource.
- **Household fan-out from the UI.** Scheduling for someone else is out of
  scope: `checkUserScope` stays as it is, and the SPA writes only under the
  signed-in user. Producers still fan out server-side, so nothing about bin
  night or event reminders depends on this. If "remind us both to leave at 6"
  is ever wanted, the shape is settled and small — a route mirroring
  `POST /api/notifications/send-test`:

  ```
  POST /api/notifications/schedule
  { recipients: 'household' | string[], title, message, url?, send_at }
  ```

  authenticating the caller and writing one row per recipient with an admin
  token, ~40 lines. It is the only sanctioned fan-out path; widening
  `checkUserScope` instead is not on the table.
- **`ReminderSource` / `reminder-subscription` / `lead_days`.** The unbuilt half
  of `reminders.md`. Producers already own their date math; a scanner extension
  point buys nothing once the queue is the shared surface. `lead_days` remains
  the right idea *inside* a producer that wants configurable lead times — it
  just isn't platform machinery.
