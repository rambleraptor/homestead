/**
 * Utility functions for managing web push notifications
 */

import { logger } from './logger';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

if (!VAPID_PUBLIC_KEY || VAPID_PUBLIC_KEY === 'YOUR_VAPID_PUBLIC_KEY_HERE') {
  logger.error(
    'NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set or is using the placeholder value. ' +
      'Web push notifications will not work. ' +
      'Please set this environment variable in your .env.local file with a valid VAPID public key. ' +
      'You can generate VAPID keys using: npx web-push generate-vapid-keys'
  );
}

/**
 * Convert VAPID public key to Uint8Array
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Check if the browser supports notifications
 */
export function isNotificationSupported(): boolean {
  return 'Notification' in window && 'serviceWorker' in navigator;
}

/**
 * Check if notification permission is granted
 */
export function isNotificationPermissionGranted(): boolean {
  return isNotificationSupported() && Notification.permission === 'granted';
}

/**
 * Request notification permission from the user
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!isNotificationSupported()) {
    throw new Error('Notifications are not supported in this browser');
  }

  const permission = await Notification.requestPermission();
  return permission === 'granted';
}

/**
 * Register service worker and subscribe to push notifications
 */
export async function subscribeToPushNotifications(): Promise<PushSubscription> {
  if (!isNotificationSupported()) {
    throw new Error('Notifications are not supported in this browser');
  }

  if (!VAPID_PUBLIC_KEY || VAPID_PUBLIC_KEY === 'YOUR_VAPID_PUBLIC_KEY_HERE') {
    throw new Error(
      'VAPID public key is not configured. Please set NEXT_PUBLIC_VAPID_PUBLIC_KEY in your .env.local file. ' +
        'Generate keys using: npx web-push generate-vapid-keys'
    );
  }

  // Register service worker
  const registration = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;

  try {
    // Subscribe to push notifications
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
    });

    return subscription;
  } catch (error) {
    if (error instanceof Error && error.message.includes('applicationServerKey')) {
      throw new Error(
        'Invalid VAPID public key. Please ensure NEXT_PUBLIC_VAPID_PUBLIC_KEY is set to a valid key. ' +
          'Generate new keys using: npx web-push generate-vapid-keys'
      );
    }
    throw error;
  }
}

/**
 * Unsubscribe from push notifications
 */
export async function unsubscribeFromPushNotifications(): Promise<void> {
  if (!isNotificationSupported()) {
    return;
  }

  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) {
    return;
  }

  const subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    await subscription.unsubscribe();
  }
}

/**
 * Get the current push subscription
 */
export async function getCurrentPushSubscription(): Promise<PushSubscription | null> {
  if (!isNotificationSupported()) {
    return null;
  }

  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) {
    return null;
  }

  return await registration.pushManager.getSubscription();
}

/**
 * Show a notification (fallback for browsers without push support)
 */
export function showNotification(title: string, options?: NotificationOptions): void {
  if (!isNotificationSupported()) {
    logger.warn('Notifications are not supported');
    return;
  }

  if (Notification.permission === 'granted') {
    new Notification(title, options);
  }
}
