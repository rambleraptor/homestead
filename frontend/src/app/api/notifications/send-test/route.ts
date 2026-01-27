/**
 * API Route: Send Test Notification
 *
 * POST /api/notifications/send-test
 * Returns: { success: boolean, message: string, timestamp: string }
 *
 * Requires user authentication (PocketBase token in Authorization header)
 */

import { NextRequest } from 'next/server';
import { sendUserNotification } from '../utils/send-user-notification';

export async function POST(request: NextRequest) {
  return sendUserNotification(request, {
    title: 'Test Notification',
    body: 'If you see this, push notifications are working!',
    tag: 'test-notification',
    url: '/notifications',
  });
}
