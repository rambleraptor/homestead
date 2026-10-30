/**
 * Register the site's service worker (`/sw.js`) at boot. Push used to be its
 * only job, so it was registered only on subscribing; receiving shared files
 * (`shareTarget.ts`) needs it in place before anything is shared, so the SPA
 * registers it on every load. Registering an already-registered worker is a
 * no-op, so the push subscription path can keep registering it too.
 */

export const SERVICE_WORKER_URL = '/sw.js';

export function registerServiceWorker(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  // Nothing the user did failed, and push surfaces its own registration error
  // when they turn it on — a browser that refuses the worker just goes without
  // share-to-Homestead.
  void navigator.serviceWorker.register(SERVICE_WORKER_URL).catch(() => {});
}
