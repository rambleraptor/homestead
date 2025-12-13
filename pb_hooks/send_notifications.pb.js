/// <reference path="../pb_data/types.d.ts" />

/**
 * PocketBase Hook: Event Notification Sender
 *
 * This hook runs daily to check for events that need notifications
 * and sends push notifications to subscribed users.
 *
 * Environment variables required:
 * - VAPID_PUBLIC_KEY: Your VAPID public key
 * - VAPID_PRIVATE_KEY: Your VAPID private key
 * - VAPID_EMAIL: Contact email (e.g., mailto:admin@example.com)
 */

// Note: web-push must be installed in PocketBase environment
// Run: cd pocketbase && npm install web-push

/**
 * Check if a notification should be sent based on preferences
 */
function shouldSendNotification(eventDate, notificationPref, recurringYearly) {
  const now = new Date();
  const event = new Date(eventDate);

  // For recurring events, use this year's occurrence
  let nextOccurrence = event;
  if (recurringYearly) {
    nextOccurrence = new Date(
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
function isSameDay(date1, date2) {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

/**
 * Format event date for display
 */
function formatEventDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
}

/**
 * Send push notifications for an event
 */
function sendEventNotifications(event, webpush) {
  try {
    // Get all active notification subscriptions
    const subscriptions = $app.dao().findRecordsByFilter(
      'notification_subscriptions',
      'enabled = true',
      '-created',
      500
    );

    if (subscriptions.length === 0) {
      console.log('No active subscriptions found');
      return;
    }

    const title = event.get('event_type') === 'birthday'
      ? '🎂 Birthday Reminder'
      : '💝 Anniversary Reminder';

    const eventDateStr = formatEventDate(event.get('event_date'));
    const body = `${event.get('title')} - ${event.get('people_involved')} on ${eventDateStr}`;

    let sentCount = 0;
    let failedCount = 0;
    let expiredCount = 0;

    subscriptions.forEach((sub) => {
      try {
        const subscriptionData = sub.get('subscription_data');

        const payload = JSON.stringify({
          title,
          body,
          icon: '/icon-192.png',
          badge: '/badge-72.png',
          tag: `event-${event.getId()}`,
          data: {
            url: '/events',
            eventId: event.getId(),
            timestamp: new Date().toISOString(),
          },
        });

        // Send push notification
        webpush.sendNotification(subscriptionData, payload)
          .then(() => {
            sentCount++;

            // Create notification record
            const notification = new Record(
              $app.dao().findCollectionByNameOrId('notifications')
            );
            notification.set('user_id', sub.get('user_id'));
            notification.set('event_id', event.getId());
            notification.set('title', title);
            notification.set('body', body);
            notification.set('read', false);
            notification.set('sent_at', new Date().toISOString());

            $app.dao().saveRecord(notification);
          })
          .catch((error) => {
            // Handle subscription errors
            if (error.statusCode === 404 || error.statusCode === 410) {
              // Subscription expired or invalid
              expiredCount++;
              try {
                $app.dao().deleteRecord(sub);
                console.log(`Deleted expired subscription for user ${sub.get('user_id')}`);
              } catch (deleteError) {
                console.error('Error deleting expired subscription:', deleteError);
              }
            } else {
              failedCount++;
              console.error('Push notification error:', {
                userId: sub.get('user_id'),
                error: error.message,
                statusCode: error.statusCode,
              });
            }
          });
      } catch (error) {
        failedCount++;
        console.error('Error processing subscription:', error);
      }
    });

    console.log(`Notification summary for "${event.get('title')}":`, {
      sent: sentCount,
      failed: failedCount,
      expired: expiredCount,
      total: subscriptions.length,
    });
  } catch (error) {
    console.error('Error in sendEventNotifications:', error);
  }
}

/**
 * Main function to check and send event notifications
 */
function checkAndSendEventNotifications(webpush) {
  try {
    const now = new Date();
    console.log(`[${now.toISOString()}] Checking for events needing notifications...`);

    // Get all events (active and recurring)
    const events = $app.dao().findRecordsByFilter(
      'events',
      '', // Get all events
      '-event_date',
      1000
    );

    if (events.length === 0) {
      console.log('No events found');
      return;
    }

    console.log(`Found ${events.length} events to check`);

    let notificationsSent = 0;

    events.forEach((event) => {
      const eventDate = event.get('event_date');
      const recurringYearly = event.get('recurring_yearly') || false;
      const notificationPreferences = event.get('notification_preferences') || [];

      if (notificationPreferences.length === 0) {
        return; // Skip events with no notification preferences
      }

      // Check each notification preference
      notificationPreferences.forEach((pref) => {
        if (shouldSendNotification(eventDate, pref, recurringYearly)) {
          console.log(`Sending ${pref} notification for: ${event.get('title')}`);
          sendEventNotifications(event, webpush);
          notificationsSent++;
        }
      });
    });

    if (notificationsSent === 0) {
      console.log('No notifications needed today');
    } else {
      console.log(`Processed ${notificationsSent} event notifications`);
    }
  } catch (error) {
    console.error('Error in checkAndSendEventNotifications:', error);
  }
}

/**
 * Initialize the notification system
 *
 * This function is called when PocketBase starts
 */
onAfterBootstrap((e) => {
  try {
    // Check for required environment variables
    const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
    const vapidEmail = process.env.VAPID_EMAIL || 'mailto:admin@example.com';

    if (!vapidPublicKey || !vapidPrivateKey) {
      console.error('❌ VAPID keys not configured!');
      console.error('Please set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY environment variables');
      console.error('Generate keys with: npx web-push generate-vapid-keys');
      return;
    }

    // Try to load web-push module
    let webpush;
    try {
      // In PocketBase hooks, we can use require for npm modules
      webpush = require('web-push');
    } catch (error) {
      console.error('❌ web-push module not found!');
      console.error('Install with: cd pocketbase && npm install web-push');
      return;
    }

    // Configure VAPID details
    webpush.setVapidDetails(
      vapidEmail,
      vapidPublicKey,
      vapidPrivateKey
    );

    console.log('✅ Event notifications system initialized');
    console.log(`   VAPID email: ${vapidEmail}`);
    console.log(`   Public key: ${vapidPublicKey.substring(0, 20)}...`);

    // Schedule daily check at 9:00 AM
    // Cron format: minute hour day month weekday
    cronAdd('send-event-notifications', '0 9 * * *', () => {
      checkAndSendEventNotifications(webpush);
    });

    console.log('✅ Cron job registered: Daily at 9:00 AM');

    // Optional: Run immediately on startup for testing
    // Uncomment the line below to test notifications on startup
    // checkAndSendEventNotifications(webpush);

  } catch (error) {
    console.error('❌ Error initializing event notifications:', error);
  }
});

/**
 * Optional: Expose a manual trigger endpoint for testing
 *
 * To test notifications manually:
 * POST http://localhost:8090/api/send-test-notification
 * Headers: Authorization: Bearer <admin-token>
 */
routerAdd('POST', '/api/send-test-notification', (c) => {
  try {
    // Verify admin authentication
    const admin = c.get('admin');
    if (!admin) {
      return c.json(401, { error: 'Unauthorized - admin access required' });
    }

    const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
    const vapidEmail = process.env.VAPID_EMAIL || 'mailto:admin@example.com';

    if (!vapidPublicKey || !vapidPrivateKey) {
      return c.json(500, { error: 'VAPID keys not configured' });
    }

    const webpush = require('web-push');
    webpush.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey);

    checkAndSendEventNotifications(webpush);

    return c.json(200, {
      success: true,
      message: 'Test notification check triggered',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error in test notification endpoint:', error);
    return c.json(500, { error: error.message });
  }
}, $apis.requireAdminAuth());
