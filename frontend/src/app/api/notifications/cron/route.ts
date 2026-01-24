/**
 * API Route: Notification Cron Job
 *
 * GET /api/notifications/cron
 * Returns: { success: boolean, message: string, timestamp: string }
 *
 * This endpoint is designed to be called by Vercel Cron or an external scheduler
 * to send daily notifications based on recurring notification configurations.
 *
 * For security, it requires either:
 * 1. A CRON_SECRET header matching the CRON_SECRET environment variable
 * 2. Or, if deployed on Vercel, it will be automatically secured by Vercel Cron
 *
 * To set up Vercel Cron, add this to vercel.json:
 * {
 *   "crons": [{
 *     "path": "/api/notifications/cron",
 *     "schedule": "0 9 * * *"
 *   }]
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';
import { checkAndSendRecurringNotifications, checkAndSendLegacyPeopleNotifications } from '../utils/notification-sender';

/**
 * Verify the request is authorized to trigger the cron job
 */
function verifyAuthorization(request: NextRequest): boolean {
  // Check for CRON_SECRET if configured
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
      return false;
    }
  }

  // If no CRON_SECRET is set, allow the request
  // (This is for local development or when using Vercel Cron which has built-in auth)
  return true;
}

export async function GET(request: NextRequest) {
  try {
    // Verify authorization
    if (!verifyAuthorization(request)) {
      return NextResponse.json(
        { error: 'Unauthorized - invalid or missing CRON_SECRET' },
        { status: 401 }
      );
    }

    const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
    const vapidEmail = process.env.VAPID_EMAIL || 'mailto:admin@example.com';

    if (!vapidPublicKey || !vapidPrivateKey) {
      console.error('VAPID keys not configured');
      return NextResponse.json(
        { error: 'VAPID keys not configured' },
        { status: 500 }
      );
    }

    // Configure VAPID details
    webpush.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey);

    console.log('Running scheduled notification checks...');

    // Run both the new recurring notification system and the legacy people notifications
    // This ensures both new and existing people get their notifications
    await checkAndSendRecurringNotifications();
    await checkAndSendLegacyPeopleNotifications();

    return NextResponse.json({
      success: true,
      message: 'Notification check completed successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error in notification cron job:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

// Also support POST for compatibility with different cron services
export async function POST(request: NextRequest) {
  return GET(request);
}
