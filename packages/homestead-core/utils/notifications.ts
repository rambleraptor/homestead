import { logger } from './logger';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

if (!VAPID_PUBLIC_KEY) {
  logger.error(
    'NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set. Web push notifications will not work. ' +
      'Please set this environment variable in your .env.local file. ' +
      'You can generate VAPID keys using: npx web-push generate-vapid-keys'
  );
}

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

export function isNotificationSupported(): boolean {
  return 'Notification' in window && 'serviceWorker' in navigator;
}

export function isNotificationPermissionGranted(): boolean {
  return isNotificationSupported() && Notification.permission === 'granted';
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!isNotificationSupported()) {
    throw new Error('Notifications are not supported in this browser');
  }

  const permission = await Notification.requestPermission();
  return permission === 'granted';
}

export async function subscribeToPushNotifications(): Promise<PushSubscription> {
  if (!isNotificationSupported()) {
    throw new Error('Notifications are not supported in this browser');
  }

  const registration = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;

  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
  });
}

export async function unsubscribeFromPushNotifications(): Promise<void> {
  if (!isNotificationSupported()) return;

  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return;

  const subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    await subscription.unsubscribe();
  }
}

export async function getCurrentPushSubscription(): Promise<PushSubscription | null> {
  if (!isNotificationSupported()) return null;

  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return null;

  return registration.pushManager.getSubscription();
}

export function showNotification(title: string, options?: NotificationOptions): void {
  if (!isNotificationSupported()) {
    logger.warn('Notifications are not supported');
    return;
  }

  if (Notification.permission === 'granted') {
    new Notification(title, options);
  }
}
