/**
 * OAuth 2.1 Authorization Server endpoints, mounted at `/oauth2`:
 *   POST /register            — Dynamic Client Registration (RFC 7591)
 *   GET  /authorize           — validate the request, then hand off to the SPA
 *                               consent page (so login/consent reuse the SPA's
 *                               session and federated buttons)
 *   GET  /authorize/info      — consent-page data for a stashed request
 *   POST /authorize/decision  — the SPA posts the user's approve/deny here
 *   POST /token               — authorization_code + refresh_token grants
 *
 * PKCE (S256) is mandatory, redirect_uris are matched exactly, codes are
 * single-use and short-lived, and `resource` (RFC 8707) is recorded so issued
 * tokens are audience-bound. All token minting goes through the auth service.
 */

import { Hono } from 'hono';
import type { AuthServerConfig } from '@rambleraptor/homestead-core/apps/config';
import { redirectUriProblem } from '@rambleraptor/homestead-core/auth/redirectUri';
import type { Database } from '../../engine/sqlite';
import { generateToken } from '../../engine/ids';
import { extractBearerToken } from '../../engine/users';
import type { AuthService } from '../service';
import { expiryFromNow, isExpired } from '../tokens';
import { verifyChallenge } from './pkce';
import {
  consumeAuthCode,
  deleteAuthRequest,
  getAuthRequest,
  getClient,
  insertAuthCode,
  insertAuthRequest,
  insertClient,
} from './storage';

/** Consent-handle lifetime: how long the user has to approve on the SPA page. */
const AUTH_REQUEST_TTL_SECONDS = 600;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
} as const;

