/**
 * Service Worker: Web Push notifications, and files shared to an installed app
 * from the device's share sheet (Web Share Target).
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {
    title: 'Homestead Notification',
    body: 'You have a new notification',
    icon: '/logo.png',
    badge: '/badge.png',
  };

  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || '/logo.png',
    badge: data.badge || '/badge.png',
    data: data.data || {},
    tag: data.tag || 'default',
    requireInteraction: data.requireInteraction || false,
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options).catch((err) =>
      console.error('[SW] Error showing notification:', err),
    ),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // Navigate to the app when the notification is clicked.
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Focus an existing window from this origin if one is open.
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.focus();
          }
        }
        // Otherwise open a new one.
        if (self.clients.openWindow) {
          return self.clients.openWindow('/');
        }
      }),
  );
});

// --- Share target -----------------------------------------------------------
// Mirrors `homestead-core/shared/pwa/shareTarget.ts`, which builds the manifest
// entry and takes the files back out; this file is served as-is and can't
// import it.
const SHARE_TARGET_SUFFIX = '/share-target';
const SHARED_PARAM = 'shared';
const SHARE_CACHE = 'homestead-shared';

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'POST') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.endsWith(SHARE_TARGET_SUFFIX)) return;
  event.respondWith(receiveShare(request, url));
});

/**
 * Park the shared files in Cache Storage under a fresh share id, then send the
 * app to its base path with `?shared=<id>` (keeping the action's own query,
 * e.g. `chrome=none`) to pick them up. A failure still lands on the app, just
 * without a share to take.
 */
async function receiveShare(request, url) {
  const target = new URL(url.pathname.slice(0, -SHARE_TARGET_SUFFIX.length) || '/', url.origin);
  url.searchParams.forEach((value, key) => target.searchParams.set(key, value));
  try {
    const form = await request.formData();
    const files = form.getAll('files').filter((entry) => entry instanceof File);
    if (files.length) {
      const id = self.crypto.randomUUID();
      const cache = await caches.open(SHARE_CACHE);
      await Promise.all(
        files.map((file, i) =>
          cache.put(
            `/__shared/${id}/${i}`,
            new Response(file, {
              headers: {
                'content-type': file.type || 'application/octet-stream',
                'x-filename': encodeURIComponent(file.name),
              },
            }),
          ),
        ),
      );
      target.searchParams.set(SHARED_PARAM, id);
    }
  } catch (err) {
    console.error('[SW] Could not receive shared files:', err);
  }
  return Response.redirect(target.href, 303);
}
