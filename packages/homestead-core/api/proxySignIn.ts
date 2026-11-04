/**
 * Sign-in proxies.
 *
 * An instance can sit behind a proxy that signs people in before anything
 * reaches the server — Cloudflare Access is the one Homestead documents
 * (`guides/ai.md`). The proxy keeps a browser session of its own, apart from
 * Homestead's, and once that session lapses it answers every request itself:
 * a page load gets a redirect to its sign-in page, while a `fetch` gets a 401
 * with `{"error":"invalid_token"}` and a `WWW-Authenticate` challenge naming
 * its protected-resource metadata. Nothing the SPA sends can satisfy that 401,
 * and it says nothing about Homestead's own session; only a page navigation
 * reaches the sign-in page and comes back with a new proxy session. So the
 * client recognises the challenge, keeps the session it holds, and navigates —
 * once — instead of showing "invalid_token" or signing the person out.
 */

/** What Cloudflare Access names its protected-resource metadata after. */
const CHALLENGE_MARKER = 'cloudflare-access-protected-resource';

const RELOAD_KEY = 'homestead:proxy-sign-in-reload';
/** One reload per tab per minute: a reload that lands on the same challenge
 *  (an older worker still serving the cached shell) shows the error instead. */
const RELOAD_COOLDOWN_MS = 60_000;

export const PROXY_SIGN_IN_MESSAGE =
  'Your sign-in with the access proxy has expired — reload the page to sign in again.';

/** A request the sign-in proxy turned away; the server never saw it. */
export class ProxySignInError extends Error {
  readonly url: string;

  constructor(url: string) {
    super(PROXY_SIGN_IN_MESSAGE);
    this.name = 'ProxySignInError';
    this.url = url;
  }
}

/**
 * Whether `res` is the proxy's challenge rather than the server's 401. Pass
 * the parsed JSON body when the caller has already read it; the header alone
 * is enough otherwise.
 */
export function isProxySignInChallenge(res: Response, body?: unknown): boolean {
  if (res.status !== 401) return false;
  if ((res.headers.get('www-authenticate') ?? '').includes(CHALLENGE_MARKER)) return true;
  const metadata = (body as { resource_metadata?: unknown } | null | undefined)?.resource_metadata;
  return typeof metadata === 'string' && metadata.includes(CHALLENGE_MARKER);
}

export interface ReloadOptions {
  now?: number;
  reload?: () => void;
}

/**
 * Navigate to the current address so the proxy can sign the person in: the
 * service worker hands a navigation's redirect back to the browser, which
 * follows it to the proxy's sign-in page and from there back here. Returns
 * whether a reload was started (see {@link RELOAD_COOLDOWN_MS}).
 */
export function reloadForProxySignIn(options: ReloadOptions = {}): boolean {
  if (typeof window === 'undefined') return false;
  const now = options.now ?? Date.now();
  const reload = options.reload ?? (() => window.location.reload());
  let last = 0;
  try {
    last = Number(window.sessionStorage.getItem(RELOAD_KEY)) || 0;
  } catch {
    // No session storage (private mode, a sandboxed frame): reload anyway.
  }
  if (now - last < RELOAD_COOLDOWN_MS) return false;
  try {
    window.sessionStorage.setItem(RELOAD_KEY, String(now));
  } catch {
    // Same; the cooldown just doesn't survive without it.
  }
  reload();
  return true;
}
