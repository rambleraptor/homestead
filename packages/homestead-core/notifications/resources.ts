import type { ResourceDefinition } from '@rambleraptor/homestead-core/resources/types';
// Plural identifiers live in core so core-side hooks (push subscription
// management) can reach them without depending on this app. We re-export
// from here so app-local code has a single import surface.
import {
  NOTIFICATIONS,
  NOTIFICATION_SUBSCRIPTIONS,
  SCHEDULED_NOTIFICATIONS,
} from '@rambleraptor/homestead-core/notifications/constants';

export { NOTIFICATIONS, NOTIFICATION_SUBSCRIPTIONS, SCHEDULED_NOTIFICATIONS };

export const notificationsResources: ResourceDefinition[] = [
  {
    singular: 'notification',
    plural: NOTIFICATIONS,
    description: 'A notification delivered (or scheduled) to a user.',
    user_settable_create: true,
    parents: ['user'],
    fields: {
      person_id: {
        type: 'string',
        description: 'deprecated, use source_* fields',
      },
      title: { type: 'string', required: true },
      message: { type: 'string', required: true },
      notification_type: {
        type: 'string',
        enum: ['day_of', 'day_before', 'week_before', 'reminder', 'system', 'message'],
        required: true,
      },
      // Who sent it, for a `message` from another household member
      // (`:send`); empty for anything Homestead sent itself.
      from_user: { type: 'string', reference: { resource: 'user' } },
      scheduled_for: { type: 'string', format: 'date-time' },
      // Where tapping this notification lands. Previously the click-through
      // existed only in the transient push payload, so an inbox row couldn't
      // link anywhere; the dispatcher copies it across from the scheduled row.
      url: { type: 'string', description: 'path opened when the notification is tapped' },
      sent_at: { type: 'string', format: 'date-time' },
      read: { type: 'boolean' },
      read_at: { type: 'string', format: 'date-time' },
      source_collection: { type: 'string' },
      source_id: { type: 'string' },
    },
    // POST /api/aep/users/{id}/notifications:send — message a household member.
    customMethods: {
      send: {
        target: 'collection',
        // The assistant gets it once it can ask before sending (an approval
        // card); until then a person composes every message it would send.
        modelTools: { chat: false },
        description:
          'Send this user a message from you: a push to their devices and a row in their ' +
          'inbox. They must be in your household. At most 10 messages an hour.',
        request: {
          type: 'object',
          required: ['title'],
          properties: {
            title: { type: 'string', description: 'The message, in a few words (at most 80 characters).' },
            body: { type: 'string', description: 'More detail (at most 500 characters).' },
            url: {
              type: 'string',
              description: 'A path in this Homestead opened when it is tapped, e.g. /groceries.',
            },
          },
        },
        response: {
          type: 'object',
          properties: {
            notification: { type: 'string', description: 'The inbox row written: users/{id}/notifications/{id}.' },
            delivered: { type: 'integer', description: 'Devices the push reached.' },
            failed: { type: 'integer', description: 'Devices the push failed on.' },
          },
        },
        load: () => import('./methods/send-message'),
      },
    },
  },
  {
    singular: 'notification-subscription',
    plural: NOTIFICATION_SUBSCRIPTIONS,
    description: 'A web push subscription endpoint for a user.',
    user_settable_create: true,
    parents: ['user'],
    fields: {
      subscription_data: { type: 'object', required: true },
      enabled: { type: 'boolean' },
      device_label: {
        type: 'string',
        description:
          'Human-readable name for the device this subscription belongs to (e.g. "Chrome on macOS").',
      },
    },
    // POST /api/aep/notification-subscriptions/{id}:send-notification — push a
    // notification to this one device (defaults to a test notification when the
    // body is omitted).
    customMethods: {
      'send-notification': {
        target: 'item',
        description:
          'Send a push notification to this one device and record one inbox row. With no body, sends a test notification.',
        request: {
          type: 'object',
          description:
            'Optional overrides; omit the body entirely to send a test notification.',
          properties: {
            title: {
              type: 'string',
              description: 'Notification title (default: "Test Notification").',
            },
            body: { type: 'string', description: 'Notification body text.' },
            tag: {
              type: 'string',
              description:
                'Collapse key; same-tag pushes replace each other (default: "device-test").',
            },
            url: {
              type: 'string',
              description:
                'Path opened when the notification is clicked (default: "/notifications").',
            },
            sourceCollection: {
              type: 'string',
              description:
                'aepbase plural the notification is about (e.g. "recipes").',
            },
            sourceId: {
              type: 'string',
              description: 'Record id the notification is about.',
            },
          },
        },
        response: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            recorded: {
              type: 'boolean',
              description: 'Whether the inbox row was written.',
            },
            message: { type: 'string' },
            sent: { type: 'integer', description: 'Devices the push reached.' },
            failed: {
              type: 'integer',
              description: 'Devices the push failed on.',
            },
            timestamp: { type: 'string', format: 'date-time' },
          },
        },
        load: () => import('./methods/send-notification'),
      },
    },
  },
  {
    // A notification that hasn't happened yet.
    //
    // Parented under `user` like its two siblings, and that is the whole design
    // rather than a filing decision. One row addresses exactly one person, so
    // fan-out happens when something is *scheduled* rather than when it is
    // delivered: three people opted into bin night means three rows. That single
    // choice removes everything the `reminder` resource needed to carry —
    // an audience field, a visibility discriminator, a per-record access model,
    // and a dedup pass that reconstructed "did we already tell Alice?" by
    // reading her inbox back. Here the parent path is the addressee,
    // `checkUserScope` is the privacy rule, and `status` is the ledger.
    //
    // It also fixes something the old shape couldn't: a cron-created row can't
    // be *owned* by a user (the engine stamps the caller, which is the
    // scheduler), but a row's parent path is whatever the scheduler writes it
    // to. The scheduler putting a row under /users/alice is unambiguous.
    //
    // See packages/homestead-site/docs/design/scheduled-notifications.md.
    singular: 'scheduled-notification',
    plural: SCHEDULED_NOTIFICATIONS,
    description:
      'A notification queued for delivery to this user at a future instant.',
    user_settable_create: true,
    parents: ['user'],
    // An app's rows are swept 30 days after their moment passed. Only past
    // rows: a plan holds only future keys, so a cancelled row (its own
    // tombstone) can't be resurrected once it is gone. A row a person
    // scheduled (`source_app` unset) is theirs to keep or delete.
    retention: { days: 30, field: 'send_at', where: 'has(source_app)' },
    fields: {
      // What gets delivered — mirrors `notification`, because that is what this
      // becomes.
      title: { type: 'string', required: true },
      message: { type: 'string', required: true },
      url: { type: 'string', description: 'path opened when the notification is tapped' },

      // When. Always written with `toISOString()`: the dispatcher selects due
      // rows with `send_at <= <now>`, which compiles to a SQL string compare,
      // and only normalized UTC sorts lexicographically. A local-offset RFC3339
      // string would compare wrong. `scheduleNotification` enforces this.
      send_at: {
        type: 'string',
        format: 'date-time',
        required: true,
        description: 'RFC3339 UTC instant to deliver at',
      },

      // State. The row is its own delivery ledger, which is why cancelling is a
      // status and not a delete: a materializer would recreate a deleted row on
      // its next run, so the row has to survive as its own tombstone.
      status: {
        type: 'string',
        enum: ['scheduled', 'sent', 'canceled', 'missed', 'failed'],
        default: 'scheduled',
        description:
          'scheduled until delivered; canceled by a person; missed when found too stale to send; failed after the retry budget',
      },
      sent_at: { type: 'string', format: 'date-time' },
      attempts: {
        type: 'number',
        description: 'delivery attempts so far; at the cap the row goes failed',
      },
      last_error: { type: 'string' },
      notification_id: {
        type: 'string',
        reference: { resource: 'notification' },
        description: 'the inbox row this produced, under the same user',
      },

      // Provenance. `source_app` unset means a person typed it in, which is the
      // distinction the Scheduled tab uses to decide whether a row is editable:
      // an app's rows are reconciled from the source record on every run, so an
      // edit would be silently reverted.
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
      source_id: { type: 'string' },
    },
  },
];
