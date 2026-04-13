/**
 * Universal Notification Sender Utility
 *
 * Run from the daily cron job. Authenticates as the aepbase superuser
 * (credentials in env), iterates users, and sends push notifications for
 * any due recurring notifications.
 */

import webpush from 'web-push';
import {
  AEPBASE_URL,
  aepList,
  aepCreate,
  aepUpdate,
  aepRemove,
  aepGet,
} from '../../_lib/aepbase-server';

type NotificationTiming = 'day_of' | 'day_before' | 'week_before';

interface RecurringNotification {
  id: string;
  user_id: string;
  source_collection: string;
  source_id: string;
  title_template: string;
  message_template: string;
  reference_date_field: string;
  timing: NotificationTiming;
  enabled: boolean;
  last_triggered?: string;
}

interface NotificationSubscription {
  id: string;
  subscription_data: webpush.PushSubscription;
  enabled: boolean;
}

interface SourceRecord {
  id: string;
  name?: string;
  [key: string]: unknown;
}

interface AdminUser {
  id: string;
  email: string;
  type?: string;
}

function shouldSendNotification(
  eventDate: string,
  timing: NotificationTiming,
): boolean {
  const now = new Date();
  const event = new Date(eventDate);
  let nextOccurrence = new Date(
    now.getFullYear(),
    event.getMonth(),
    event.getDate(),
  );
  if (nextOccurrence < now) {
    nextOccurrence = new Date(
      now.getFullYear() + 1,
      event.getMonth(),
      event.getDate(),
    );
  }
  if (timing === 'day_of') return isSameDay(now, nextOccurrence);
  if (timing === 'day_before') {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return isSameDay(tomorrow, nextOccurrence);
  }
  if (timing === 'week_before') {
    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);
    return isSameDay(nextWeek, nextOccurrence);
  }
  return false;
}

function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function processTemplate(
  template: string,
  sourceRecord: SourceRecord,
  referenceDateField: string,
): string {
  let result = template;
  if (sourceRecord.name) {
    result = result.replace(/\{\{name\}\}/g, sourceRecord.name);
  }
  const dateValue = sourceRecord[referenceDateField];
  if (typeof dateValue === 'string') {
    result = result.replace(/\{\{date\}\}/g, formatDate(dateValue));
  }
  return result;
}

/**
 * Log in to aepbase as the configured admin user and return a token + id.
 */
