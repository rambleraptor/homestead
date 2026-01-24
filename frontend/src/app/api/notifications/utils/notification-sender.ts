/**
 * Universal Notification Sender Utility
 *
 * Handles sending push notifications based on recurring notifications.
 * The daily cron job checks all enabled recurring notifications and creates
 * Notification instances when the timing matches.
 *
 * TODO: Migrate existing people with notification_preferences to recurring_notifications.
 * Currently, new people use the recurring_notifications system, but existing people
 * still use the legacy notification_preferences field. A data migration should be
 * created to convert existing notification_preferences to recurring_notifications records.
 * Until then, checkAndSendPeopleNotifications() handles legacy notifications.
 */

import webpush from 'web-push';
import PocketBase from 'pocketbase';

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
  user_id: string;
  subscription_data: webpush.PushSubscription;
  enabled: boolean;
}

interface SourceRecord {
  id: string;
  name?: string;
  [key: string]: unknown;
}

/**
 * Check if a notification should be sent based on timing preference
 */
function shouldSendNotification(
  eventDate: string,
  timing: NotificationTiming
): boolean {
  const now = new Date();
  const event = new Date(eventDate);

  let nextOccurrence = new Date(
    now.getFullYear(),
    event.getMonth(),
    event.getDate()
  );

  // If already passed this year, use next year
  if (nextOccurrence < now) {
    nextOccurrence = new Date(
      now.getFullYear() + 1,
      event.getMonth(),
      event.getDate()
    );
  }

  // Check if we should send based on timing
  if (timing === 'day_of') {
    return isSameDay(now, nextOccurrence);
  } else if (timing === 'day_before') {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return isSameDay(tomorrow, nextOccurrence);
  } else if (timing === 'week_before') {
    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);
    return isSameDay(nextWeek, nextOccurrence);
  }

  return false;
}

/**
 * Check if two dates are on the same day
 */
function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

/**
 * Format event date for display
 */
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Replace template placeholders with actual values
 */
function processTemplate(
  template: string,
  sourceRecord: SourceRecord,
  referenceDateField: string
): string {
  let result = template;

  // Replace {{name}} with the source record's name
  if (sourceRecord.name) {
    result = result.replace(/\{\{name\}\}/g, sourceRecord.name);
  }

  // Replace {{date}} with the formatted reference date
  const dateValue = sourceRecord[referenceDateField];
  if (typeof dateValue === 'string') {
    result = result.replace(/\{\{date\}\}/g, formatDate(dateValue));
  }

  return result;
}

/**
 * Send a notification based on a recurring notification configuration
 */
