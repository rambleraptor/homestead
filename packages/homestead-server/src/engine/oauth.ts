/**
 * OAuth login — port of pkg/oauth + the old AEPBASE_OAUTH env wiring. Config
 * now arrives as a plain object (the `auth.oauth` block of
 * homestead.config.ts) instead of a serialized env var.
 *
 * Flow: GET /oauth/{name}/start sets a CSRF state cookie and redirects to the
 * provider; GET /oauth/{name}/callback verifies state, exchanges the code,
 * fetches userinfo, links/creates the local user (_oauth_identities), mints a
 * bearer token, and redirects to the success URL with `#token=...` in the
 * fragment (so it never lands in access logs).
 */

import { createHash } from 'node:crypto';
import type { Database } from './sqlite';
import { errorResponse, jsonResponse } from './errors';
import { generateId, generateToken, nowRFC3339 } from './ids';
import type { User } from './types';
import { TYPE_REGULAR } from './types';
import { getUserByEmail, getUserById, insertToken, insertUser } from './users';

/** One provider entry in homestead.config.ts `auth.oauth.providers`. */
export interface OAuthProviderConfig {
  name: string;
  displayName?: string;
  clientId: string;
  clientSecret: string;
  scopes?: string[];
  authUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  allowRegistration?: boolean;
  /**
   * Trust this provider's emails when its userinfo response omits an
   * `email_verified` claim. Default false: a provider that neither verifies the
   * address nor asserts `email_verified` cannot auto-link to or create a
   * Homestead account (the account-takeover guard in `findOrCreateUser`). Set
   * true only for a provider you trust to hand back addresses it owns but that
   * doesn't send the claim (e.g. GitHub). A provider that *does* send
   * `email_verified` is always honored as-is, regardless of this flag.
   */
  trustEmailVerified?: boolean;
}

/** The `auth.oauth` block of homestead.config.ts. */
export interface OAuthConfig {
  redirectBaseUrl: string;
  successRedirect: string;
  providers: OAuthProviderConfig[];
}

/**
 * Mints a login session for a user. Injected by the server so federated logins
 * flow through the auth service (access + refresh tokens with expiry) instead
 * of a bare, non-expiring token. Returns null-ish only if the caller doesn't
 * provide one, in which case the callback falls back to a plain token.
 */
export type SessionIssuer = (userId: string) => {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};

/** A fully-resolved provider (redirect URLs composed, validated). */
export interface Provider {
  name: string;
  displayName: string;
  clientId: string;
  clientSecret: string;
  scopes: string[];
  authUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  redirectUrl: string;
  successRedirectUrl: string;
  allowRegistration: boolean;
  trustEmailVerified: boolean;
}

/** Invalid bcrypt hash: password login always fails for OAuth-only users. */
const NO_PASSWORD_SENTINEL = '!';

const STATE_COOKIE = 'aepbase_oauth_state';

/**
 * Cookie `Path` for the CSRF state cookie: the directory of the provider's
 * callback URL. Derived from `redirectUrl` (which carries the full mount
 * prefix, e.g. `/api/aep/oauth/google/callback`) so the cookie the `/start`
 * response sets is actually sent back on `/callback`. A hardcoded path breaks
 * whenever the engine is mounted under a prefix.
 */
function stateCookiePath(p: Provider): string {
  const { pathname } = new URL(p.redirectUrl);
  return pathname.slice(0, pathname.lastIndexOf('/') + 1);
}

/**
 * Build validated providers from config. Pure — unit-testable without a
 * server. Returns [] when config is absent or has no providers.
 */
