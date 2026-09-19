/**
 * Where to land after an OAuth sign-in.
 *
 * A password login navigates to the `returnUrl` the auth guard put in the
 * login page's query string. An OAuth login leaves the site for the provider
 * and comes back on `/auth/callback`, which has no way to see that query
 * string — so the login page parks the return path in `sessionStorage` before
 * redirecting out, and the callback page picks it up. Without this, an app
 * installed to the home screen (launch URL `/todos`) that needs a sign-in
 * ends up on the dashboard.
 */

const KEY = 'homestead:oauth-return-url';

/** Only same-origin absolute paths are honored; anything else is dropped. */
export function isSafeReturnPath(path: string | null | undefined): path is string {
  return typeof path === 'string' && path.startsWith('/') && !path.startsWith('//');
}

export function rememberOAuthReturnUrl(path: string): void {
  if (!isSafeReturnPath(path)) return;
  try {
    window.sessionStorage.setItem(KEY, path);
  } catch {
    // Storage unavailable (private mode, blocked) — the callback falls back
    // to the dashboard.
  }
}

/** Read and clear the parked return path; null when none was parked. */
export function takeOAuthReturnUrl(): string | null {
  try {
    const value = window.sessionStorage.getItem(KEY);
    window.sessionStorage.removeItem(KEY);
    return isSafeReturnPath(value) ? value : null;
  } catch {
    return null;
  }
}