async function sendRecurringNotification(
  recurringNotification: RecurringNotification,
  sourceRecord: SourceRecord,
  pb: PocketBase
): Promise<{ sent: number; failed: number; expired: number }> {
  const stats = { sent: 0, failed: 0, expired: 0 };

  try {
    // Get push subscriptions for the user who owns this recurring notification
    const subscriptions = await pb
      .collection('notification_subscriptions')
      .getFullList<NotificationSubscription>({
        filter: `user_id="${recurringNotification.user_id}" && enabled = true`,
        sort: '-created',
      });

    if (subscriptions.length === 0) {
      console.log(
        `No active subscriptions for user ${recurringNotification.user_id}`
      );
      return stats;
    }

    // Process templates
    const title = processTemplate(
      recurringNotification.title_template,
      sourceRecord,
      recurringNotification.reference_date_field
    );
    const body = processTemplate(
      recurringNotification.message_template,
      sourceRecord,
      recurringNotification.reference_date_field
    );

    for (const sub of subscriptions) {
      try {
        const subscriptionData = sub.subscription_data;

        const payload = JSON.stringify({
          title,
          body,
          icon: '/icon-192.png',
          badge: '/badge-72.png',
          tag: `recurring-${recurringNotification.id}`,
          data: {
            url: `/${recurringNotification.source_collection}`,
            sourceCollection: recurringNotification.source_collection,
            sourceId: recurringNotification.source_id,
            recurringNotificationId: recurringNotification.id,
            timestamp: new Date().toISOString(),
          },
        });

        // Send push notification
        try {
          await webpush.sendNotification(subscriptionData, payload);
          stats.sent++;

          // Create notification record
          await pb.collection('notifications').create({
            user_id: sub.user_id,
            recurring_notification_id: recurringNotification.id,
            source_collection: recurringNotification.source_collection,
            source_id: recurringNotification.source_id,
            // Also set person_id for backward compatibility
            ...(recurringNotification.source_collection === 'people'
              ? { person_id: recurringNotification.source_id }
              : {}),
            title: title,
            message: body,
            notification_type: recurringNotification.timing,
            read: false,
            sent_at: new Date().toISOString(),
          });
        } catch (error: unknown) {
          const err = error as { statusCode?: number; message?: string };
          // Handle subscription errors
          if (err.statusCode === 404 || err.statusCode === 410) {
            // Subscription expired or invalid
            stats.expired++;
            try {
              await pb.collection('notification_subscriptions').delete(sub.id);
              console.log(`Deleted expired subscription for user ${sub.user_id}`);
            } catch (deleteError) {
              console.error('Error deleting expired subscription:', deleteError);
            }
          } else {
            stats.failed++;
            console.error('Push notification error:', {
              userId: sub.user_id,
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

    // Update last_triggered on the recurring notification
    await pb.collection('recurring_notifications').update(recurringNotification.id, {
      last_triggered: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error in sendRecurringNotification:', error);
  }

  return stats;
}

/**
 * Main function to check and send notifications based on recurring notifications.
 * This is called by the daily cron job.
 */
export async function checkAndSendRecurringNotifications(): Promise<void> {
  try {
    const now = new Date();
    console.log(
      `[${now.toISOString()}] Checking recurring notifications...`
    );

    // Initialize PocketBase with server credentials
    const pb = new PocketBase(
      process.env.NEXT_PUBLIC_POCKETBASE_URL || 'http://127.0.0.1:8090'
    );

    // Authenticate as admin to access all data
    const adminEmail = process.env.POCKETBASE_ADMIN_EMAIL;
    const adminPassword = process.env.POCKETBASE_ADMIN_PASSWORD;

    if (!adminEmail || !adminPassword) {
      console.error(
        'POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD must be set'
      );
      return;
    }

    await pb.admins.authWithPassword(adminEmail, adminPassword);

    // Get all enabled recurring notifications
    const recurringNotifications = await pb
      .collection('recurring_notifications')
      .getFullList<RecurringNotification>({
        filter: 'enabled = true',
        sort: '-created',
      });

    if (recurringNotifications.length === 0) {
      console.log('No enabled recurring notifications found');
      return;
    }

    console.log(
      `Found ${recurringNotifications.length} enabled recurring notifications to check`
    );

    let totalSent = 0;
    let totalFailed = 0;
    let totalExpired = 0;

    // Group by source_collection and source_id for efficient fetching
    const sourceCache = new Map<string, SourceRecord | null>();

    for (const recurring of recurringNotifications) {
      const cacheKey = `${recurring.source_collection}:${recurring.source_id}`;

      // Get or fetch the source record
      let sourceRecord = sourceCache.get(cacheKey);
      if (sourceRecord === undefined) {
        try {
          sourceRecord = await pb
            .collection(recurring.source_collection)
            .getOne<SourceRecord>(recurring.source_id);
          sourceCache.set(cacheKey, sourceRecord);
        } catch {
          console.error(
            `Source record not found: ${recurring.source_collection}/${recurring.source_id}`
          );
          sourceCache.set(cacheKey, null);
          continue;
        }
      }

      if (!sourceRecord) {
        continue;
      }

      // Check if the reference date field exists and should trigger
      const referenceDateValue = sourceRecord[recurring.reference_date_field];
      if (typeof referenceDateValue !== 'string') {
        continue;
      }

      if (shouldSendNotification(referenceDateValue, recurring.timing)) {
        console.log(
          `Triggering recurring notification ${recurring.id} for ${recurring.source_collection}/${recurring.source_id}`
        );

        const stats = await sendRecurringNotification(
          recurring,
          sourceRecord,
          pb
        );

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
 * Check and send notifications for people using the legacy notification_preferences field.
 * This handles existing people who haven't been migrated to the recurring_notifications system.
 */
export async function checkAndSendLegacyPeopleNotifications(): Promise<void> {
  try {
    const now = new Date();
    console.log(
      `[${now.toISOString()}] Checking legacy people notifications...`
    );

    // Initialize PocketBase with server credentials
    const pb = new PocketBase(
      process.env.NEXT_PUBLIC_POCKETBASE_URL || 'http://127.0.0.1:8090'
    );

    // Authenticate as admin to access all data
    const adminEmail = process.env.POCKETBASE_ADMIN_EMAIL;
    const adminPassword = process.env.POCKETBASE_ADMIN_PASSWORD;

    if (!adminEmail || !adminPassword) {
      console.error(
        'POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD must be set'
      );
      return;
    }

    await pb.admins.authWithPassword(adminEmail, adminPassword);

    // Get all people with notification_preferences that DON'T have recurring_notifications
    // This ensures we only handle people not yet migrated to the new system
    const people = await pb.collection('people').getFullList<{
      id: string;
      name: string;
      birthday?: string;
      anniversary?: string;
      notification_preferences?: NotificationTiming[];
      created_by: string;
    }>({
      filter: 'notification_preferences != null && notification_preferences != "[]"',
      sort: '-created',
    });

    if (people.length === 0) {
      console.log('No people with legacy notification preferences found');
      return;
    }

    console.log(
      `Found ${people.length} people with legacy notification preferences to check`
    );

    // Get all recurring notifications to check which people are already migrated
    const recurringNotifications = await pb
      .collection('recurring_notifications')
      .getFullList<RecurringNotification>({
        filter: 'source_collection = "people"',
        sort: '-created',
      });

    const migratedPeopleIds = new Set(
      recurringNotifications.map((rn) => rn.source_id)
    );

    let totalSent = 0;
    let totalFailed = 0;
    let totalExpired = 0;

    for (const person of people) {
      // Skip if this person has been migrated to recurring_notifications
      if (migratedPeopleIds.has(person.id)) {
        continue;
      }

      const preferences = person.notification_preferences;
      if (!preferences || !Array.isArray(preferences) || preferences.length === 0) {
        continue;
      }

      // Check birthday notifications
      if (person.birthday) {
        for (const timing of preferences) {
          if (shouldSendNotification(person.birthday, timing)) {
            const title = `Birthday Reminder - ${person.name}`;
            const message = `${person.name}'s birthday is coming up on ${formatDate(person.birthday)}!`;

            const stats = await sendLegacyNotification(
              pb,
              person.created_by,
              person.id,
              title,
              message,
              timing
            );

            totalSent += stats.sent;
            totalFailed += stats.failed;
            totalExpired += stats.expired;
          }
        }
      }

      // Check anniversary notifications
      if (person.anniversary) {
        for (const timing of preferences) {
          if (shouldSendNotification(person.anniversary, timing)) {
            const title = `Anniversary Reminder - ${person.name}`;
            const message = `${person.name}'s anniversary is coming up on ${formatDate(person.anniversary)}!`;

            const stats = await sendLegacyNotification(
              pb,
              person.created_by,
              person.id,
              title,
              message,
              timing
            );

            totalSent += stats.sent;
            totalFailed += stats.failed;
            totalExpired += stats.expired;
          }
        }
      }
    }

    console.log('Legacy people notification check complete:', {
      sent: totalSent,
      failed: totalFailed,
      expired: totalExpired,
    });
  } catch (error) {
    console.error('Error in checkAndSendLegacyPeopleNotifications:', error);
  }
}

/**
 * Send a legacy notification for a person
 */
async function sendLegacyNotification(
  pb: PocketBase,
  userId: string,
  personId: string,
  title: string,
  message: string,
  notificationType: NotificationTiming
): Promise<{ sent: number; failed: number; expired: number }> {
  const stats = { sent: 0, failed: 0, expired: 0 };

  try {
    // Get push subscriptions for the user
    const subscriptions = await pb
      .collection('notification_subscriptions')
      .getFullList<NotificationSubscription>({
        filter: `user_id="${userId}" && enabled = true`,
        sort: '-created',
      });

    if (subscriptions.length === 0) {
      return stats;
    }

    for (const sub of subscriptions) {
      try {
        const payload = JSON.stringify({
          title,
          body: message,
          icon: '/icon-192.png',
          badge: '/badge-72.png',
          tag: `legacy-person-${personId}`,
          data: {
            url: '/people',
            sourceCollection: 'people',
            sourceId: personId,
            timestamp: new Date().toISOString(),
          },
        });

        try {
          await webpush.sendNotification(sub.subscription_data, payload);
          stats.sent++;

          // Create notification record
          await pb.collection('notifications').create({
            user_id: sub.user_id,
            person_id: personId,
            source_collection: 'people',
            source_id: personId,
            title,
            message,
            notification_type: notificationType,
            read: false,
            sent_at: new Date().toISOString(),
          });
        } catch (error: unknown) {
          const err = error as { statusCode?: number; message?: string };
          if (err.statusCode === 404 || err.statusCode === 410) {
            stats.expired++;
            try {
              await pb.collection('notification_subscriptions').delete(sub.id);
            } catch {
              // Ignore delete errors
            }
          } else {
            stats.failed++;
          }
        }
      } catch {
        stats.failed++;
      }
    }
  } catch (error) {
    console.error('Error in sendLegacyNotification:', error);
  }

  return stats;
}

/**
 * @deprecated Use checkAndSendRecurringNotifications instead.
 * This function is kept for backward compatibility.
 */
export async function checkAndSendPeopleNotifications(): Promise<void> {
  // Call both the new recurring system and the legacy system
  await checkAndSendRecurringNotifications();
  await checkAndSendLegacyPeopleNotifications();
}

/**
 * Send an immediate notification (not from a recurring notification).
 * This is used for one-time notifications triggered by actions.
 */
export async function sendImmediateNotification(
  pb: PocketBase,
  options: {
    userId: string;
    title: string;
    message: string;
    sourceCollection?: string;
    sourceId?: string;
    notificationType?: 'system';
  }
): Promise<void> {
  const { userId, title, message, sourceCollection, sourceId } = options;

  try {
    // Get push subscriptions for the user
    const subscriptions = await pb
      .collection('notification_subscriptions')
      .getFullList<NotificationSubscription>({
        filter: `user_id="${userId}" && enabled = true`,
        sort: '-created',
      });

    for (const sub of subscriptions) {
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
          await pb.collection('notification_subscriptions').delete(sub.id);
        }
      }
    }

    // Create notification record
    await pb.collection('notifications').create({
      user_id: userId,
      source_collection: sourceCollection,
      source_id: sourceId,
      title,
      message,
      notification_type: 'system',
      read: false,
      sent_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error sending immediate notification:', error);
  }
}
