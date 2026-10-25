/**
 * Reusable utility for sending push notifications to an authenticated user.
 *
 * Handles VAPID configuration, subscription fetching, push delivery,
 * expired subscription cleanup, and inbox record creation (one row per send,
 * whether or not a push was delivered) — all against aepbase.
 *
 * Runtime-agnostic: returns a Web `Response`, so it works under Next, the
 * Bun sidecar, and app workers alike.
 */

import webpush from 'web-push';
import { authenticate, type AuthResult } from './aepbase';
import { serverClient } from './client';

export interface NotificationSubscriptionRecord {
  id: string;
  subscription_data: webpush.PushSubscription;
  enabled: boolean;
}

/** Inbox `notification_type` values a send may record. */
export type NotificationType =
  | 'day_of'
  | 'day_before'
  | 'week_before'
  | 'reminder'
  | 'system';

export interface UserNotificationOptions {
  title: string;
  body: string;
  tag: string;
  url: string;
  sourceCollection?: string;
  sourceId?: string;
  /**
   * Restrict delivery to a single notification-subscription (device) by id.
   * Omit to deliver to every enabled subscription. Used by the settings
   * screen's per-device "send test" action.
   */
  subscriptionId?: string;
  /**
   * The inbox `notification_type` to record. Defaults to `'system'` — the
   * behavior every caller-initiated send has always had. Scheduled reminders
   * (e.g. the events cron) set `'day_of'` / `'week_before'` so the inbox row
   * reflects why it fired.
   */
  notificationType?: NotificationType;
  /**
   * The occurrence this notification is about, recorded on the inbox row's
   * `scheduled_for`. Reminder senders set it so a given occurrence is only ever
   * sent once (the dedup key); omit for ad-hoc sends.
   */
  scheduledFor?: string;
}

export async function sendUserNotification(
  request: Request,
  options: UserNotificationOptions,
): Promise<Response> {
  const auth = await authenticate(request);
  if (!auth) {
    return Response.json(
      { error: 'Unauthorized - authentication required' },
      { status: 401 },
    );
  }
  return sendNotificationForAuth(auth, options);
}

// App workers receive an already-authenticated caller from the
// dispatcher, so they call this directly instead of re-running
// `authenticate()` (which would issue a second `/users/{id}` round-trip).
// A caller-initiated send always targets the caller's own inbox and devices.
export async function sendNotificationForAuth(
  auth: AuthResult,
  options: UserNotificationOptions,
): Promise<Response> {
  return sendNotificationToUser(auth.token, auth.user.id, options);
}

/**
 * Send a notification to an arbitrary user by id, using the caller's `token`
 * for engine access. Unlike {@link sendNotificationForAuth}, the recipient is
 * decoupled from whoever the token authenticates as — so a headless job (e.g.
 * the events reminder cron) holding a short-lived admin token can push to, and
 * record an inbox row under, any household user.
 *
 * The token must be able to read `/users/{userId}/notification-subscriptions`
 * and write `/users/{userId}/notifications` — the per-firing admin token the
 * cron scheduler mints qualifies.
 */
/** Set web push up from the environment; false when the VAPID keys aren't configured. */
export function configureWebPush(): boolean {
  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  if (!vapidPublicKey || !vapidPrivateKey) return false;
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL || 'mailto:admin@example.com',
    vapidPublicKey,
    vapidPrivateKey,
  );
  return true;
}

/** What one push carries. */
export interface PushContent {
  title: string;
  body: string;
  tag: string;
  url: string;
  sourceCollection?: string;
  sourceId?: string;
}

/**
 * Push `content` to each of `userId`'s `subscriptions` (call
 * {@link configureWebPush} first), dropping a subscription the push service
 * says is gone. `token` must be able to delete under the user's subtree.
 */
