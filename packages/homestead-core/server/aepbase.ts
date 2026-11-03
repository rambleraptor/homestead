/**
 * Server-side request-authentication seam.
 *
 * Server routes resolve the caller from a forwarded `Authorization: Bearer`
 * header via the engine's `/users/me` whoami. CRUD against the engine now goes
 * through the shared client library (`./client`'s `serverClient(token)`); this
 * module keeps only the pieces that operate on a raw Web `Request` — the token→
 * user resolver and the low-level fetch it's built on — plus the engine base URL
 * the client is pointed at.
 *
 * Runtime-agnostic: takes a Web `Request`, so it works under Next, Bun,
 * and any Fetch-based server.
 */

/**
 * Base URL of the running engine, including the `/api/aep` prefix. The server
 * sets `AEPBASE_URL` at boot to `http://127.0.0.1:<port>/api/aep`; the default
 * here is the standalone fallback. Helper call sites pass bare engine paths
 * (`/users/me`, `/gift-cards`) that hang off this base.
 */
export const AEPBASE_URL =
  process.env.AEPBASE_URL || 'http://127.0.0.1:3000/api/aep';

export interface AuthedUser {
  id: string;
  path: string;
  email: string;
  display_name?: string;
  type?: string;
}

export interface AuthResult {
  token: string;
  user: AuthedUser;
}

/**
 * Authenticate a request from the frontend.
 *
 * The client sends an `Authorization: Bearer <token>` header. We resolve
 * the token-holder server-side via the engine's `GET /users/me` whoami,
 * which returns 200 only for a valid token. This deliberately does *not*
 * trust the client-supplied `X-User-Id` header: that header is empty
 * whenever the browser holds a valid token but its in-memory auth model
 * isn't populated (e.g. localStorage has the token but the user object is
 * missing/stale), which previously yielded a spurious 401 even though the
 * same token works for direct engine CRUD.
 */
export async function authenticate(request: Request): Promise<AuthResult | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return null;
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;

  try {
    const res = await aepbaseFetch('/users/me', { token });
    if (!res.ok) return null;
    const user = (await res.json()) as AuthedUser;
    return { token, user };
  } catch {
    return null;
  }
}

interface FetchOptions {
  token: string;
  method?: string;
  body?: unknown;
  mergePatch?: boolean;
}

/**
 * Low-level fetch against aepbase with a given Bearer token. Backs
 * {@link authenticate}'s whoami and is available to server routes that need
 * direct control over method + path (ordinary CRUD should use `serverClient`).
 */
export async function aepbaseFetch(
  path: string,
  { token, method = 'GET', body, mergePatch }: FetchOptions,
): Promise<Response> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  let payload: BodyInit | undefined;
  if (body instanceof FormData) {
    // Multipart (files): the runtime sets the boundary.
    payload = body;
  } else if (body !== undefined) {
    headers['Content-Type'] = mergePatch
      ? 'application/merge-patch+json'
      : 'application/json';
    payload = JSON.stringify(body);
  }
  return fetch(`${AEPBASE_URL}${path}`, { method, headers, body: payload });
}
