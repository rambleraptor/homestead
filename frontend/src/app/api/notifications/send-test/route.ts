/**
 * API Route: Send Test Notification
 *
 * POST /api/notifications/send-test
 * Returns: { success: boolean, message: string, timestamp: string }
 *
 * Requires admin authentication (PocketBase admin token in Authorization header)
 */

import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';
import PocketBase from 'pocketbase';
import { checkAndSendPeopleNotifications } from '../utils/notification-sender';

/**
 * Verify admin authentication using PocketBase token
 */
async function verifyAdminAuth(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    return false;
  }

  const token = authHeader.replace('Bearer ', '');
  const pb = new PocketBase(process.env.NEXT_PUBLIC_POCKETBASE_URL || 'http://127.0.0.1:8090');

  try {
    pb.authStore.save(token);
    // Check if the authenticated user is an admin
    // In PocketBase, admin tokens are stored differently
    // We can verify by trying to list admins (only admins can do this)
    await pb.admins.authRefresh();
    return true;
  } catch (error) {
    console.error('Admin auth verification failed:', error);
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    // Verify admin authentication
    const isAdmin = await verifyAdminAuth(request);
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Unauthorized - admin access required' },
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

    // Run the notification check
    await checkAndSendPeopleNotifications();

    return NextResponse.json({
      success: true,
      message: 'Test notification check triggered',
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
