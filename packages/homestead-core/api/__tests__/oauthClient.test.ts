/**
 * Unit tests for the OAuth client helpers in api/aepbase.ts.
 *
 * The global test setup mocks the aepbase app, so we pull the *real*
 * implementation via importActual and drive it with a stubbed global fetch.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const actual = await vi.importActual<typeof import('../aepbase')>('../aepbase');

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('oauth client', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('listOAuthProviders parses the providers array', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ providers: [{ name: 'google', display_name: 'Google' }] }),
      ),
    );
    expect(await actual.listOAuthProviders()).toEqual([
      { name: 'google', display_name: 'Google' },
    ]);
  });

  it('listOAuthProviders rejects when the endpoint is unreachable', async () => {
    // The login page reports a failed load (and retries) instead of showing
    // no buttons, so the failure has to surface rather than become [].
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network');
      }),
    );
    await expect(actual.listOAuthProviders()).rejects.toThrow();
  });

  it('completeOAuthLogin resolves the user via whoami and persists the session', async () => {
    const userJson = {
      id: 'u1',
      path: 'users/u1',
      email: 'a@b.com',
      display_name: 'A',
      type: 'regular',
      create_time: 't',
      update_time: 't',
    };
    const fetchMock = vi.fn(async () => jsonResponse(userJson));
    vi.stubGlobal('fetch', fetchMock);

    const user = await actual.completeOAuthLogin({
      accessToken: 'tok-123',
      refreshToken: 'ref-123',
      expiresIn: 3600,
    });

    expect(user.email).toBe('a@b.com');
    expect(user.type).toBe('regular');
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toBe('/api/aep/users/me');
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok-123');
    expect(actual.aepbase.authStore.token).toBe('tok-123');
    expect(actual.aepbase.authStore.refreshToken).toBe('ref-123');
  });

  it('completeOAuthLogin throws an AepbaseError on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: { message: 'forbidden' } }, 403)),
    );
    await expect(actual.completeOAuthLogin({ accessToken: 't' })).rejects.toThrow('forbidden');
  });

  it('login posts to /api/auth/login and stores the session', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        access_token: 'acc-1',
        refresh_token: 'ref-1',
        expires_in: 3600,
        user: {
          id: 'u1',
          path: 'users/u1',
          email: 'a@b.com',
          type: 'regular',
          create_time: 't',
          update_time: 't',
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const user = await actual.login('a@b.com', 'pw');
    expect(user.email).toBe('a@b.com');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/auth/login');
    expect(actual.aepbase.authStore.token).toBe('acc-1');
    expect(actual.aepbase.authStore.refreshToken).toBe('ref-1');
  });

  it('refreshSession rotates tokens on success and clears on rejection', async () => {
    // Seed a session with a refresh token.
    actual.aepbase.authStore.saveSession(
      { accessToken: 'old-acc', refreshToken: 'old-ref', expiresIn: 3600 },
      null,
    );

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ access_token: 'new-acc', refresh_token: 'new-ref', expires_in: 3600 }),
      ),
    );
    expect(await actual.refreshSession()).toBe(true);
    expect(actual.aepbase.authStore.token).toBe('new-acc');
    expect(actual.aepbase.authStore.refreshToken).toBe('new-ref');

    // A rejected refresh clears the session.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: 'nope' }, 401)),
    );
    expect(await actual.refreshSession()).toBe(false);
    expect(actual.aepbase.authStore.isValid).toBe(false);
  });
});

/** Session keys as another tab would write them (the store's own constants). */
const KEYS = {
  token: 'aepbase_auth_token',
  refresh: 'aepbase_refresh_token',
  expires: 'aepbase_token_expires_at',
  user: 'aepbase_auth_user',
};

/** Write a session into localStorage behind the store's back, like another tab. */
function otherTabStores(access: string, refresh: string, expiresInMs = 3_600_000): void {
  window.localStorage.setItem(KEYS.token, access);
  window.localStorage.setItem(KEYS.refresh, refresh);
  window.localStorage.setItem(KEYS.expires, String(Date.now() + expiresInMs));
}

function bearerOf(call: unknown[]): string | undefined {
  const init = call[1] as RequestInit | undefined;
  return (init?.headers as Record<string, string> | undefined)?.Authorization;
}

