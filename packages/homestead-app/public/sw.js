/**
 * Service Worker: the offline app shell, Web Push notifications, and files
 * shared to an installed app from the device's share sheet (Web Share Target).
 *
 * A production build prepends `self.__HOMESTEAD_PRECACHE__` — that build's
 * cache version and every file it emitted (`vite/offline-precache.ts`). Dev
 * has no header, and the worker then caches nothing.
 */

// --- Offline app shell --------------------------------------------------------
const PRECACHE = self.__HOMESTEAD_PRECACHE__ || null;
const SHELL_PREFIX = 'homestead-shell-';
const SHELL_CACHE = PRECACHE ? SHELL_PREFIX + PRECACHE.version : null;
const SHELL_URLS = new Set(PRECACHE ? PRECACHE.urls : []);
const LAZY_URLS = new Set(PRECACHE ? PRECACHE.lazy : []);
const INDEX_URL = '/index.html';
// Paths the server answers itself; a navigation to one is never the SPA.
const SERVER_PREFIXES = ['/api/', '/oauth/', '/oauth2/', '/.well-known/', '/health'];
// How long a navigation waits on the network before falling back to the
// cached shell — one bar of signal in a store shouldn't mean a blank screen.
const NAVIGATION_TIMEOUT_MS = 4000;

self.addEventListener('install', (event) => {
  self.skipWaiting();
  if (!SHELL_CACHE) return;
  // `reload` skips the HTTP cache so the shell is exactly this build. addAll
  // is all-or-nothing: a failed fetch fails the install and the previous
  // worker (and its shell) stays in charge.
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll([...SHELL_URLS].map((url) => new Request(url, { cache: 'reload' })))),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(SHELL_PREFIX) && key !== SHELL_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (!SHELL_CACHE || request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (SERVER_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) return;

  if (request.mode === 'navigate') {
    event.respondWith(navigate(request));
  } else if (SHELL_URLS.has(url.pathname) || LAZY_URLS.has(url.pathname)) {
    event.respondWith(fromShell(url.pathname, request));
  }
  // Anything else (files, other same-origin GETs) goes to the network as usual.
});

/**
 * Network first, so an online launch always gets the current page (with the
 * server's per-app head); the cached shell when the network fails or stalls.
 * The SPA routes on the URL, so one cached index serves every path.
 */
async function navigate(request) {
  const network = fetch(request);
  // If the timeout wins, a later network failure has no one listening.
  network.catch(() => {});
  try {
    const response = await withTimeout(network, NAVIGATION_TIMEOUT_MS);
    if (response.ok) return response;
  } catch {
    // Offline, or slow enough to fall back.
  }
  const cached = await caches.match(INDEX_URL, { cacheName: SHELL_CACHE });
  // No shell (install never finished): let the network answer, however it does.
  return cached || network;
}

/**
 * Build files are content-hashed and never change under a name, so the cache
 * is the source. A lazy file is cached the first time it loads, so the next
 * offline use finds it.
 */
async function fromShell(pathname, request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(pathname);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && LAZY_URLS.has(pathname)) {
    await cache.put(pathname, response.clone());
  }
  return response;
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

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
