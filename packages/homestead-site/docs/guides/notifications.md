# Notifications

> Using an instance rather than building one? See
> [Reminders & Notifications](./reminders) for turning on push, seeing what's
> queued, and switching reminders off.

Send push notifications from your app to a user, and optionally read them back.
Homestead signs and delivers the web push to the user's devices and records it
in their inbox. A request-driven notification goes to the **calling** user —
you don't manage push subscriptions or inbox rows yourself. A background job
(e.g. a cron) can instead target any user by id — see
[Send from a background job](#send-from-a-background-job).

This page covers:

- [Set up VAPID keys](#set-up-vapid-keys)
- [Send a notification](#send-a-notification)
- [Send from a custom method](#send-from-a-custom-method)
- [Send from a server route](#send-from-a-server-route)
- [Send from a background job](#send-from-a-background-job)
- [Send to a specific device](#send-to-a-specific-device)
- [Message a household member](#message-a-household-member)
- [Read notifications](#read-notifications)
- [Add notifications to a new app](#add-notifications-to-a-new-app)
- [Test notifications](#test-notifications)

---

## Set up VAPID keys

Push needs a VAPID keypair. Generate one per environment:

```bash
npx web-push generate-vapid-keys
```

Set the keys in `packages/homestead-app/.env` (copy
[`.env.example`](https://github.com/rambleraptor/homestead/blob/main/packages/homestead-app/.env.example)
to start):

```bash
VAPID_PUBLIC_KEY=<public-key>
VAPID_PRIVATE_KEY=<private-key>
VAPID_EMAIL=mailto:you@example.com
```

The browser uses the public key to subscribe; the server uses both keys to sign
pushes. Keep `VAPID_PRIVATE_KEY` secret.

Set the keys before you build: `make build` and `make homestead` bake the
public key into the SPA bundle. Web push requires HTTPS (localhost is exempt).

---

## Send a notification

Call one server-side helper from
[`packages/homestead-core/server/notifications.ts`](https://github.com/rambleraptor/homestead/blob/main/packages/homestead-core/server/notifications.ts).
It returns a web `Response`, so it works in both server routes and app custom
methods. There are two entry points:

```ts
import {
  sendUserNotification,    // authenticates the request, then sends
  sendNotificationForAuth, // caller already authenticated (app methods)
  type UserNotificationOptions,
} from '@rambleraptor/homestead-core/server/notifications';
```

Both take a `UserNotificationOptions`:

| Field              | Required | Description                                                       |
|--------------------|----------|-------------------------------------------------------------------|
| `title`            | yes      | Notification title the user sees                                  |
| `body`             | yes      | Notification body text                                            |
| `tag`              | yes      | Stable id; pushes with the same tag collapse instead of stacking  |
| `url`              | yes      | Path to open when the notification is clicked                     |
| `sourceCollection` | no       | aepbase plural this is about (e.g. `'people'`), for icon + link   |
| `sourceId`         | no       | Record id, for the inbox icon and deep link                       |

Use a stable `tag` (e.g. `'grocery-notification'`) so repeated pushes replace
each other. Set `sourceCollection` to the aepbase plural — `'people'`, not
`'person'`.

---

## Send from a custom method

Use this when the notification comes from your app. App endpoints are resource
custom methods (AEP-136): you declare them on a resource and the server's
`/api/aep` gateway serves `POST /api/aep/<plural>:<verb>`, authenticating the
caller first. Your handler receives the authenticated caller and passes it to
`sendNotificationForAuth(auth, …)`.

Write the handler. The grocery "list updated" push is the working example
([`packages/homestead-apps/groceries/methods/send-notification.ts`](https://github.com/rambleraptor/homestead/blob/main/packages/homestead-apps/groceries/methods/send-notification.ts)):

```ts
import { sendNotificationForAuth } from '@rambleraptor/homestead-core/server/notifications';
import type { CustomMethodHandler } from '@rambleraptor/homestead-core/resources/types';

const handler: CustomMethodHandler = async ({ auth }) => {
  return sendNotificationForAuth(auth, {
    title: 'Grocery List Updated',
    body: 'The grocery list has been updated. Check it out!',
    tag: 'grocery-notification',
    url: '/groceries',
    sourceCollection: 'grocery_items',
  });
};

export default handler;
```

Wire it into the collection's resource definition via `customMethods`
([`packages/homestead-apps/groceries/resources.ts`](https://github.com/rambleraptor/homestead/blob/main/packages/homestead-apps/groceries/resources.ts)):

```ts
customMethods: {
  'send-notification': {
    target: 'collection',
    load: () => import('./methods/send-notification'),
  },
},
```

Trigger it from the client with `aepbase.customMethod('<plural>', '<verb>')`
(see
[`useSendGroceryNotification.ts`](https://github.com/rambleraptor/homestead/blob/main/packages/homestead-apps/groceries/hooks/useSendGroceryNotification.ts)).

---

## Send from a server route

Use this when you own a core server endpoint instead of an app method. The
route authenticates the request itself, so it calls
`sendUserNotification(request, …)` with Hono's raw `Request` (`c.req.raw`). The
built-in test endpoint is the working example
([`packages/homestead-server/src/routes/notifications.ts`](https://github.com/rambleraptor/homestead/blob/main/packages/homestead-server/src/routes/notifications.ts)):

```ts
import { Hono } from 'hono';
import { sendUserNotification } from '@rambleraptor/homestead-core/server/notifications';

export const notificationsRoute = new Hono();

notificationsRoute.post('/send-test', (c) =>
  sendUserNotification(c.req.raw, {
    title: 'Test Notification',
    body: 'If you see this, push notifications are working!',
    tag: 'test-notification',
    url: '/notifications',
  }),
);
```

---

## Send from a background job

A cron (or any headless job) has no calling user, so it targets a recipient by
id with `sendNotificationToUser(token, userId, options)`. Pass the short-lived
admin token the scheduler hands your handler (`ctx.token`); it can read that
user's subscriptions and write their inbox row.

**Only do this for something that has just happened.** If the notification is
about a moment in the future — an event next week, a bin collection tomorrow
night, a window closing on Sunday — do not send it from a cron that wakes up at
the right time. Schedule it (next section) and let the dispatcher deliver it.
That is the difference between "the hauler sync found a schedule change" and
"tell me about bin night", and getting it wrong is how an app ends up with its
own private notification pipeline, its own idea of what hour to interrupt
someone, and its own dedup bugs.

```ts
import { sendNotificationToUser } from '@rambleraptor/homestead-core/server/notifications';

await sendNotificationToUser(ctx.token, userId, {
  title: 'Import finished',
  body: '42 receipts filed.',
  tag: `import-${runId}`,
  url: '/hsa',
  sourceCollection: 'hsa-receipts',
  sourceId: runId,
});
```

The response JSON carries `notificationId` — the inbox row the send wrote —
alongside `sent` / `failed` device counts.

---

## Schedule a notification for later

`scheduled-notification` is the delivery queue: a notification that hasn't been
sent yet, parented under the user it is addressed to
(`/users/{id}/scheduled-notifications`). One row is one person, so **fan-out
happens when you schedule, not when it delivers**. The
`notifications-dispatch` cron runs every minute, sends whatever has come due,
and stamps the outcome back onto the row — so `status` is the delivery ledger
and you never need to write dedup logic.

Everything lives in
[`@rambleraptor/homestead-core/server/scheduled-notifications`](https://github.com/rambleraptor/homestead/blob/main/packages/homestead-core/server/scheduled-notifications.ts).

### One-off

```ts
import { scheduleNotification } from '@rambleraptor/homestead-core/server/scheduled-notifications';

await scheduleNotification(ctx.token, {
  userId,
  title: 'Passport expires in 30 days',
  message: 'Renewals are taking 8 weeks right now.',
  url: '/documents',
  sendAt: expiry.toISOString(),
  sourceCollection: 'documents',
  sourceId: doc.id,
}, 'documents');
```

The last argument stamps `source_app`, which marks the row as app-raised: it
becomes read-only in the Scheduled tab (its content is derived, so an edit would
be reverted) and it becomes visible to that app's reconcile.

### Recurring, from records you own

The usual shape. Once a day, work out every notification your records imply over
the next week or so and hand over the whole list; `reconcileScheduled` makes the
stored rows match — creating what's missing, patching what drifted, withdrawing
a future row nothing implies any more.

```ts
import {
  fanOut,
  reconcileScheduled,
  type PlannedNotification,
} from '@rambleraptor/homestead-core/server/scheduled-notifications';

const planned: PlannedNotification[] = [];
for (const day of upcoming) {
  planned.push(
    ...fanOut(
      {
        sourceKey: `pickup:${day.date}`,
        title: 'Bins out tonight: Trash and Recycling',
        message: 'Collected tomorrow, Tuesday, June 16.',
        url: '/home',
        sendAt: eveningBefore(day).toISOString(),
      },
      optedInUserIds,
    ),
  );
}

await reconcileScheduled(ctx.token, 'home', planned, { now });
```

The contract is `sourceKey`: an app-unique, stable string identifying *what the
notification is for*. Because your cron runs daily over an overlapping horizon,
that key is the only thing standing between one notification and seven copies of
it — so derive it from the source record, **never from the clock**. Fold the
instant into the key (`<event id>:day_of:2026`) when a moved date should
re-announce; leave it out when it shouldn't.

Two rules the reconcile follows that are worth knowing:

- **A row already sent, cancelled, missed or failed is never rewritten.**
  Cancelling is a status rather than a delete precisely so your next run can't
  resurrect what someone turned off.
- **Past rows are left alone.** Once a row's moment has passed it is the record
  of what was announced, and the reconcile never deletes it. Old ones are
  cleaned up by the platform: an app's scheduled notifications are deleted 30
  days after their `send_at` (the `retention` declaration on
  `scheduled-notification`), so your cron needs no cleanup of its own. A row a
  person scheduled is never swept.

With nobody opted in, pass an empty plan rather than skipping the call — the
reconcile is what withdraws the rows written for whoever just opted out.

### Worked example

[`home/crons/pickup-reminders.ts`](https://github.com/rambleraptor/homestead/blob/main/packages/homestead-apps/home/crons/pickup-reminders.ts)
is the smallest complete one: a per-person opt-in, a horizon, one notification
per collection day listing every stream, and a `source_key` derived from the
date.

---

## Send to a specific device

Each registered device is a `notification-subscription` record, and carries an
item-target custom method (AEP-136) that pushes to that one device:

```
POST /api/aep/notification-subscriptions/{id}:send-notification
```

The caller is resolved from auth, so the addressed id is all that's needed —
the user-parented form
(`/api/aep/users/{user-id}/notification-subscriptions/{id}:send-notification`)
works too. Because it's a standard AEP custom method (not a bespoke route),
it's reachable from anything that speaks the engine — the CLI, scripts, `curl`
— and it's described in the OpenAPI doc (`/api/aep/openapi.json`) with its
request and response schemas:

```bash
# Bare POST → sends a test notification to that device
curl -X POST "$HOMESTEAD_URL/api/aep/notification-subscriptions/$DEVICE_ID:send-notification" \
  -H "Authorization: Bearer $TOKEN"

# Or pass a JSON body to send real content
curl -X POST "$HOMESTEAD_URL/api/aep/notification-subscriptions/$DEVICE_ID:send-notification" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{ "title": "Dinner", "body": "Roast is ready", "url": "/recipes/42" }'
```

The body is optional and mirrors `UserNotificationOptions` (`title`, `body`,
`tag`, `url`, `sourceCollection`, `sourceId`); with no body it sends a test
notification. Delivery is restricted to the addressed device, and — like every
send — one inbox row is recorded. List a user's device ids with
`GET /api/aep/users/{user-id}/notification-subscriptions`.

From the client, invoke it with
`aepbase.customMethod('notification-subscriptions', 'send-notification', body, { id })`.

---

## Message a household member

Everything above notifies *the caller* (or, from a job, anyone). To send
**another member** a message — a push to their devices and a row in their inbox
that says who it's from — call `:send` on their inbox:

```bash
curl -X POST "$HOMESTEAD_URL/api/aep/users/$SAM_ID/notifications:send" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{ "title": "Running late", "body": "Be there by 6:30", "url": "/groceries" }'
# → { "notification": "users/u2/notifications/n_81", "delivered": 2, "failed": 0 }
```

Find user ids with `GET /api/household`. The same method is everywhere the
engine is:

- **The app:** Notifications → **New message**, or open `SendMessageDialog`
  (`@rambleraptor/homestead-core/notifications/components/SendMessageDialog`)
  from your own app with a `url` back to what the message is about; the hook
  underneath is `useSendMessage()`.
- **The CLI:** `homestead resources --user $SAM_ID notification send --@data msg.json`.
- **MCP:** the `notifications` tool's `send` action, on connections that may
  write.
- **Server code:** `sendMessage({ from, to, title, body, url })` from
  `@rambleraptor/homestead-core/server/messages` — no HTTP hop, and no rate
  limit (your code is the caller).

The method holds the rules, whoever calls it:

- Sender and recipient must both be in the household (superusers and anyone
  with the Admin or Member role). A guest can't send or be sent to.
- The caller must be able to write notifications: every signed-in member can;
  a personal access token only if it was granted `write` on `notification`; a
  read-only connection never.
- `title` is required, at most 80 characters; `body` at most 500; `url` must be
  a path in this Homestead (`/…`, never another site). Plain text only.
- At most 10 messages an hour per sender — then `429` with `Retry-After`. A
  refused message doesn't count.

The inbox row is written even when push isn't set up or the recipient has no
devices, so a message is never lost. It carries `notification_type: 'message'`
and `from_user`, and the inbox shows "From Sam" on it; the push reads
"Sam: Running late".

The built-in assistant can send messages too — "tell Sam I'm running late" —
but the method is marked `confirm: true`, so each one waits on an approval card
until you tap **Approve** (see
[Asking before a model acts](./resources#asking-before-a-model-acts)).

---

## Read notifications

Most apps don't render notifications — link to `/notifications`, the shared
inbox, instead. To read them in your app, use these hooks:

| Hook                              | Import                                                                  | Returns                                       |
|-----------------------------------|-------------------------------------------------------------------------|-----------------------------------------------|
| `useNotifications()`              | `@rambleraptor/homestead-core/notifications/hooks/useNotifications`        | All notifications for the current user        |
| `useNotificationStats()`          | `@rambleraptor/homestead-core/notifications/hooks/useNotificationStats`    | `{ total, unread, read }`                     |
| `useMarkNotificationAsRead()`     | `@rambleraptor/homestead-core/notifications/hooks/useMarkNotificationAsRead` | Mutation, takes a notification id           |

For a top-N inbox preview, use `useUnreadNotifications()` from
`@rambleraptor/homestead-core/dashboard/hooks/useUnreadNotifications`.

What hasn't been delivered yet is a separate list: `useScheduledNotifications()`
from `@rambleraptor/homestead-core/notifications/hooks/useScheduledNotifications`
reads the signed-in user's queue, and `/notifications?tab=scheduled` renders it.
Note the browser can only read and write its own user's rows (`checkUserScope`),
so scheduling for somebody else is a server-side operation.

Each notification carries `title` and `message` (what the user sees), `read`
and `read_at` (read state), `url` (where tapping it lands), and
`source_collection` and `source_id` (the record it's about). For an app-scoped feed, read the notifications and filter
client-side by `source_collection === '<your-collection>'`.

---

## Add notifications to a new app

1. Write a custom-method handler under your app (e.g.
   `methods/send-notification.ts`) that default-exports a `CustomMethodHandler`
   calling `sendNotificationForAuth(auth, { … })`.
2. Declare it on a resource in your app's `resources.ts` `customMethods` map:

   ```ts
   customMethods: {
     'send-notification': {
       target: 'collection',
       load: () => import('./methods/send-notification'),
     },
   },
   ```

   On boot, the server serves it at `POST /api/aep/<plural>:<verb>`.
3. Trigger it from the client with `aepbase.customMethod('<plural>', '<verb>')`
   (see
   [`useSendGroceryNotification.ts`](https://github.com/rambleraptor/homestead/blob/main/packages/homestead-apps/groceries/hooks/useSendGroceryNotification.ts)).
4. Use a stable `tag` so repeated pushes replace each other.
5. Set `sourceCollection` to your aepbase plural (`'people'`, not `'person'`)
   and `sourceId` to the record id.

---

## Test notifications

Write a unit test: mock `aepbase` (done globally in
`packages/homestead-app/src/test/setup.ts`) and assert your hook calls
`aepbase.customMethod(...)` — or your server route calls
`sendNotificationForAuth` — with the right payload.

Run a manual smoke test: with the dev stack running, `POST` to
`/api/notifications/send-test` from the browser DevTools console. (The Settings
page wires this up via `useSendTestNotification`.) You see a push and a new row
in your inbox.

By default the test goes to every device the user has registered. To target a
single device, send its `notification-subscription` id in the body:

```json
{ "subscriptionId": "<notification-subscription-id>" }
```

The Settings screen lists each registered device (by a friendly label derived
from its user agent) and uses this to send a test to — or deregister — one
device at a time.
