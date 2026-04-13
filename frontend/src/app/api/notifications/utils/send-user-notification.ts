/**
 * Reusable utility for sending push notifications to an authenticated user.
 *
 * Handles VAPID configuration, subscription fetching, push delivery,
 * expired subscription cleanup, and notification record creation —
 * all against aepbase.
 */

import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';
import {
  authenticate,
  aepList,
  aepCreate,
  aepRemove,
} from '../../_lib/aepbase-server';

interface NotificationSubscriptionRecord {
  id: string;
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

export async function sendUserNotification(
  request: NextRequest,
  options: UserNotificationOptions,
): Promise<NextResponse> {
  const auth = await authenticate(request);
  if (!auth) {
    return NextResponse.json(
      { error: 'Unauthorized - authentication required' },
      { status: 401 },
    );
  }

  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  const vapidEmail = process.env.VAPID_EMAIL || 'mailto:admin@example.com';

  if (!vapidPublicKey || !vapidPrivateKey) {
    return NextResponse.json(
      { error: 'VAPID keys not configured' },
      { status: 500 },
    );
  }
  webpush.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey);

  const userId = auth.user.id;
  const userParent = ['users', userId];

  let subscriptions: NotificationSubscriptionRecord[];
  try {
    subscriptions = await aepList<NotificationSubscriptionRecord>(
      'notification-subscriptions',
      auth.token,
      userParent,
    );
  } catch (error) {
    console.error('Failed to fetch subscriptions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch notification subscriptions' },
      { status: 500 },
    );
  }

  const enabledSubs = subscriptions.filter((sub) => sub.enabled === true);

  if (enabledSubs.length === 0) {
    return NextResponse.json({
      success: false,
      message:
        'No active push subscriptions found. Please enable notifications first.',
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

      await aepCreate(
        'notifications',
        {
          user_id: userId,
          title: options.title,
          message: options.body,
          notification_type: 'system',
          source_collection: options.sourceCollection,
          source_id: options.sourceId,
          read: false,
          sent_at: new Date().toISOString(),
        },
        auth.token,
        userParent,
      );
    } catch (error: unknown) {
      const err = error as { statusCode?: number };
      failedCount++;
      if (err.statusCode === 404 || err.statusCode === 410) {
        await aepRemove(
          'notification-subscriptions',
          sub.id,
          auth.token,
          userParent,
        ).catch(() => undefined);
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
