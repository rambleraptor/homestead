# Notifications

This guide is for module authors who want their feature to send notifications.
It covers the data model, the immediate-delivery path, and the wiring you need
to add when introducing notifications in a new module.

For VAPID key generation, service-worker setup, and ops/deployment concerns,
see [`NOTIFICATIONS_SETUP.md`](./NOTIFICATIONS_SETUP.md). That doc predates the
aepbase migration and parts are stale, but the VAPID + service-worker steps
still apply.

## Table of contents

- [Architecture](#architecture)
- [Data model](#data-model)
- [Sending immediate notifications](#sending-immediate-notifications)
- [Reading notifications in the UI](#reading-notifications-in-the-ui)
- [Adding notifications to a new module](#adding-notifications-to-a-new-module)
- [Testing](#testing)

## Architecture

There are two aepbase collections, both parented under `user`
(see [`packages/homestead-modules/notifications/resources.ts`](../packages/homestead-modules/notifications/resources.ts)):

| Collection                  | URL pattern                                | Purpose                                                                 |
|-----------------------------|--------------------------------------------|-------------------------------------------------------------------------|
| `notifications`             | `/users/{uid}/notifications/{id}`          | One row per delivered notification (the user's inbox)                   |
| `notification-subscriptions`| `/users/{uid}/notification-subscriptions/{id}` | One row per browser/device push endpoint (created from Settings)    |

Because every collection is user-parented, regular users only ever see their
own rows. There's no `user_id` filter to write — the URL implies it. The
`user_id` field on `notification` rows is kept as a denormalized convenience.

The frontend exports collection names from `@/core/api/aepbase`:

```ts
AepCollections.NOTIFICATIONS              // 'notifications'
AepCollections.NOTIFICATION_SUBSCRIPTIONS // 'notification-subscriptions'
```

## Data model

### `notification`

A delivered notification. Created by the server when a push goes out (or
attempted). Read by the UI to populate the bell / inbox.

Key fields (`frontend/src/modules/notifications/types.ts`):

- `title`, `message` — what the user sees
- `notification_type` — `day_of` | `day_before` | `week_before` | `system`
- `read`, `read_at` — read state, set client-side via
  `useMarkNotificationAsRead`
- `source_collection`, `source_id` — what record this is about
  (e.g. `people` / `<personId>`); used for icons and deep links
- `person_id` — **deprecated**; prefer `source_collection`+`source_id`

### `notification-subscription`

A web-push endpoint. Settings → Notifications creates these when the user
clicks "Enable Push Notifications". Module authors generally do not touch
this collection directly — read or send through the helpers below.

## Sending immediate notifications

Use this when an action should fire a push right now (a chore was assigned,
a recipe was updated, a one-off reminder).

### From a server route

Wrap your handler with `sendUserNotification`:

```ts
// frontend/src/app/api/<feature>/notify/route.ts
import { NextRequest } from 'next/server';
import { sendUserNotification } from '../../notifications/utils/send-user-notification';

export async function POST(request: NextRequest) {
  return sendUserNotification(request, {
    title: 'Chore assigned',
    body: 'You picked up "Take out trash"',
    tag: 'chore-assigned',
    url: '/chores',
    sourceCollection: 'chores',
    sourceId: '<chore-id>', // optional
  });
}
```

`sendUserNotification` ([`utils/send-user-notification.ts`](../frontend/src/app/api/notifications/utils/send-user-notification.ts))
handles VAPID, fetches the caller's `notification-subscriptions`, sends the
push, prunes expired endpoints, and writes the `notifications` row. It
authenticates from the request's bearer token, so the notification always
goes to the **calling** user.

`/api/notifications/send-test` and `/api/notifications/send-grocery` are
two-line wrappers around this helper — copy them when you need a new
fire-and-forget endpoint.

## Reading notifications in the UI

The notifications module ships these hooks (importable from
`@/modules/notifications`):

| Hook                              | Returns                                       |
|-----------------------------------|-----------------------------------------------|
| `useNotifications()`              | All `notifications` rows for the current user |
| `useNotificationStats()`          | `{ total, unread, read }`                     |
| `useMarkNotificationAsRead()`     | Mutation, takes a notification id             |

Plus `useUnreadNotifications()` from the dashboard module for a top-N inbox
preview.

For your own module, you usually don't need to render notifications — link
to `/notifications` (the unified inbox at
`frontend/src/app/(app)/notifications/page.tsx`). If you do want a
module-scoped feed, query `notifications` filtered client-side by
`source_collection === '<your-collection>'`.

## Adding notifications to a new module

1. Add a route under `frontend/src/app/api/<feature>/...` that calls
   `sendUserNotification`.
2. Trigger it from the client with a regular `fetch` (forward the user's
   aepbase bearer token via the standard `aepbase` wrapper, which the
   server `authenticate` helper validates).
3. Decide on a stable `tag` so repeated pushes collapse rather than stack.
4. Set `source_collection` to your aepbase plural (e.g. `'people'`, not
   `'person'`) and `source_id` to the record id, so the inbox can pick
   the right icon and deep-link.

## Testing

- **Unit:** mock `aepbase` (already done globally in `src/test/setup.ts`)
  and assert your handler invokes `sendUserNotification` with the right
  payload.
- **Manual smoke test:** with the dev stack running, `POST` to
  `/api/notifications/send-test` from the browser DevTools console (the
  Settings page wires this up via `useSendTestNotification`). You should
  see a push and a new row in your inbox.
