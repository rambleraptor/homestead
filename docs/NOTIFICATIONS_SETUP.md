# Web Push Notifications Setup Guide

This guide will help you set up web push notifications so the Events module can send notifications directly to users' phones and browsers.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Step 1: Generate VAPID Keys](#step-1-generate-vapid-keys)
- [Step 2: Configure Frontend](#step-2-configure-frontend)
- [Step 3: Set Up Backend Notification Service](#step-3-set-up-backend-notification-service)
- [Step 4: Enable Notifications in the App](#step-4-enable-notifications-in-the-app)
- [Step 5: Testing](#step-5-testing)
- [Troubleshooting](#troubleshooting)

## Overview

The Events module uses **Web Push Notifications** to send reminders about birthdays and anniversaries. This works on:

- ✅ Desktop browsers (Chrome, Firefox, Edge, Safari 16+)
- ✅ Android phones (Chrome, Firefox)
- ✅ iOS/iPadOS 16.4+ (Safari, when app is added to home screen)

**How it works:**
1. Users grant notification permission in Settings
2. The app subscribes to push notifications using the browser's Push API
3. Subscription data is stored in PocketBase
4. A backend service sends push notifications based on event reminders
5. Notifications appear on users' devices even when the app is closed

## Prerequisites

- Node.js 18+ installed
- PocketBase running
- HTTPS enabled (required for web push, or use localhost for testing)

## Step 1: Generate VAPID Keys

VAPID (Voluntary Application Server Identification) keys are required for web push notifications.

### Option A: Using web-push CLI (Recommended)

```bash
# Install web-push globally
npm install -g web-push

# Generate VAPID keys
web-push generate-vapid-keys
```

You'll get output like:
```
=======================================
Public Key:
BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U

Private Key:
UUxI4O8-FbRouAevSmBQ6o8aqmnOhdsYN5FZJCJcOj8
=======================================
```

### Option B: Using Node.js script

Create a file `generate-vapid.js`:

```javascript
const webpush = require('web-push');

const vapidKeys = webpush.generateVAPIDKeys();

console.log('Public Key:', vapidKeys.publicKey);
console.log('Private Key:', vapidKeys.privateKey);
```

Run it:
```bash
npm install web-push
node generate-vapid.js
```

⚠️ **Important:** Keep your **private key SECRET**. Never commit it to version control or expose it in the frontend.

## Step 2: Configure Frontend

### 2.1 Set Environment Variable

Create or update `frontend/.env`:

```bash
# VAPID Public Key (safe to expose to frontend)
VITE_VAPID_PUBLIC_KEY=BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U
```

Replace the value with **your public key** from Step 1.

### 2.2 Verify Service Worker

The service worker is already set up at `frontend/public/sw.js`. Verify it exists:

```bash
ls frontend/public/sw.js
```

It should handle:
- Push notification reception
- Notification click handling
- Background sync (future feature)

### 2.3 Rebuild Frontend

```bash
cd frontend
npm run build
```

The service worker will be registered automatically when users visit the app.

## Step 3: Set Up Backend Notification Service

You need a backend service to send push notifications. Here are three options:

### Option A: PocketBase Hook (Recommended)

Create `pb_hooks/send_notifications.pb.js`:

```javascript
// @ts-check
/// <reference path="../pb_data/types.d.ts" />

const webpush = require('web-push');

// Configure VAPID details
webpush.setVapidDetails(
  'mailto:your-email@example.com', // Replace with your email
  process.env.VAPID_PUBLIC_KEY,     // Set via environment
  process.env.VAPID_PRIVATE_KEY     // Set via environment
);

// Run daily at 9 AM to check for events needing notifications
cronAdd('send-event-notifications', '0 9 * * *', () => {
  const now = new Date();
  const today = now.toISOString().split('T')[0];

  // Get all events
  const events = $app.dao().findRecordsByFilter(
    'events',
    'recurring_yearly = true || event_date >= {:today}',
    '-event_date',
    500,
    0,
    { today }
  );

  events.forEach((event) => {
    const eventDate = new Date(event.get('event_date'));
    const notificationPrefs = event.get('notification_preferences') || [];

    // Check if we should send notifications today
    const shouldNotify = notificationPrefs.some((pref) => {
      if (pref === 'day_of') {
        return isSameDay(now, eventDate);
      } else if (pref === 'day_before') {
        return isSameDay(addDays(now, 1), eventDate);
      } else if (pref === 'week_before') {
        return isSameDay(addDays(now, 7), eventDate);
      }
      return false;
    });

    if (shouldNotify) {
      sendEventNotifications(event);
    }
  });
});

function sendEventNotifications(event) {
  // Get all active notification subscriptions
  const subscriptions = $app.dao().findRecordsByFilter(
    'notification_subscriptions',
    'enabled = true',
    '-created',
    500
  );

  const title = event.get('event_type') === 'birthday'
    ? '🎂 Birthday Reminder'
    : '💝 Anniversary Reminder';

  const body = `${event.get('title')} - ${event.get('people_involved')}`;

  subscriptions.forEach((sub) => {
    const subscriptionData = sub.get('subscription_data');

    const payload = JSON.stringify({
      title,
      body,
      icon: '/icon-192.png',
      badge: '/badge-72.png',
      data: {
        url: '/events',
        eventId: event.getId(),
      },
    });

    webpush
      .sendNotification(subscriptionData, payload)
      .then(() => {
        // Create notification record
        const notification = new Record($app.dao().findCollectionByNameOrId('notifications'));
        notification.set('user_id', sub.get('user_id'));
        notification.set('event_id', event.getId());
        notification.set('title', title);
        notification.set('body', body);
        notification.set('read', false);
        notification.set('sent_at', new Date().toISOString());
        $app.dao().saveRecord(notification);
      })
      .catch((error) => {
        if (error.statusCode === 404 || error.statusCode === 410) {
          // Subscription expired, delete it
          $app.dao().deleteRecord(sub);
        } else {
          console.error('Push notification error:', error);
        }
      });
  });
}

function isSameDay(date1, date2) {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
```

Set environment variables for PocketBase:

```bash
export VAPID_PUBLIC_KEY="your-public-key"
export VAPID_PRIVATE_KEY="your-private-key"
```

Restart PocketBase to load the hook.

### Option B: Separate Node.js Service

Create `services/notification-service/index.js`:

```javascript
import PocketBase from 'pocketbase';
import webpush from 'web-push';
import cron from 'node-cron';

// Configure VAPID
webpush.setVapidDetails(
  'mailto:your-email@example.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

const pb = new PocketBase('http://127.0.0.1:8090');

// Authenticate as admin
await pb.admins.authWithPassword(
  process.env.ADMIN_EMAIL,
  process.env.ADMIN_PASSWORD
);

// Run daily at 9 AM
cron.schedule('0 9 * * *', async () => {
  console.log('Checking for events needing notifications...');
  await sendEventNotifications();
});

async function sendEventNotifications() {
  const now = new Date();
  const today = now.toISOString().split('T')[0];

  // Get all events
  const events = await pb.collection('events').getFullList({
    filter: `recurring_yearly = true || event_date >= "${today}"`,
  });

  for (const event of events) {
    const eventDate = new Date(event.event_date);
    const notificationPrefs = event.notification_preferences || [];

    const shouldNotify = notificationPrefs.some((pref) => {
      if (pref === 'day_of') {
        return isSameDay(now, eventDate);
      } else if (pref === 'day_before') {
        return isSameDay(addDays(now, 1), eventDate);
      } else if (pref === 'week_before') {
        return isSameDay(addDays(now, 7), eventDate);
      }
      return false;
    });

    if (shouldNotify) {
      await sendPushNotifications(event);
    }
  }
}

async function sendPushNotifications(event) {
  const subscriptions = await pb.collection('notification_subscriptions').getFullList({
    filter: 'enabled = true',
  });

  const title = event.event_type === 'birthday'
    ? '🎂 Birthday Reminder'
    : '💝 Anniversary Reminder';

  const body = `${event.title} - ${event.people_involved}`;

  for (const sub of subscriptions) {
    const payload = JSON.stringify({
      title,
      body,
      icon: '/icon-192.png',
      badge: '/badge-72.png',
      data: {
        url: '/events',
        eventId: event.id,
      },
    });

    try {
      await webpush.sendNotification(sub.subscription_data, payload);

      // Create notification record
      await pb.collection('notifications').create({
        user_id: sub.user_id,
        event_id: event.id,
        title,
        body,
        read: false,
        sent_at: new Date().toISOString(),
      });

      console.log(`✓ Sent notification for ${event.title}`);
    } catch (error) {
      if (error.statusCode === 404 || error.statusCode === 410) {
        // Subscription expired
        await pb.collection('notification_subscriptions').delete(sub.id);
        console.log(`✗ Deleted expired subscription for user ${sub.user_id}`);
      } else {
        console.error('Push notification error:', error);
      }
    }
  }
}

function isSameDay(date1, date2) {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

console.log('Notification service started. Checking for events daily at 9 AM...');
```

Create `services/notification-service/package.json`:

```json
{
  "name": "notification-service",
  "type": "module",
  "scripts": {
    "start": "node index.js"
  },
  "dependencies": {
    "pocketbase": "^0.21.0",
    "web-push": "^3.6.7",
    "node-cron": "^3.0.3"
  }
}
```

Install and run:

```bash
cd services/notification-service
npm install

# Set environment variables
export VAPID_PUBLIC_KEY="your-public-key"
export VAPID_PRIVATE_KEY="your-private-key"
export ADMIN_EMAIL="admin@example.com"
export ADMIN_PASSWORD="your-admin-password"

# Run the service
npm start
```

### Option C: Serverless Function (Vercel, Netlify, etc.)

Deploy a serverless function that runs on a schedule. Example for Vercel:

Create `api/send-notifications.js`:

```javascript
import PocketBase from 'pocketbase';
import webpush from 'web-push';

webpush.setVapidDetails(
  'mailto:your-email@example.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

export default async function handler(req, res) {
  // Verify cron secret to prevent unauthorized calls
  if (req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Same notification logic as above...

  res.status(200).json({ success: true });
}
```

Configure Vercel cron in `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/send-notifications",
      "schedule": "0 9 * * *"
    }
  ]
}
```

## Step 4: Enable Notifications in the App

### 4.1 User Setup

1. **Navigate to Settings:**
   - Open the app
   - Go to **Settings** → **Notifications**

2. **Enable Push Notifications:**
   - Click **Enable Push Notifications**
   - Grant permission when browser prompts
   - You should see "Status: Enabled ✓"

3. **Create Events with Reminders:**
   - Go to **Events** module
   - Create a birthday or anniversary
   - Select reminder preferences:
     - ☑️ Day of
     - ☑️ Day before
     - ☑️ Week before

### 4.2 Mobile Device Setup

**Android (Chrome/Firefox):**
1. Open the app in your mobile browser
2. Follow the same steps as desktop
3. Grant notification permission when prompted

**iOS/iPadOS (Safari 16.4+):**
1. Open the app in Safari
2. Tap the Share button
3. Select **Add to Home Screen**
4. Open the app from your home screen
5. Go to Settings → Notifications
6. Enable push notifications

## Step 5: Testing

### Manual Testing

To test notifications immediately without waiting:

**Option 1: Use web-push CLI**

```bash
# Install web-push
npm install -g web-push

# Get a subscription from PocketBase
# Navigate to: http://localhost:8090/_/ (PocketBase Admin)
# Copy a subscription_data object from notification_subscriptions collection

# Send test notification
web-push send-notification \
  --endpoint="https://..." \
  --key="..." \
  --auth="..." \
  --vapid-subject="mailto:your-email@example.com" \
  --vapid-pubkey="your-public-key" \
  --vapid-pvtkey="your-private-key" \
  --payload='{"title":"Test","body":"This is a test notification"}'
```

**Option 2: Create a test endpoint**

Add to your notification service:

```javascript
// Test endpoint - remove in production
app.post('/api/test-notification', async (req, res) => {
  const subscriptions = await pb.collection('notification_subscriptions').getFullList({
    filter: 'enabled = true',
  });

  const payload = JSON.stringify({
    title: '🧪 Test Notification',
    body: 'If you see this, notifications are working!',
    icon: '/icon-192.png',
  });

  for (const sub of subscriptions) {
    await webpush.sendNotification(sub.subscription_data, payload);
  }

  res.json({ success: true, sent: subscriptions.length });
});
```

Then visit: `http://localhost:3000/api/test-notification`

### Verify Subscription

Check PocketBase Admin UI:
1. Go to `http://localhost:8090/_/`
2. Navigate to **notification_subscriptions** collection
3. Verify your subscription exists with `enabled = true`
4. Check the `subscription_data` contains `endpoint`, `keys.p256dh`, and `keys.auth`

## Troubleshooting

### Issue: "Enable Push Notifications" button doesn't work

**Causes:**
- App not running on HTTPS (or localhost)
- Browser doesn't support Push API
- Service worker not registered

**Solutions:**
1. Check console for errors
2. Verify service worker: Open DevTools → Application → Service Workers
3. Use Chrome/Firefox on desktop or Android
4. For iOS, ensure app is added to home screen

### Issue: Notifications not appearing

**Causes:**
- Notification permission denied
- Subscription expired or invalid
- Backend service not running
- VAPID keys mismatch

**Solutions:**
1. Check browser notification settings
2. Re-enable notifications in Settings
3. Verify backend service is running
4. Check backend logs for errors
5. Ensure VAPID keys match between frontend and backend

### Issue: Service worker not registering

**Causes:**
- Not on HTTPS
- Service worker file not accessible
- Browser cache

**Solutions:**
1. Clear browser cache
2. Check `frontend/public/sw.js` exists
3. Verify build output includes `sw.js`
4. Use HTTPS or localhost

### Issue: Subscription immediately expires

**Causes:**
- VAPID keys invalid
- Email in `setVapidDetails` incorrect
- Browser security settings

**Solutions:**
1. Regenerate VAPID keys
2. Use valid email in `mailto:` format
3. Check backend console for detailed errors

### Debug Mode

Enable debug logging in the service worker:

Edit `frontend/public/sw.js`:

```javascript
// Add at top of file
const DEBUG = true;

function log(...args) {
  if (DEBUG) console.log('[SW]', ...args);
}

// Use throughout:
log('Push notification received:', event.data.json());
```

Check service worker console:
- DevTools → Application → Service Workers → Click "inspect"

## Additional Resources

- [Web Push Protocol](https://datatracker.ietf.org/doc/html/rfc8030)
- [Push API MDN Docs](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)
- [web-push Library](https://github.com/web-push-libs/web-push)
- [iOS Web Push Support](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)

## Security Best Practices

1. **Never expose private VAPID key** in frontend or version control
2. **Use environment variables** for all secrets
3. **Validate notification payloads** to prevent XSS
4. **Rate limit** notification sending to prevent abuse
5. **Implement unsubscribe** mechanism (already done in Settings)
6. **Use HTTPS** in production (required for service workers)
7. **Sanitize event data** before including in notifications

## Next Steps

Once notifications are working:

- [ ] Set up monitoring for failed notifications
- [ ] Implement notification analytics
- [ ] Add rich notification actions (snooze, view event)
- [ ] Support notification sound preferences
- [ ] Add notification batching for multiple events
- [ ] Implement quiet hours (don't send at night)

---

**Need help?** Open an issue or check the troubleshooting section above.