export function buildProviders(cfg: OAuthConfig | null | undefined): Provider[] {
  if (!cfg || !cfg.providers || cfg.providers.length === 0) return [];
  if (!cfg.redirectBaseUrl) {
    throw new Error('redirectBaseUrl is required when providers are set');
  }
  if (!cfg.successRedirect) {
    throw new Error('successRedirect is required when providers are set');
  }
  const base = cfg.redirectBaseUrl.replace(/\/+$/, '');

  return cfg.providers.map((p) => {
    if (!p.name) throw new Error('oauth provider missing name');
    if (!p.clientId || !p.clientSecret) {
      throw new Error(`oauth provider "${p.name}": clientId and clientSecret are required`);
    }
    if (!p.authUrl || !p.tokenUrl || !p.userInfoUrl) {
      throw new Error(
        `oauth provider "${p.name}": authUrl, tokenUrl, and userInfoUrl are required`,
      );
    }
    return {
      name: p.name,
      displayName: p.displayName || p.name,
      clientId: p.clientId,
      clientSecret: p.clientSecret,
      scopes: p.scopes ?? [],
      authUrl: p.authUrl,
      tokenUrl: p.tokenUrl,
      userInfoUrl: p.userInfoUrl,
      redirectUrl: `${base}/oauth/${p.name}/callback`,
      successRedirectUrl: cfg.successRedirect,
      allowRegistration: p.allowRegistration ?? false,
      trustEmailVerified: p.trustEmailVerified ?? false,
    };
  });
}

export function createOAuthIdentitiesTable(db: Database): void {
  db.run(`CREATE TABLE IF NOT EXISTS _oauth_identities (
		provider TEXT NOT NULL,
		provider_user_id TEXT NOT NULL,
		user_id TEXT NOT NULL,
		email TEXT NOT NULL,
		create_time TEXT NOT NULL,
		PRIMARY KEY (provider, provider_user_id)
	)`);
}

function getIdentity(
  db: Database,
  provider: string,
  providerUserId: string,
): { user_id: string } | null {
  return db
    .query('SELECT user_id FROM _oauth_identities WHERE provider = ? AND provider_user_id = ?')
    .get(provider, providerUserId) as { user_id: string } | null;
}

function insertIdentity(
  db: Database,
  i: { provider: string; providerUserId: string; userId: string; email: string },
): void {
  db.query(
    'INSERT INTO _oauth_identities (provider, provider_user_id, user_id, email, create_time) VALUES (?, ?, ?, ?, ?)',
  ).run(i.provider, i.providerUserId, i.userId, i.email, nowRFC3339());
}

function parseCookies(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  const header = req.headers.get('cookie');
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    out[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
  }
  return out;
}

interface UserInfo {
  sub: string;
  email: string;
  name: string;
  /**
   * Whether the email may be trusted as belonging to the person signing in.
   * Resolved from the provider's `email_verified` claim when present; when the
   * claim is absent, falls back to the provider's `trustEmailVerified` config.
   */
  emailVerified: boolean;
}

async function exchangeCode(p: Provider, code: string, request: typeof fetch = fetch): Promise<string> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: p.redirectUrl,
    client_id: p.clientId,
    client_secret: p.clientSecret,
  });
  const resp = await request(p.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
  });
  const text = await resp.text();
  if (resp.status >= 400) {
    throw new Error(`token endpoint ${resp.status}: ${text}`);
  }
  let parsed: { access_token?: string };
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`decoding token response: ${err instanceof Error ? err.message : err}`);
  }
  if (!parsed.access_token) throw new Error('no access_token in response');
  return parsed.access_token;
}