describe('authorizedFetch', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
    // The store is a module singleton: start each case from a signed-out one.
    actual.aepbase.authStore.clear();
  });

  it('renews a near-expired token before sending', async () => {
    actual.aepbase.authStore.saveSession(
      { accessToken: 'old-acc', refreshToken: 'old-ref', expiresIn: 0 },
      null,
    );
    const fetchMock = vi.fn(async (url: string) =>
      url.endsWith('/api/auth/refresh')
        ? jsonResponse({ access_token: 'new-acc', refresh_token: 'new-ref', expires_in: 3600 })
        : jsonResponse({ ok: true }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await actual.authorizedFetch('/api/household');
    expect(res.ok).toBe(true);
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(['/api/auth/refresh', '/api/household']);
    expect(bearerOf(fetchMock.mock.calls[1])).toBe('Bearer new-acc');
  });

  it('refreshes once and retries with the rotated token after a 401', async () => {
    actual.aepbase.authStore.saveSession(
      { accessToken: 'old-acc', refreshToken: 'old-ref', expiresIn: 3600 },
      null,
    );
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/api/auth/refresh')) {
        return jsonResponse({ access_token: 'new-acc', refresh_token: 'new-ref', expires_in: 3600 });
      }
      const bearer = (init?.headers as Record<string, string>).Authorization;
      return bearer === 'Bearer new-acc'
        ? jsonResponse({ ok: true })
        : jsonResponse({ error: { code: 401, message: 'invalid token' } }, 401);
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await actual.authorizedFetch('/api/security/status', {
      headers: { 'X-User-Id': 'u1' },
    });
    expect(res.status).toBe(200);
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      '/api/security/status',
      '/api/auth/refresh',
      '/api/security/status',
    ]);
    // Caller headers ride along on the retry too.
    const retryHeaders = (fetchMock.mock.calls[2][1] as RequestInit).headers as Record<string, string>;
    expect(retryHeaders['X-User-Id']).toBe('u1');
    expect(retryHeaders.Authorization).toBe('Bearer new-acc');
  });

  it('does not retry a 401 when there is no refresh token to spend', async () => {
    actual.aepbase.authStore.save('bare-token', null);
    const fetchMock = vi.fn(async () =>
      jsonResponse({ error: { code: 401, message: 'invalid token' } }, 401),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await actual.authorizedFetch('/api/household');
    expect(res.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('sessions across tabs', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
    actual.aepbase.authStore.clear();
  });

  it('adopts the session another tab stored when its storage event arrives', () => {
    actual.aepbase.authStore.saveSession(
      { accessToken: 'tab-a-acc', refreshToken: 'tab-a-ref', expiresIn: 3600 },
      null,
    );
    const listener = vi.fn();
    const unsubscribe = actual.aepbase.authStore.onChange(listener);

    otherTabStores('tab-b-acc', 'tab-b-ref');
    window.dispatchEvent(
      new StorageEvent('storage', { key: KEYS.token, storageArea: window.localStorage }),
    );

    expect(actual.aepbase.authStore.token).toBe('tab-b-acc');
    expect(actual.aepbase.authStore.refreshToken).toBe('tab-b-ref');
    expect(listener).toHaveBeenCalledWith('tab-b-acc', null);
    unsubscribe();
  });

  it('signs out when another tab clears the session', () => {
    actual.aepbase.authStore.saveSession(
      { accessToken: 'tab-a-acc', refreshToken: 'tab-a-ref', expiresIn: 3600 },
      null,
    );
    const listener = vi.fn();
    const unsubscribe = actual.aepbase.authStore.onChange(listener);

    window.localStorage.clear();
    window.dispatchEvent(new StorageEvent('storage', { key: null, storageArea: window.localStorage }));

    expect(actual.aepbase.authStore.isValid).toBe(false);
    expect(listener).toHaveBeenCalledWith('', null);
    unsubscribe();
  });

  it('skips the refresh when another tab already rotated the session', async () => {
    actual.aepbase.authStore.saveSession(
      { accessToken: 'tab-a-acc', refreshToken: 'tab-a-ref', expiresIn: 3600 },
      null,
    );
    // Tab B rotated first; this tab's in-memory copy is stale but its storage
    // event hasn't been delivered yet.
    otherTabStores('tab-b-acc', 'tab-b-ref');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(await actual.refreshSession()).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(actual.aepbase.authStore.token).toBe('tab-b-acc');
  });

  it('a rejected refresh keeps the session another tab rotated meanwhile', async () => {
    actual.aepbase.authStore.saveSession(
      { accessToken: 'tab-a-acc', refreshToken: 'tab-a-ref', expiresIn: 3600 },
      null,
    );
    // Tab B wins the race while this tab's refresh is on the wire: the server
    // rejects this tab's single-use refresh token, and by then storage holds
    // tab B's new pair.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        otherTabStores('tab-b-acc', 'tab-b-ref');
        return jsonResponse({ error: 'invalid or expired refresh token' }, 401);
      }),
    );

    expect(await actual.refreshSession()).toBe(true);
    expect(actual.aepbase.authStore.token).toBe('tab-b-acc');
    expect(actual.aepbase.authStore.refreshToken).toBe('tab-b-ref');
    // And tab B's session is still on record for the next reload.
    expect(window.localStorage.getItem(KEYS.token)).toBe('tab-b-acc');
  });

  it('a rejected refresh still ends the session when nothing else rotated it', async () => {
    actual.aepbase.authStore.saveSession(
      { accessToken: 'tab-a-acc', refreshToken: 'tab-a-ref', expiresIn: 3600 },
      null,
    );
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'nope' }, 401)));

    expect(await actual.refreshSession()).toBe(false);
    expect(actual.aepbase.authStore.isValid).toBe(false);
    expect(window.localStorage.getItem(KEYS.token)).toBeNull();
  });
});
