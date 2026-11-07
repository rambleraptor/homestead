/**
 * Which `redirect_uri`s an OAuth client may register with Homestead's
 * authorization server — shared by the server (registration and `/authorize`)
 * and the SPA consent page (right before it navigates), so both apply one rule.
 *
 * The consent page hands control back to the client with
 * `window.location.href = redirect`, on the Homestead origin, where the
 * session token lives. A `javascript:` (or `data:`, …) address would run as
 * Homestead and could read that token, so those schemes are never allowed,
 * whoever registered the client.
 *
 * Allowed (OAuth 2.1 §2.3.1 / RFC 8252):
 *  - `https:` with a host;
 *  - `http:` only on a loopback host (a native app's local listener);
 *  - a private-use scheme (`com.example.app:/cb`, `vscode://…`) for native
 *    apps — navigating to one only asks the OS to open that app.
 * Never a fragment (RFC 6749 §3.1.2).
 */

/** Schemes a browser handles itself rather than handing to another app. */
const BROWSER_SCHEMES = new Set([
  'javascript:',
  'data:',
  'vbscript:',
  'blob:',
  'file:',
  'filesystem:',
  'about:',
  'view-source:',
  'ws:',
  'wss:',
  'ftp:',
]);

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Why `uri` can't be a redirect URI, or null when it can. */
export function redirectUriProblem(uri: string): string | null {
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return 'not a valid URI';
  }
  if (uri.includes('#')) return 'must not contain a fragment';
  const scheme = u.protocol.toLowerCase();
  if (scheme === 'https:') return u.hostname ? null : 'must include a host';
  if (scheme === 'http:') {
    return LOOPBACK_HOSTS.has(u.hostname.toLowerCase())
      ? null
      : 'http is only allowed on a loopback host (localhost, 127.0.0.1, [::1]); use https';
  }
  if (BROWSER_SCHEMES.has(scheme)) return `the ${scheme} scheme is not allowed`;
  return null;
}

/** True when `uri` is an acceptable redirect URI (see {@link redirectUriProblem}). */
export function isAllowedRedirectUri(uri: string): boolean {
  return redirectUriProblem(uri) === null;
}