async function loginAdmin(): Promise<{ token: string; userId: string } | null> {
  const email = process.env.AEPBASE_ADMIN_EMAIL;
  const password = process.env.AEPBASE_ADMIN_PASSWORD;
  if (!email || !password) {
    console.error('AEPBASE_ADMIN_EMAIL and AEPBASE_ADMIN_PASSWORD must be set');
    return null;
  }
  try {
    const res = await fetch(`${AEPBASE_URL}/users/:login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      console.error('aepbase admin login failed:', res.status);
      return null;
    }
    const body = (await res.json()) as { token: string; user: { id: string } };
    return { token: body.token, userId: body.user.id };
  } catch (error) {
    console.error('aepbase admin login error:', error);
    return null;
  }
}

async function sendRecurringNotification(
  recurring: RecurringNotification,
  sourceRecord: SourceRecord,
  adminToken: string,
): Promise<{ sent: number; failed: number; expired: number }> {
  const stats = { sent: 0, failed: 0, expired: 0 };
  const userId = recurring.user_id;
  const userParent = ['users', userId];

  try {
    const subscriptions = await aepList<NotificationSubscription>(
      'notification-subscriptions',
      adminToken,
      userParent,
    );
    const enabledSubs = subscriptions.filter((s) => s.enabled === true);
    if (enabledSubs.length === 0) {
      console.log(`No active subscriptions for user ${userId}`);
      return stats;
    }

    const title = processTemplate(
      recurring.title_template,
      sourceRecord,
      recurring.reference_date_field,
    );
    const body = processTemplate(
      recurring.message_template,
      sourceRecord,
      recurring.reference_date_field,
    );

    for (const sub of enabledSubs) {
      try {
        const payload = JSON.stringify({
          title,
          body,
          icon: '/icon-192.png',
          badge: '/badge-72.png',
          tag: `recurring-${recurring.id}`,
          data: {
            url: `/${recurring.source_collection}`,
            sourceCollection: recurring.source_collection,
            sourceId: recurring.source_id,
            recurringNotificationId: recurring.id,
            timestamp: new Date().toISOString(),
          },
        });

        try {
          await webpush.sendNotification(sub.subscription_data, payload);
          stats.sent++;
          await aepCreate(
            'notifications',
            {
              user_id: userId,
              recurring_notification_id: recurring.id,
              source_collection: recurring.source_collection,
              source_id: recurring.source_id,
              ...(recurring.source_collection === 'people'
                ? { person_id: recurring.source_id }
                : {}),
              title,
              message: body,
              notification_type: recurring.timing,
              read: false,
              sent_at: new Date().toISOString(),
            },
            adminToken,
            userParent,
          );
        } catch (error: unknown) {
          const err = error as { statusCode?: number; message?: string };
          if (err.statusCode === 404 || err.statusCode === 410) {
            stats.expired++;
            await aepRemove(
              'notification-subscriptions',
              sub.id,
              adminToken,
              userParent,
            ).catch(() => undefined);
          } else {
            stats.failed++;
            console.error('Push notification error:', {
              userId,
              error: err.message,
              statusCode: err.statusCode,
            });
          }
        }
      } catch (error) {
        stats.failed++;
        console.error('Error processing subscription:', error);
      }
    }

    await aepUpdate(
      'recurring-notifications',
      recurring.id,
      { last_triggered: new Date().toISOString() },
      adminToken,
      userParent,
    );
  } catch (error) {
    console.error('Error in sendRecurringNotification:', error);
  }

  return stats;
}

export async function checkAndSendRecurringNotifications(): Promise<void> {
  try {
    console.log(`[${new Date().toISOString()}] Checking recurring notifications...`);
    const admin = await loginAdmin();
    if (!admin) return;

    // List all users (superuser only).
    const users = await aepList<AdminUser>('users', admin.token);
    console.log(`Scanning recurring notifications for ${users.length} users`);

    let totalSent = 0;
    let totalFailed = 0;
    let totalExpired = 0;
    const sourceCache = new Map<string, SourceRecord | null>();

    for (const user of users) {
      let recurring: RecurringNotification[];
      try {
        recurring = await aepList<RecurringNotification>(
          'recurring-notifications',
          admin.token,
          ['users', user.id],
        );
      } catch (error) {
        console.error(`Failed to list recurring notifications for ${user.id}`, error);
        continue;
      }
      const enabled = recurring.filter((r) => r.enabled === true);
      if (enabled.length === 0) continue;

      for (const r of enabled) {
        const cacheKey = `${r.source_collection}:${r.source_id}`;
        let sourceRecord = sourceCache.get(cacheKey);
        if (sourceRecord === undefined) {
          try {
            sourceRecord = await aepGet<SourceRecord>(
              r.source_collection,
              r.source_id,
              admin.token,
            );
            sourceCache.set(cacheKey, sourceRecord);
          } catch {
            console.error(`Source not found: ${r.source_collection}/${r.source_id}`);
            sourceCache.set(cacheKey, null);
            continue;
          }
        }
        if (!sourceRecord) continue;

        const dateValue = sourceRecord[r.reference_date_field];
        if (typeof dateValue !== 'string') continue;
        if (!shouldSendNotification(dateValue, r.timing)) continue;

        console.log(
          `Triggering recurring notification ${r.id} for ${r.source_collection}/${r.source_id}`,
        );
        const stats = await sendRecurringNotification(r, sourceRecord, admin.token);
        totalSent += stats.sent;
        totalFailed += stats.failed;
        totalExpired += stats.expired;
      }
    }

    console.log('Recurring notification check complete:', {
      sent: totalSent,
      failed: totalFailed,
      expired: totalExpired,
    });
  } catch (error) {
    console.error('Error in checkAndSendRecurringNotifications:', error);
  }
}

/**
 * Legacy fallback: people with notification_preferences but no
 * recurring-notifications records. Dropped — the migration script and the
 * UI both write to recurring-notifications now, so this is a no-op.
 * Kept exported so the cron keeps calling it without crashing.
 */
export async function checkAndSendLegacyPeopleNotifications(): Promise<void> {
  // Legacy notification_preferences path was PB-only and is no longer
  // reached: the UI writes to recurring-notifications, the migration
  // script dropped the field, and aepbase models `notification_preferences`
  // as an object (not queryable as an array filter).
}

/** @deprecated */
export async function checkAndSendPeopleNotifications(): Promise<void> {
  await checkAndSendRecurringNotifications();
}

/**
 * Send an immediate one-off notification. The caller must already have an
 * authenticated aepbase token (typically the invoking user's) and the id
 * of the user to notify.
 */
export async function sendImmediateNotification(
  token: string,
  options: {
    userId: string;
    title: string;
    message: string;
    sourceCollection?: string;
    sourceId?: string;
  },
): Promise<void> {
  const { userId, title, message, sourceCollection, sourceId } = options;
  const userParent = ['users', userId];

  try {
    const subscriptions = await aepList<NotificationSubscription>(
      'notification-subscriptions',
      token,
      userParent,
    );
    const enabled = subscriptions.filter((s) => s.enabled === true);

    for (const sub of enabled) {
      try {
        const payload = JSON.stringify({
          title,
          body: message,
          icon: '/icon-192.png',
          badge: '/badge-72.png',
          tag: `immediate-${Date.now()}`,
          data: {
            url: sourceCollection ? `/${sourceCollection}` : '/notifications',
            sourceCollection,
            sourceId,
            timestamp: new Date().toISOString(),
          },
        });
        await webpush.sendNotification(sub.subscription_data, payload);
      } catch (error: unknown) {
        const err = error as { statusCode?: number };
        if (err.statusCode === 404 || err.statusCode === 410) {
          await aepRemove(
            'notification-subscriptions',
            sub.id,
            token,
            userParent,
          ).catch(() => undefined);
        }
      }
    }

    await aepCreate(
      'notifications',
      {
        user_id: userId,
        source_collection: sourceCollection,
        source_id: sourceId,
        title,
        message,
        notification_type: 'system',
        read: false,
        sent_at: new Date().toISOString(),
      },
      token,
      userParent,
    );
  } catch (error) {
    console.error('Error sending immediate notification:', error);
  }
}