async function fetchUserInfo(p: Provider, accessToken: string, request: typeof fetch = fetch): Promise<UserInfo> {
  const resp = await request(p.userInfoUrl, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  const text = await resp.text();
  if (resp.status >= 400) {
    throw new Error(`userinfo endpoint ${resp.status}: ${text}`);
  }
  const raw = JSON.parse(text) as Record<string, unknown>;
  let sub = typeof raw.sub === 'string' ? raw.sub : '';
  // Some providers (e.g. GitHub) return "id" instead of "sub".
  if (!sub && raw.id !== undefined && raw.id !== null) sub = String(raw.id);
  // Honor an explicit `email_verified` claim (OIDC boolean; some providers send
  // the string "true"). When the provider omits it, defer to config: trusted
  // providers pass, everyone else is treated as unverified.
  const claim = raw.email_verified;
  const emailVerified =
    claim === undefined || claim === null
      ? p.trustEmailVerified
      : claim === true || claim === 'true';
  return {
    sub,
    email: typeof raw.email === 'string' ? raw.email : '',
    name: typeof raw.name === 'string' ? raw.name : '',
    emailVerified,
  };
}

class RegistrationDisabledError extends Error {}

/** The provider hasn't verified the email, so we won't link or create by it. */
class UnverifiedEmailLinkError extends Error {}

function findOrCreateUser(db: Database, p: Provider, info: UserInfo): User {
  const ident = getIdentity(db, p.name, info.sub);
  if (ident) {
    // Already linked: the identity, not the email, is the key here — safe.
    const found = getUserById(db, ident.user_id);
    if (!found) throw new Error(`identity references missing user "${ident.user_id}"`);
    return found.user;
  }

  const existing = getUserByEmail(db, info.email);
  if (existing) {
    // Auto-linking a new provider identity to a pre-existing account purely on
    // an email match is an account-takeover vector when the email is
    // unverified: anyone who can set the victim's address on a provider account
    // would be dropped straight into the victim's account. Only link a verified
    // email.
    if (!info.emailVerified) throw new UnverifiedEmailLinkError();
    insertIdentity(db, {
      provider: p.name,
      providerUserId: info.sub,
      userId: existing.user.id,
      email: info.email,
    });
    return existing.user;
  }

  if (!p.allowRegistration) throw new RegistrationDisabledError();
  // Don't mint a fresh account from an unverified address either — it may not
  // belong to the person signing in, and it would later become the link target
  // for the real owner.
  if (!info.emailVerified) throw new UnverifiedEmailLinkError();

  const id = generateId();
  const now = nowRFC3339();
  const u: User = {
    id,
    path: `users/${id}`,
    email: info.email,
    display_name: info.name,
    type: TYPE_REGULAR,
    create_time: now,
    update_time: now,
  };
  insertUser(db, u, NO_PASSWORD_SENTINEL);
  insertIdentity(db, {
    provider: p.name,
    providerUserId: info.sub,
    userId: id,
    email: info.email,
  });
  return u;
}

export class OAuthRoutes {
  constructor(
    private db: Database,
    private providers: Map<string, Provider>,
    private providerFetch?: typeof fetch,
  ) {
    // Native OAuth returns a short-lived, one-use code, never session tokens in a URL.
    db.run(`CREATE TABLE IF NOT EXISTS _oauth_native_flows (
      state TEXT PRIMARY KEY, provider TEXT NOT NULL, challenge TEXT NOT NULL,
      app_state TEXT NOT NULL, expires_at INTEGER NOT NULL
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS _oauth_native_codes (
      code_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, challenge TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    )`);
  }

  static fromConfig(db: Database, cfg: OAuthConfig | null | undefined, providerFetch?: typeof fetch): OAuthRoutes | null {
    const providers = buildProviders(cfg);
    if (providers.length === 0) return null;
    createOAuthIdentitiesTable(db);
    return new OAuthRoutes(db, new Map(providers.map((p) => [p.name, p])), providerFetch);
  }

  /** Dispatch /oauth/* paths; returns null for unmatched shapes. */
  async handle(
    req: Request,
    segments: string[],
    issuer?: SessionIssuer | null,
  ): Promise<Response | null> {
    if (req.method === 'POST' && segments.length === 3 && segments[1] === 'native' && segments[2] === 'exchange') {
      return this.exchangeNative(req, issuer);
    }
    if (req.method !== 'GET') return null;
    if (segments.length === 2 && segments[1] === 'providers') return this.listProviders();
    if (segments.length === 3) {
      const name = decodeURIComponent(segments[1]!);
      if (segments[2] === 'start') return this.start(req, name);
      if (segments[2] === 'callback') return this.callback(req, name, issuer);
    }
    return null;
  }

  private listProviders(): Response {
    const names = [...this.providers.keys()].sort();
    return jsonResponse({
      providers: names.map((n) => {
        const p = this.providers.get(n)!;
        return { name: p.name, display_name: p.displayName };
      }),
    });
  }

  private start(req: Request, name: string): Response {
    const provider = this.providers.get(name);
    if (!provider) return errorResponse(404, `unknown provider "${name}"`);

    const state = generateToken();
    const startURL = new URL(req.url);
    const challenge = startURL.searchParams.get('native_challenge');
    const appState = startURL.searchParams.get('native_state');
    if (challenge !== null || appState !== null) {
      if (!challenge || !/^[A-Za-z0-9_-]{43}$/.test(challenge)
          || !appState || !/^[A-Za-z0-9_-]{43,128}$/.test(appState)) {
        return errorResponse(400, 'invalid native OAuth challenge or state');
      }
      const now = Date.now();
      this.db.query('DELETE FROM _oauth_native_flows WHERE expires_at < ?').run(now);
      this.db.query('DELETE FROM _oauth_native_codes WHERE expires_at < ?').run(now);
      this.db.query('INSERT INTO _oauth_native_flows (state, provider, challenge, app_state, expires_at) VALUES (?, ?, ?, ?, ?)')
        .run(state, name, challenge, appState, now + 600_000);
    }
    const params = new URLSearchParams({
      client_id: provider.clientId,
      redirect_uri: provider.redirectUrl,
      response_type: 'code',
    });
    if (provider.scopes.length > 0) params.set('scope', provider.scopes.join(' '));
    params.set('state', state);

    const secure = new URL(req.url).protocol === 'https:' ? '; Secure' : '';
    return new Response(null, {
      status: 302,
      headers: {
        Location: `${provider.authUrl}?${params.toString()}`,
        'Set-Cookie': `${STATE_COOKIE}=${state}; Path=${stateCookiePath(provider)}; Max-Age=600; HttpOnly; SameSite=Lax${secure}`,
      },
    });
  }

  private async callback(
    req: Request,
    name: string,
    issuer?: SessionIssuer | null,
  ): Promise<Response> {
    const provider = this.providers.get(name);
    if (!provider) return errorResponse(404, `unknown provider "${name}"`);

    const url = new URL(req.url);
    const errParam = url.searchParams.get('error');
    if (errParam) {
      const desc = url.searchParams.get('error_description') ?? '';
      return errorResponse(400, `provider returned error: ${errParam}: ${desc}`);
    }

    const code = url.searchParams.get('code');
    if (!code) return errorResponse(400, 'missing code parameter');

    const cookieState = parseCookies(req)[STATE_COOKIE];
    if (!cookieState) {
      return errorResponse(
        400,
        'missing oauth state cookie; start the flow at /oauth/{provider}/start',
      );
    }
    const queryState = url.searchParams.get('state');
    if (!queryState || queryState !== cookieState) {
      return errorResponse(400, 'oauth state mismatch');
    }

    let accessToken: string;
    try {
      accessToken = await exchangeCode(provider, code, this.providerFetch);
    } catch (err) {
      return errorResponse(502, `code exchange failed: ${err instanceof Error ? err.message : err}`);
    }

    let info: UserInfo;
    try {
      info = await fetchUserInfo(provider, accessToken, this.providerFetch);
    } catch (err) {
      return errorResponse(502, `userinfo fetch failed: ${err instanceof Error ? err.message : err}`);
    }
    if (!info.sub || !info.email) {
      return errorResponse(502, 'provider userinfo missing required fields (sub, email)');
    }

    let user: User;
    try {
      user = findOrCreateUser(this.db, provider, info);
    } catch (err) {
      if (err instanceof RegistrationDisabledError) {
        return errorResponse(
          403,
          'registration is not enabled for this provider; the email is not linked to an existing account',
        );
      }
      if (err instanceof UnverifiedEmailLinkError) {
        return errorResponse(
          403,
          "the provider did not verify this account's email address, so it cannot be linked to a Homestead account",
        );
      }
      return errorResponse(500, `user lookup failed: ${err instanceof Error ? err.message : err}`);
    }

    const native = this.db.query(
      'DELETE FROM _oauth_native_flows WHERE state = ? AND provider = ? RETURNING challenge, app_state, expires_at',
    ).get(cookieState, name) as { challenge: string; app_state: string; expires_at: number } | null;
    if (native) {
      if (native.expires_at <= Date.now()) return errorResponse(400, 'native OAuth flow expired');
      if (!issuer) return errorResponse(503, 'native OAuth requires session authentication');
      const handoff = generateToken();
      this.db.query('INSERT INTO _oauth_native_codes (code_hash, user_id, challenge, expires_at) VALUES (?, ?, ?, ?)')
        .run(createHash('sha256').update(handoff).digest('hex'), user.id, native.challenge, Date.now() + 60_000);
      const query = new URLSearchParams({ code: handoff, state: native.app_state });
      return new Response(null, { status: 302, headers: {
        Location: `homestead://oauth?${query}`,
        'Set-Cookie': `${STATE_COOKIE}=; Path=${stateCookiePath(provider)}; Max-Age=0; HttpOnly; SameSite=Lax; Secure`,
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
      } });
    }

    // Prefer a full session (access + refresh) via the injected issuer so
    // federated users get token expiry + refresh. Fall back to a bare,
    // non-expiring token when no issuer is wired. The success page reads the
    // fragment (never logged / never sent in Referer).
    const fragment = new URLSearchParams();
    if (issuer) {
      const session = issuer(user.id);
      fragment.set('access_token', session.access_token);
      fragment.set('refresh_token', session.refresh_token);
      fragment.set('expires_in', String(session.expires_in));
      // Keep `token` as an alias so older SPA builds still authenticate.
      fragment.set('token', session.access_token);
    } else {
      const token = generateToken();
      insertToken(this.db, token, user.id);
      fragment.set('token', token);
    }
    return new Response(null, {
      status: 302,
      headers: {
        Location: `${provider.successRedirectUrl}#${fragment.toString()}`,
        // Clear the state cookie.
        'Set-Cookie': `${STATE_COOKIE}=; Path=${stateCookiePath(provider)}; Max-Age=0`,
      },
    });
  }
  private async exchangeNative(req: Request, issuer?: SessionIssuer | null): Promise<Response> {
    if (!issuer) return errorResponse(503, 'native OAuth requires session authentication');
    const body = await req.json().catch(() => null) as { code?: unknown; verifier?: unknown } | null;
    if (typeof body?.code !== 'string' || body.code.length > 256 || !body.code
        || typeof body.verifier !== 'string' || !/^[A-Za-z0-9_-]{43,128}$/.test(body.verifier)) {
      return errorResponse(400, 'invalid native OAuth exchange');
    }
    const challenge = createHash('sha256').update(body.verifier).digest('base64url');
    // Atomic consume only after proof verification; invalid proofs do not burn the code.
    const grant = this.db.query(
      'DELETE FROM _oauth_native_codes WHERE code_hash = ? AND challenge = ? AND expires_at > ? RETURNING user_id',
    ).get(createHash('sha256').update(body.code).digest('hex'), challenge, Date.now()) as { user_id: string } | null;
    if (!grant) return errorResponse(400, 'native OAuth code expired, used, or invalid');
    if (!getUserById(this.db, grant.user_id)) return errorResponse(401, 'account no longer exists');
    return new Response(JSON.stringify(issuer(grant.user_id)), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }

}
