/**
 * API Route: Send Test Notification
 *
 * POST /api/notifications/send-test
 * Returns: { success: boolean, message: string, timestamp: string }
 *
 * Requires user authentication (PocketBase token in Authorization header)
 */

import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';
import PocketBase from 'pocketbase';

interface NotificationSubscription {
  id: string;
  user_id: string;
  subscription_data: webpush.PushSubscription;
  enabled: boolean;
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
  const pb = new PocketBase(process.env.NEXT_PUBLIC_POCKETBASE_URL || 'http://127.0.0.1:8090');

  try {
    // Load the token into authStore
    pb.authStore.save(token);

    // Verify the token is structurally valid and not expired
    if (!pb.authStore.isValid) {
      return null;
    }

    // Actually verify the token by making an authenticated request
    // This will throw if the token is invalid
    await pb.collection('users').authRefresh();

    return pb.authStore.model;
  } catch (error) {
    console.error('Auth verification failed:', error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    // Verify user authentication
    const authRecord = await verifyAuth(request);
    if (!authRecord) {
      return NextResponse.json(
        { error: 'Unauthorized - authentication required' },
        { status: 401 }
      );
    }

    const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
    const vapidEmail = process.env.VAPID_EMAIL || 'mailto:admin@example.com';

    if (!vapidPublicKey || !vapidPrivateKey) {
      return NextResponse.json(
        { error: 'VAPID keys not configured' },
        { status: 500 }
      );
    }

    // Configure VAPID details
    webpush.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey);

    // Initialize PocketBase with user token
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '') || '';
    const pb = new PocketBase(process.env.NEXT_PUBLIC_POCKETBASE_URL || 'http://127.0.0.1:8090');
    pb.authStore.save(token);

    // Get the current user's subscriptions
    // The collection rule automatically filters by authenticated user
    let subscriptions: NotificationSubscription[] = [];
    try {
      subscriptions = await pb
        .collection('notification_subscriptions')
        .getFullList<NotificationSubscription>();

      console.log(`Found ${subscriptions.length} notification subscription(s)`);
    } catch (error: unknown) {
      const err = error as { status?: number; response?: { message?: string; data?: unknown } };
      console.error('❌ Failed to fetch subscriptions:', {
        status: err.status,
        message: err.response?.message,
        data: err.response?.data,
      });
      throw error;
    }

    const enabledSubs = subscriptions.filter((sub) => sub.enabled === true);

    if (enabledSubs.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'No active push subscriptions found. Please enable notifications first.',
        timestamp: new Date().toISOString(),
      });
    }

    // Send test notification to all active subscriptions
    let sentCount = 0;
    let failedCount = 0;

    for (const sub of enabledSubs) {
      try {
        const payload = JSON.stringify({
          title: '🧪 Test Notification',
          body: 'If you see this, push notifications are working! 🎉',
          icon: '/icon-192.png',
          badge: '/badge-72.png',
          tag: 'test-notification',
          data: {
            url: '/notifications',
            timestamp: new Date().toISOString(),
          },
        });

        console.log('[Test Notification] Sending to subscription:', {
          endpoint: sub.subscription_data.endpoint,
          hasKeys: !!sub.subscription_data.keys,
        });

        await webpush.sendNotification(sub.subscription_data, payload);
        console.log('[Test Notification] ✅ Sent successfully');
        sentCount++;

        // Create notification record
        await pb.collection('notifications').create({
          user_id: authRecord.id,
          title: '🧪 Test Notification',
          message: 'If you see this, push notifications are working! 🎉',
          notification_type: 'system',
          read: false,
          sent_at: new Date().toISOString(),
        });
      } catch (error: unknown) {
        const err = error as { statusCode?: number };
        failedCount++;

        // If subscription is expired, delete it
        if (err.statusCode === 404 || err.statusCode === 410) {
          await pb.collection('notification_subscriptions').delete(sub.id);
        }
      }
    }

    return NextResponse.json({
      success: sentCount > 0,
      message: `Test notification sent to ${sentCount} subscription(s)`,
      sent: sentCount,
      failed: failedCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error in test notification endpoint:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
