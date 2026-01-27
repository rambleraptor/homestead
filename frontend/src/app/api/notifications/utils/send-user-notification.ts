/**
 * Reusable utility for sending push notifications to an authenticated user.
 *
 * Handles VAPID configuration, subscription fetching, push delivery,
 * expired subscription cleanup, and notification record creation.
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

export interface UserNotificationOptions {
  title: string;
  body: string;
  tag: string;
  url: string;
  sourceCollection?: string;
  sourceId?: string;
}

interface AuthResult {
  pb: PocketBase;
  userId: string;
}

/**
 * Authenticate a request using the PocketBase Bearer token.
 * Returns the authenticated PocketBase client and user ID, or null.
 */
async function authenticate(request: NextRequest): Promise<AuthResult | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return null;

  const token = authHeader.replace('Bearer ', '');
  const pb = new PocketBase(process.env.NEXT_PUBLIC_POCKETBASE_URL || 'http://127.0.0.1:8090');

  try {
    pb.authStore.save(token);
    if (!pb.authStore.isValid) return null;
    await pb.collection('users').authRefresh();
    const model = pb.authStore.model;
    if (!model) return null;
    return { pb, userId: model.id };
  } catch {
    return null;
  }
}

/**
 * Send a push notification to the authenticated user's subscriptions
 * and create a notification record. Returns a NextResponse.
 */
export async function sendUserNotification(
  request: NextRequest,
  options: UserNotificationOptions
): Promise<NextResponse> {
  const auth = await authenticate(request);
  if (!auth) {
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

  webpush.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey);

  const { pb, userId } = auth;

  let subscriptions: NotificationSubscription[] = [];
  try {
    subscriptions = await pb
      .collection('notification_subscriptions')
      .getFullList<NotificationSubscription>();
  } catch (error) {
    console.error('Failed to fetch subscriptions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch notification subscriptions' },
      { status: 500 }
    );
  }

  const enabledSubs = subscriptions.filter((sub) => sub.enabled === true);

  if (enabledSubs.length === 0) {
    return NextResponse.json({
      success: false,
      message: 'No active push subscriptions found. Please enable notifications first.',
      timestamp: new Date().toISOString(),
    });
  }

  let sentCount = 0;
  let failedCount = 0;

  for (const sub of enabledSubs) {
    try {
      const payload = JSON.stringify({
        title: options.title,
        body: options.body,
        icon: '/icon-192.png',
        badge: '/badge-72.png',
        tag: options.tag,
        data: {
          url: options.url,
          sourceCollection: options.sourceCollection,
          sourceId: options.sourceId,
          timestamp: new Date().toISOString(),
        },
      });

      await webpush.sendNotification(sub.subscription_data, payload);
      sentCount++;

      await pb.collection('notifications').create({
        user_id: userId,
        title: options.title,
        message: options.body,
        notification_type: 'system',
        source_collection: options.sourceCollection,
        source_id: options.sourceId,
        read: false,
        sent_at: new Date().toISOString(),
      });
    } catch (error: unknown) {
      const err = error as { statusCode?: number };
      failedCount++;

      if (err.statusCode === 404 || err.statusCode === 410) {
        await pb.collection('notification_subscriptions').delete(sub.id);
      }
    }
  }

  return NextResponse.json({
    success: sentCount > 0,
    message: `Notification sent to ${sentCount} subscription(s)`,
    sent: sentCount,
    failed: failedCount,
    timestamp: new Date().toISOString(),
  });
}
