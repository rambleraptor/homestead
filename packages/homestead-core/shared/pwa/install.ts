/**
 * Putting an app on the Home Screen, from wherever the person is.
 *
 * Browsers only install the page you're on, from the browser itself — and an
 * app already on the Home Screen has no browser toolbar, so on iOS there is no
 * Share button and no "Add to Home Screen" inside it at all. So installing an
 * app means getting to that app's page *in the browser*, where its head
 * already carries its own manifest, icon and name (`appManifest.ts`), and then
 * walking the person through the browser's step:
 *
 * - The app drawer sends them to `<basePath>?install` (`installPageUrl`).
 *   From an installed app on iOS that means handing the address to Safari
 *   (`x-safari-https://…`, iOS 17+); anywhere else it's a full page load, so
 *   the server writes the app's manifest into the head before the browser
 *   reads it.
 * - On that page, `InstallGuide` shows the step for the browser: Chrome and
 *   Edge install with one button (the deferred `beforeinstallprompt`), iOS
 *   gets Share → Add to Home Screen, anything else a pointer to its menu.
 *
 * DOM-free at module level apart from the prompt listener, which is guarded.
 */

import { useSyncExternalStore } from 'react';

/** The query parameter that opens the install guide on an app's page. */
export const INSTALL_PARAM = 'install';

/** Running as an installed app (Home Screen / standalone), not in a browser tab. */
export function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  const media = typeof window.matchMedia === 'function'
    ? window.matchMedia('(display-mode: standalone)').matches
    : false;
  return iosStandalone || media;
}

/** An iPhone or iPad — including an iPad that reports itself as a Mac. */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (/iPhone|iPad|iPod/.test(navigator.userAgent)) return true;
  return /Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1;
}

/** The absolute address of an app's page with the install guide open. */
export function installPageUrl(basePath: string, origin: string): string {
  const base = basePath.replace(/\/+$/, '') || '/';
  return `${origin}${base}?${INSTALL_PARAM}`;
}

/**
 * The same address, for Safari to open (`x-safari-https://…`). Only iOS 17+
 * knows the scheme; elsewhere it does nothing, so pair it with a way to copy
 * the plain address.
 */
export function safariUrl(url: string): string {
  return url.replace(/^(https?):\/\//, 'x-safari-$1://');
}

// ---------------------------------------------------------------------------
// Chrome / Edge: the install prompt
// ---------------------------------------------------------------------------

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  // Chrome fires this once it judges the page installable — often before
  // React mounts — so it's caught here, at import, and kept for the guide.
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify();
  });
}

/**
 * Whether the browser offered to install this page, and a way to ask. Chrome
 * and Edge only; Safari and Firefox never offer.
 */
export function useInstallPrompt(): {
  available: boolean;
  install: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
} {
  const available = useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => deferredPrompt !== null,
    () => false,
  );
  return {
    available,
    install: async () => {
      const event = deferredPrompt;
      if (!event) return 'unavailable';
      // A prompt can be shown once.
      deferredPrompt = null;
      notify();
      await event.prompt();
      return (await event.userChoice).outcome;
    },
  };
}
