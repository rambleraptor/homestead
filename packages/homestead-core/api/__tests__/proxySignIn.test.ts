/**
 * A sign-in proxy (Cloudflare Access) whose browser session has lapsed answers
 * the SPA's requests itself with a 401 `invalid_token` challenge. The client
 * must tell that apart from the server's own 401: keep Homestead's session,
 * reload (once) so the proxy can sign the person in, and never show
 * "invalid_token".
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isProxySignInChallenge,
  ProxySignInError,
  reloadForProxySignIn,
} from '../proxySignIn';

const actual = await vi.importActual<typeof import('../aepbase')>('../aepbase');

const METADATA =
  'https://homestead.example/.well-known/cloudflare-access-protected-resource/api/aep/users/me';

/** What Cloudflare Access sends a `fetch` with no (or a stale) Access cookie. */
function accessChallenge(): Response {
  return new Response(
    JSON.stringify({
      error: 'invalid_token',
      error_description: 'Missing or invalid access token',
      resource_metadata: METADATA,
    }),
    {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'WWW-Authenticate': `Bearer realm="OAuth", error="invalid_token", resource_metadata="${METADATA}"`,
      },
    },
  );
}

/** The engine's own 401 for a bad bearer token. */
function serverUnauthorized(): Response {
  return new Response(JSON.stringify({ error: { code: 401, message: 'invalid token' } }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('isProxySignInChallenge', () => {
  it('recognises the challenge by its WWW-Authenticate header', () => {
    expect(isProxySignInChallenge(accessChallenge())).toBe(true);
  });

  it('recognises the challenge by its body when the header is absent', () => {
    const res = new Response('{}', { status: 401 });
    expect(isProxySignInChallenge(res, { error: 'invalid_token', resource_metadata: METADATA })).toBe(
      true,
    );
  });

  it("leaves the server's own 401 alone", () => {
    expect(isProxySignInChallenge(serverUnauthorized())).toBe(false);
    expect(isProxySignInChallenge(serverUnauthorized(), { error: { code: 401 } })).toBe(false);
  });

  it('ignores other statuses even with the marker', () => {
    const res = new Response('', { status: 403, headers: { 'WWW-Authenticate': METADATA } });
    expect(isProxySignInChallenge(res)).toBe(false);
  });
});

describe('reloadForProxySignIn', () => {
  beforeEach(() => window.sessionStorage.clear());

  it('reloads, then holds off for a minute so a stale worker cannot loop', () => {
    const reload = vi.fn();
    expect(reloadForProxySignIn({ now: 100_000, reload })).toBe(true);
    expect(reloadForProxySignIn({ now: 130_000, reload })).toBe(false);
    expect(reloadForProxySignIn({ now: 160_001, reload })).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });
});

describe('aepbase under a proxy challenge', () => {
  const reloadSpy = vi.fn();

  beforeEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
    window.sessionStorage.clear();
    reloadSpy.mockReset();
    // happy-dom's location.reload is not configurable; route through a stub.
    vi.stubGlobal('location', { ...window.location, reload: reloadSpy });
    actual.authStore.saveSession(
      { accessToken: 'access', refreshToken: 'refresh', expiresIn: 3600 },
      { id: 'u1', email: 'me@example.com', name: 'Me' } as never,
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('a read throws ProxySignInError, keeps the session, and does not spend the refresh token', async () => {
    const fetchMock = vi.fn(async () => accessChallenge());
    vi.stubGlobal('fetch', fetchMock);
    await expect(actual.refreshCurrentUser()).rejects.toBeInstanceOf(
      ProxySignInError,
    );
    expect(actual.authStore.isValid).toBe(true);
    expect(actual.authStore.refreshToken).toBe('refresh');
    // One request: no refresh, no retry.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("the server's own 401 still refreshes and retries as before", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(serverUnauthorized())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ access_token: 'access2', refresh_token: 'refresh2', expires_in: 3600 }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'u1', email: 'me@example.com' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    await expect(actual.refreshCurrentUser()).resolves.toMatchObject({ id: 'u1' });
    expect(actual.authStore.refreshToken).toBe('refresh2');
  });

  it('a refresh turned away by the proxy keeps the session instead of clearing it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => accessChallenge()));
    expect(await actual.refreshSession()).toBe(false);
    expect(actual.authStore.isValid).toBe(true);
    expect(actual.authStore.refreshToken).toBe('refresh');
  });

  it('a password login turned away by the proxy reloads rather than reporting invalid_token', async () => {
    actual.authStore.clear();
    vi.stubGlobal('fetch', vi.fn(async () => accessChallenge()));
    await expect(actual.login('me@example.com', 'pw')).rejects.toBeInstanceOf(ProxySignInError);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });
});