function oauthError(status: number, error: string, description?: string): Response {
  return new Response(
    JSON.stringify({ error, ...(description ? { error_description: description } : {}) }),
    { status, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
  );
}

function errorPage(message: string): Response {
  const body = `<!doctype html><meta charset="utf-8"><title>Authorization error</title>
<body style="font-family:system-ui;max-width:32rem;margin:4rem auto;padding:0 1rem">
<h1>Authorization error</h1><p>${message.replace(/[<>&]/g, '')}</p></body>`;
  return new Response(body, { status: 400, headers: { 'Content-Type': 'text/html' } });
}

function redirectWith(base: string, params: Record<string, string | null | undefined>): string {
  const u = new URL(base);
  for (const [k, v] of Object.entries(params)) {
    if (v) u.searchParams.set(k, v);
  }
  return u.toString();
}

/**
 * A 302 with a manual Location header. Unlike `Response.redirect`, this accepts
 * a relative URL (needed for the same-origin `/authorize` SPA hand-off, which
 * Response.redirect rejects as an invalid URL under Node/undici and Bun).
 */
function redirectResponse(location: string): Response {
  return new Response(null, { status: 302, headers: { Location: location } });
}

function parseBasicAuth(header: string | null): { id: string; secret: string } | null {
  if (!header || !/^Basic /i.test(header)) return null;
  try {
    const decoded = atob(header.replace(/^Basic /i, '').trim());
    const i = decoded.indexOf(':');
    if (i < 0) return null;
    return { id: decoded.slice(0, i), secret: decoded.slice(i + 1) };
  } catch {
    return null;
  }
}

export function makeOAuthServerRoutes(
  db: Database,
  auth: AuthService,
  cfg: AuthServerConfig,
): Hono {
  const app = new Hono();
  const authCodeTtl = cfg.authCodeTtlSeconds ?? 60;

  app.options('/*', () => new Response(null, { status: 204, headers: CORS_HEADERS }));

  // --- Dynamic Client Registration (RFC 7591) ---
  app.post('/register', async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      redirect_uris?: unknown;
      client_name?: unknown;
      token_endpoint_auth_method?: unknown;
      grant_types?: unknown;
    } | null;
    const redirectUris = Array.isArray(body?.redirect_uris)
      ? (body!.redirect_uris as unknown[]).filter((u): u is string => typeof u === 'string')
      : [];
    if (redirectUris.length === 0) {
      return oauthError(400, 'invalid_redirect_uri', 'at least one redirect_uri is required');
    }
    for (const uri of redirectUris) {
      const problem = redirectUriProblem(uri);
      if (problem) return oauthError(400, 'invalid_redirect_uri', `${uri}: ${problem}`);
    }
    const authMethod =
      body?.token_endpoint_auth_method === 'client_secret_basic' ||
      body?.token_endpoint_auth_method === 'client_secret_post'
        ? body.token_endpoint_auth_method
        : 'none';
    const grantTypes = Array.isArray(body?.grant_types)
      ? (body!.grant_types as unknown[]).filter((g): g is string => typeof g === 'string')
      : ['authorization_code', 'refresh_token'];

    const clientId = generateToken();
    // Public (PKCE) clients get no secret; confidential clients do.
    const clientSecret = authMethod === 'none' ? null : generateToken();
    insertClient(db, {
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uris: redirectUris,
      client_name: typeof body?.client_name === 'string' ? body.client_name : null,
      token_endpoint_auth_method: authMethod,
      grant_types: grantTypes,
    });

    return new Response(
      JSON.stringify({
        client_id: clientId,
        ...(clientSecret ? { client_secret: clientSecret } : {}),
        redirect_uris: redirectUris,
        token_endpoint_auth_method: authMethod,
        grant_types: grantTypes,
        ...(typeof body?.client_name === 'string' ? { client_name: body.client_name } : {}),
      }),
      { status: 201, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
    );
  });

  // --- Authorization endpoint: validate, stash, hand off to the SPA ---
  app.get('/authorize', (c) => {
    const q = new URL(c.req.url).searchParams;
    const clientId = q.get('client_id') ?? '';
    const redirectUri = q.get('redirect_uri') ?? '';

    // Client + redirect_uri errors must NOT redirect (anti open-redirect):
    // render an error page instead.
    const client = clientId ? getClient(db, clientId) : null;
    if (!client) return errorPage('Unknown or missing client_id.');
    if (!redirectUri || !client.redirect_uris.includes(redirectUri)) {
      return errorPage('The redirect_uri does not match a registered value for this client.');
    }
    // Re-checked here, not only at registration: a client registered before the
    // rule existed may hold an address the consent page must never navigate to.
    if (redirectUriProblem(redirectUri)) {
      return errorPage('This client registered a redirect_uri that is not allowed.');
    }

    const state = q.get('state');
    // Beyond here the redirect_uri is trusted, so protocol errors go back to it.
    if (q.get('response_type') !== 'code') {
      return redirectResponse(
        redirectWith(redirectUri, { error: 'unsupported_response_type', state }),
      );
    }
    const codeChallenge = q.get('code_challenge');
    if (!codeChallenge || q.get('code_challenge_method') !== 'S256') {
      return redirectResponse(
        redirectWith(redirectUri, {
          error: 'invalid_request',
          error_description: 'PKCE with S256 is required',
          state,
        }),
      );
    }

    const requestId = generateToken();
    insertAuthRequest(db, {
      request_id: requestId,
      client_id: clientId,
      redirect_uri: redirectUri,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
      resource: q.get('resource'),
      scope: q.get('scope'),
      expires_at: expiryFromNow(AUTH_REQUEST_TTL_SECONDS),
    });

    // Hand off to the SPA consent page (same origin). It authenticates the
    // user (session or login, incl. federated) and posts the decision back.
    return redirectResponse(`/authorize?request=${encodeURIComponent(requestId)}`);
  });

  // --- Consent-page data for a stashed request (public) ---
  app.get('/authorize/info', (c) => {
    const requestId = new URL(c.req.url).searchParams.get('request') ?? '';
    const reqRow = requestId ? getAuthRequest(db, requestId) : null;
    if (!reqRow || isExpired(reqRow.expires_at)) {
      return c.json({ error: 'invalid_or_expired_request' }, 404);
    }
    const client = getClient(db, reqRow.client_id);
    return c.json({
      client_id: reqRow.client_id,
      client_name: client?.client_name ?? null,
      scope: reqRow.scope,
      scopes: reqRow.scope ? reqRow.scope.split(/\s+/).filter(Boolean) : [],
    });
  });

  // --- The SPA posts the user's approve/deny here (Bearer-authenticated) ---
  app.post('/authorize/decision', async (c) => {
    const caller = auth.validateAccessToken(extractBearerToken(c.req.raw));
    if (!caller) return c.json({ error: 'unauthorized' }, 401);

    const body = (await c.req.json().catch(() => null)) as {
      request?: string;
      approve?: boolean;
    } | null;
    const requestId = body?.request ?? '';
    const reqRow = requestId ? getAuthRequest(db, requestId) : null;
    if (!reqRow || isExpired(reqRow.expires_at)) {
      return c.json({ error: 'invalid_or_expired_request' }, 404);
    }
    // The handle is consumed either way — approve or deny.
    deleteAuthRequest(db, requestId);

    if (!body?.approve) {
      return c.json({
        redirect: redirectWith(reqRow.redirect_uri, {
          error: 'access_denied',
          state: reqRow.state,
        }),
      });
    }

    const code = generateToken();
    insertAuthCode(db, {
      code,
      client_id: reqRow.client_id,
      user_id: caller.id,
      redirect_uri: reqRow.redirect_uri,
      code_challenge: reqRow.code_challenge,
      code_challenge_method: reqRow.code_challenge_method,
      resource: reqRow.resource,
      scope: reqRow.scope,
      expires_at: expiryFromNow(authCodeTtl),
    });
    return c.json({
      redirect: redirectWith(reqRow.redirect_uri, { code, state: reqRow.state }),
    });
  });

  // --- Token endpoint ---
  app.post('/token', async (c) => {
    const form = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
    const grantType = String(form.grant_type ?? '');

    if (grantType === 'authorization_code') {
      return tokenAuthorizationCode(c, form);
    }
    if (grantType === 'refresh_token') {
      const refreshToken = String(form.refresh_token ?? '');
      if (!refreshToken) return oauthError(400, 'invalid_request', 'refresh_token is required');
      const session = auth.rotateRefresh(refreshToken);
      if (!session) return oauthError(400, 'invalid_grant', 'invalid or expired refresh token');
      return tokenResponse(session);
    }
    return oauthError(400, 'unsupported_grant_type', `unsupported grant_type "${grantType}"`);
  });

  function tokenResponse(session: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope: string | null;
  }): Response {
    return new Response(
      JSON.stringify({
        access_token: session.access_token,
        token_type: 'Bearer',
        expires_in: session.expires_in,
        refresh_token: session.refresh_token,
        ...(session.scope ? { scope: session.scope } : {}),
      }),
      { headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
    );
  }

  async function tokenAuthorizationCode(
    c: { req: { raw: Request } },
    form: Record<string, unknown>,
  ): Promise<Response> {
    const code = String(form.code ?? '');
    const redirectUri = String(form.redirect_uri ?? '');
    const codeVerifier = String(form.code_verifier ?? '');
    const basic = parseBasicAuth(c.req.raw.headers.get('authorization'));
    const clientId = basic?.id ?? String(form.client_id ?? '');
    const clientSecret = basic?.secret ?? (form.client_secret ? String(form.client_secret) : null);

    if (!code || !redirectUri || !clientId) {
      return oauthError(400, 'invalid_request', 'code, redirect_uri and client_id are required');
    }
    const client = getClient(db, clientId);
    if (!client) return oauthError(401, 'invalid_client', 'unknown client');
    if (client.token_endpoint_auth_method !== 'none') {
      if (!clientSecret || clientSecret !== client.client_secret) {
        return oauthError(401, 'invalid_client', 'client authentication failed');
      }
    }
    if (!codeVerifier) {
      return oauthError(400, 'invalid_request', 'code_verifier is required');
    }

    const row = consumeAuthCode(db, code);
    if (!row || isExpired(row.expires_at)) {
      return oauthError(400, 'invalid_grant', 'authorization code is invalid or expired');
    }
    if (row.client_id !== clientId || row.redirect_uri !== redirectUri) {
      return oauthError(400, 'invalid_grant', 'authorization code does not match this request');
    }
    if (!(await verifyChallenge(codeVerifier, row.code_challenge))) {
      return oauthError(400, 'invalid_grant', 'PKCE verification failed');
    }

    const session = auth.issueSession(row.user_id, {
      clientId,
      scope: row.scope,
      audience: row.resource,
    });
    return tokenResponse(session);
  }

  return app;
}
