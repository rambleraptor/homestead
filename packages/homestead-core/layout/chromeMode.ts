/**
 * Chromeless mode: hide the app chrome (sidebar + top bar) so a single app
 * fills the screen, the way an app installed to a phone's home screen is
 * expected to look.
 *
 * Switched by a URL parameter, `?chrome=none` (hide) / `?chrome=full`
 * (restore). The choice sticks for the browsing session — client-side
 * navigation drops the query string, so a launch URL of `/todos?chrome=none`
 * has to keep the chrome hidden on `/todos/abc` too — and `?chrome=full`
 * is the way back. Per-app home-screen manifests launch with `?chrome=none`
 * (see `shared/pwa/appManifest.ts`).
 *
 * This module is DOM-free at module level so the server can import it for
 * the manifest; `useChromeless.ts` holds the React hook.
 */

export const CHROME_PARAM = 'chrome';
export const CHROME_NONE = 'none';
export const CHROME_FULL = 'full';

export type ChromeMode = typeof CHROME_NONE | typeof CHROME_FULL;

/** The explicit chrome mode a query string asks for, if any. */
export function chromeModeFromSearch(search: string): ChromeMode | null {
  const value = new URLSearchParams(search).get(CHROME_PARAM);
  if (value === CHROME_NONE || value === CHROME_FULL) return value;
  return null;
}

/** `path` with `?chrome=none` added (keeping any existing query string). */
export function chromelessUrl(path: string): string {
  const [base, hash = ''] = path.split('#', 2);
  const [pathname, query = ''] = base.split('?', 2);
  const params = new URLSearchParams(query);
  params.set(CHROME_PARAM, CHROME_NONE);
  return `${pathname}?${params.toString()}${hash ? `#${hash}` : ''}`;
}

const STORAGE_KEY = 'homestead:chromeless';

export function readChromeless(): boolean {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeChromeless(value: boolean): void {
  try {
    if (value) window.sessionStorage.setItem(STORAGE_KEY, '1');
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable (privacy mode): the mode only lasts for the current
    // render, and comes back on the next load that carries the parameter.
  }
}
