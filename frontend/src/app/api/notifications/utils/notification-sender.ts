/**
 * People Notification Sender Utility
 *
 * Handles sending push notifications for birthdays and anniversaries
 */

import webpush from 'web-push';
import PocketBase from 'pocketbase';

type NotificationPreference = 'day_of' | 'day_before' | 'week_before';

interface Person {
  id: string;
  name: string;
  birthday?: string;
  anniversary?: string;
  notification_preferences?: NotificationPreference[];
}

interface NotificationSubscription {
  id: string;
  user_id: string;
  subscription_data: webpush.PushSubscription;
  enabled: boolean;
}

/**
 * Check if a notification should be sent based on preferences
 */
function shouldSendNotification(eventDate: string, notificationPref: NotificationPreference): boolean {
  const now = new Date();
  const event = new Date(eventDate);

  let nextOccurrence = new Date(now.getFullYear(), event.getMonth(), event.getDate());

  // If already passed this year, use next year
  if (nextOccurrence < now) {
    nextOccurrence = new Date(now.getFullYear() + 1, event.getMonth(), event.getDate());
  }

  // Check if we should send based on preference
  if (notificationPref === 'day_of') {
    return isSameDay(now, nextOccurrence);
  } else if (notificationPref === 'day_before') {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return isSameDay(tomorrow, nextOccurrence);
  } else if (notificationPref === 'week_before') {
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
 * Send push notifications for a person's event (birthday/anniversary)
 */
async function sendPersonNotifications(
  person: Person,
  eventType: 'Birthday' | 'Anniversary',
  eventDate: string,
  pb: PocketBase
): Promise<void> {
  try {
    // Get all active notification subscriptions
    const subscriptions = await pb
      .collection('notification_subscriptions')
      .getFullList<NotificationSubscription>({
        filter: 'enabled = true',
        sort: '-created',
      });

    if (subscriptions.length === 0) {
      console.log('No active subscriptions found');
      return;
    }

    const title = eventType === 'Birthday' ? '🎂 Birthday Reminder' : '💝 Anniversary Reminder';

    const eventDateStr = formatDate(eventDate);
    const body = `${person.name}'s ${eventType.toLowerCase()} is on ${eventDateStr}`;

    let sentCount = 0;
    let failedCount = 0;
    let expiredCount = 0;

    for (const sub of subscriptions) {
      try {
        const subscriptionData = sub.subscription_data;

        const payload = JSON.stringify({
          title,
          body,
          icon: '/icon-192.png',
          badge: '/badge-72.png',
          tag: `person-${person.id}-${eventType}`,
          data: {
            url: '/people',
            personId: person.id,
            timestamp: new Date().toISOString(),
          },
        });

        // Send push notification
        try {
          await webpush.sendNotification(subscriptionData, payload);
          sentCount++;

          // Create notification record
          await pb.collection('notifications').create({
            user_id: sub.user_id,
            person_id: person.id,
            title: title,
            message: body,
            read: false,
            sent_at: new Date().toISOString(),
          });
        } catch (error: unknown) {
          const err = error as { statusCode?: number; message?: string };
          // Handle subscription errors
          if (err.statusCode === 404 || err.statusCode === 410) {
            // Subscription expired or invalid
            expiredCount++;
            try {
              await pb.collection('notification_subscriptions').delete(sub.id);
              console.log(`Deleted expired subscription for user ${sub.user_id}`);
            } catch (deleteError) {
              console.error('Error deleting expired subscription:', deleteError);
            }
          } else {
            failedCount++;
            console.error('Push notification error:', {
              userId: sub.user_id,
              error: err.message,
              statusCode: err.statusCode,
            });
          }
        }
      } catch (error) {
        failedCount++;
        console.error('Error processing subscription:', error);
      }
    }

    console.log(`Notification summary for "${person.name}'s ${eventType}":`, {
      sent: sentCount,
      failed: failedCount,
      expired: expiredCount,
      total: subscriptions.length,
    });
  } catch (error) {
    console.error('Error in sendPersonNotifications:', error);
  }
}

/**
 * Main function to check and send people notifications
 */
export async function checkAndSendPeopleNotifications(): Promise<void> {
  try {
    const now = new Date();
    console.log(`[${now.toISOString()}] Checking for people needing notifications...`);

    // Initialize PocketBase with server credentials
    const pb = new PocketBase(process.env.NEXT_PUBLIC_POCKETBASE_URL || 'http://127.0.0.1:8090');

    // Authenticate as admin to access all people
    const adminEmail = process.env.POCKETBASE_ADMIN_EMAIL;
    const adminPassword = process.env.POCKETBASE_ADMIN_PASSWORD;

    if (!adminEmail || !adminPassword) {
      console.error('POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD must be set');
      return;
    }

    await pb.admins.authWithPassword(adminEmail, adminPassword);

    // Get all people
    const people = await pb.collection('people').getFullList<Person>({
      sort: '-created',
    });

    if (people.length === 0) {
      console.log('No people found');
      return;
    }

    console.log(`Found ${people.length} people to check`);

    let notificationsSent = 0;

    for (const person of people) {
      const notificationPreferences = person.notification_preferences || [];

      if (notificationPreferences.length === 0) {
        continue; // Skip people with no notification preferences
      }

      // Check for birthday
      if (person.birthday) {
        for (const pref of notificationPreferences) {
          if (shouldSendNotification(person.birthday, pref)) {
            console.log(`Sending ${pref} birthday notification for: ${person.name}`);
            await sendPersonNotifications(person, 'Birthday', person.birthday, pb);
            notificationsSent++;
          }
        }
      }

      // Check for anniversary
      if (person.anniversary) {
        for (const pref of notificationPreferences) {
          if (shouldSendNotification(person.anniversary, pref)) {
            console.log(`Sending ${pref} anniversary notification for: ${person.name}`);
            await sendPersonNotifications(person, 'Anniversary', person.anniversary, pb);
            notificationsSent++;
          }
        }
      }
    }

    if (notificationsSent === 0) {
      console.log('No notifications needed today');
    } else {
      console.log(`Processed ${notificationsSent} person notifications`);
    }
  } catch (error) {
    console.error('Error in checkAndSendPeopleNotifications:', error);
  }
}
