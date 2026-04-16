/**
 * Handler for POST /api/notifications/send-grocery
 * Returns: { success: boolean, message: string, timestamp: string }
 *
 * Sends a push notification about the grocery list.
 * Requires user authentication (aepbase token in Authorization header).
 */

import { NextRequest } from 'next/server';
import { sendUserNotification } from './send-user-notification';

export async function POST(request: NextRequest) {
  return sendUserNotification(request, {
    title: 'Grocery List Updated',
    body: 'The grocery list has been updated. Check it out!',
    tag: 'grocery-notification',
    url: '/groceries',
    sourceCollection: 'grocery_items',
  });
}