export async function pushToDevices(
  token: string,
  userId: string,
  subscriptions: readonly NotificationSubscriptionRecord[],
  content: PushContent,
): Promise<{ sent: number; failed: number }> {
  const devices = serverClient(token).collection('users').record(userId).collection('notification-subscriptions');
  let sent = 0;
  let failed = 0;
  for (const sub of subscriptions) {
    try {
      const payload = JSON.stringify({
        title: content.title,
        body: content.body,
        icon: '/icon-192.png',
        badge: '/badge-72.png',
        tag: content.tag,
        data: {
          url: content.url,
          sourceCollection: content.sourceCollection,
          sourceId: content.sourceId,
          timestamp: new Date().toISOString(),
        },
      });
      await webpush.sendNotification(sub.subscription_data, payload);
      sent++;
    } catch (error: unknown) {
      const err = error as { statusCode?: number };
      failed++;
      if (err.statusCode === 404 || err.statusCode === 410) {
        await devices.record(sub.id).delete().catch(() => undefined);
      }
    }
  }
  return { sent, failed };
}

export async function sendNotificationToUser(
  token: string,
  userId: string,
  options: UserNotificationOptions,
): Promise<Response> {
  if (!configureWebPush()) {
    return Response.json({ error: 'VAPID keys not configured' }, { status: 500 });
  }

  const hs = serverClient(token);
  const userRecord = hs.collection('users').record(userId);

  let subscriptions: NotificationSubscriptionRecord[];
  try {
    subscriptions = await userRecord
      .collection<NotificationSubscriptionRecord>('notification-subscriptions')
      .listAll();
  } catch (error) {
    console.error('Failed to fetch subscriptions:', error);
    return Response.json(
      { error: 'Failed to fetch notification subscriptions' },
      { status: 500 },
    );
  }

  let enabledSubs = subscriptions.filter((sub) => sub.enabled === true);

  if (options.subscriptionId) {
    enabledSubs = enabledSubs.filter((sub) => sub.id === options.subscriptionId);
    if (enabledSubs.length === 0) {
      return Response.json({
        success: false,
        message:
          'That device is no longer registered for notifications. Please refresh and try again.',
        timestamp: new Date().toISOString(),
      });
    }
  }

  const { sent: sentCount, failed: failedCount } = await pushToDevices(token, userId, enabledSubs, {
    title: options.title,
    body: options.body,
    tag: options.tag,
    url: options.url,
    sourceCollection: options.sourceCollection,
    sourceId: options.sourceId,
  });

  // Record the notification in the user's inbox exactly once — regardless of
  // how many devices it reached, or whether any did. The inbox is the durable
  // record of what was sent; web push is best-effort delivery layered on top,
  // so a user with no (or only stale) subscriptions still sees the message.
  let notificationId: string | undefined;
  try {
    const created = await userRecord
      .collection<{ id: string }>('notifications')
      .create({
        user_id: userId,
        title: options.title,
        message: options.body,
        notification_type: options.notificationType ?? 'system',
        scheduled_for: options.scheduledFor,
        source_collection: options.sourceCollection,
        source_id: options.sourceId,
        // Until now the click-through existed only in the transient push
        // payload, so an inbox row couldn't link anywhere.
        url: options.url,
        read: false,
        sent_at: new Date().toISOString(),
      });
    notificationId = created.id;
  } catch (error) {
    console.error('Failed to record notification in inbox:', error);
    return Response.json(
      { error: 'Failed to record notification' },
      { status: 500 },
    );
  }

  const deviceCount = enabledSubs.length;
  let message: string;
  if (deviceCount === 0) {
    message = 'Saved to your inbox. No devices are subscribed for push notifications.';
  } else if (sentCount === 0) {
    message = `Saved to your inbox, but push delivery failed on all ${deviceCount} device(s).`;
  } else {
    message = `Notification sent to ${sentCount} of ${deviceCount} device(s) and saved to your inbox.`;
  }

  return Response.json({
    success: true,
    recorded: true,
    message,
    sent: sentCount,
    failed: failedCount,
    // The inbox row this send wrote. The dispatcher stores it on the scheduled
    // row so a queue entry points at what it turned into.
    notificationId,
    timestamp: new Date().toISOString(),
  });
}
