/**
 * API Route: Trigger Grocery List Notification
 *
 * POST /api/notifications/grocery
 * Returns: { success: boolean, sent: boolean, message: string }
 *
 * This endpoint is called when items are added to the grocery list.
 * It implements a cooldown mechanism: if a notification was sent within
 * the last 10 minutes, no new notification is sent.
 *
 * Requires user authentication (PocketBase token in Authorization header)
 */

import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';
import PocketBase from 'pocketbase';

const COOLDOWN_MINUTES = 10;
const NOTIFICATION_TYPE = 'grocery_items_added';

interface NotificationSubscription {
  id: string;
  user_id: string;
  subscription_data: webpush.PushSubscription;
  enabled: boolean;
}

interface NotificationCooldown {
  id: string;
  user_id: string;
  notification_type: string;
  last_sent: string;
  cooldown_minutes?: number;
}

/**
 * Verify user authentication using PocketBase token
 */
async function verifyAuth(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    return null;
  }

  const token = authHeader.replace('Bearer ', '');
  const pb = new PocketBase(
    process.env.NEXT_PUBLIC_POCKETBASE_URL || 'http://127.0.0.1:8090'
  );

  try {
    pb.authStore.save(token);

    if (!pb.authStore.isValid) {
      return null;
    }

    await pb.collection('users').authRefresh();

    return { pb, user: pb.authStore.record };
  } catch (error) {
    console.error('Auth verification failed:', error);
    return null;
  }
}

/**
 * Check if the cooldown period has elapsed
 */
function isCooldownExpired(lastSent: string, cooldownMinutes: number): boolean {
  const lastSentDate = new Date(lastSent);
  const now = new Date();
  const diffMs = now.getTime() - lastSentDate.getTime();
  const diffMinutes = diffMs / (1000 * 60);
  return diffMinutes >= cooldownMinutes;
}

export async function POST(request: NextRequest) {
  try {
    // Verify user authentication
    const auth = await verifyAuth(request);
    if (!auth) {
      return NextResponse.json(
        { error: 'Unauthorized - authentication required' },
        { status: 401 }
      );
    }

    const { pb, user } = auth;

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 401 }
      );
    }

    // Check cooldown status
    let cooldownRecord: NotificationCooldown | null = null;
    try {
      const records = await pb
        .collection('notification_cooldowns')
        .getFullList<NotificationCooldown>({
          filter: `user_id = "${user.id}" && notification_type = "${NOTIFICATION_TYPE}"`,
        });
      cooldownRecord = records[0] || null;
    } catch {
      // Collection might not exist yet or no records - that's fine
      console.log('No existing cooldown record found');
    }

    // Check if we're still in cooldown period
    if (cooldownRecord) {
      const cooldownMinutes = cooldownRecord.cooldown_minutes || COOLDOWN_MINUTES;
      if (!isCooldownExpired(cooldownRecord.last_sent, cooldownMinutes)) {
        const lastSentDate = new Date(cooldownRecord.last_sent);
        const nextAllowed = new Date(
          lastSentDate.getTime() + cooldownMinutes * 60 * 1000
        );
        return NextResponse.json({
          success: true,
          sent: false,
          message: `Notification skipped - cooldown active until ${nextAllowed.toISOString()}`,
        });
      }
    }

    // Cooldown expired or no previous notification - send one!
    const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
    const vapidEmail = process.env.VAPID_EMAIL || 'mailto:admin@example.com';

    if (!vapidPublicKey || !vapidPrivateKey) {
      // VAPID not configured - still update cooldown but don't try to send
      console.log('VAPID keys not configured, skipping push notification');
    } else {
      webpush.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey);

      // Get the current user's subscriptions
      let subscriptions: NotificationSubscription[] = [];
      try {
        subscriptions = await pb
          .collection('notification_subscriptions')
          .getFullList<NotificationSubscription>();
      } catch {
        console.log('No notification subscriptions found');
      }

      const enabledSubs = subscriptions.filter((sub) => sub.enabled === true);

      // Send push notifications
      for (const sub of enabledSubs) {
        try {
          const payload = JSON.stringify({
            title: 'Grocery List Updated',
            body: 'New items have been added to your grocery list',
            icon: '/icon-192.png',
            badge: '/badge-72.png',
            tag: 'grocery-items-added',
            data: {
              url: '/groceries',
              sourceCollection: 'groceries',
              timestamp: new Date().toISOString(),
            },
          });

          await webpush.sendNotification(sub.subscription_data, payload);
        } catch (error: unknown) {
          const err = error as { statusCode?: number };
          // If subscription is expired, delete it
          if (err.statusCode === 404 || err.statusCode === 410) {
            try {
              await pb.collection('notification_subscriptions').delete(sub.id);
            } catch {
              // Ignore delete errors
            }
          }
        }
      }
    }

    // Create notification record in database
    try {
      await pb.collection('notifications').create({
        user_id: user.id,
        title: 'Grocery List Updated',
        message: 'New items have been added to your grocery list',
        notification_type: 'system',
        source_collection: 'groceries',
        read: false,
        sent_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Failed to create notification record:', error);
    }

    // Update or create cooldown record
    const now = new Date().toISOString();
    try {
      if (cooldownRecord) {
        await pb.collection('notification_cooldowns').update(cooldownRecord.id, {
          last_sent: now,
        });
      } else {
        await pb.collection('notification_cooldowns').create({
          user_id: user.id,
          notification_type: NOTIFICATION_TYPE,
          last_sent: now,
          cooldown_minutes: COOLDOWN_MINUTES,
        });
      }
    } catch (error) {
      console.error('Failed to update cooldown record:', error);
    }

    return NextResponse.json({
      success: true,
      sent: true,
      message: 'Grocery notification sent',
    });
  } catch (error) {
    console.error('Error in grocery notification endpoint:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
