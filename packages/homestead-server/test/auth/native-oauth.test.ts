import { afterEach, describe, expect, test } from 'vitest';
import { createHash } from 'node:crypto';
import { Database } from '../../src/engine/sqlite';
import { createUserTables } from '../../src/engine/users';
import { OAuthRoutes, type SessionIssuer } from '../../src/engine/oauth';

const config = {
  redirectBaseUrl: 'https://home.example/api/aep', successRedirect: 'https://home.example/auth/callback',
  providers: [{ name: 'example', clientId: 'client', clientSecret: 'secret', authUrl: 'https://idp.example/auth', tokenUrl: 'https://idp.example/token', userInfoUrl: 'https://idp.example/userinfo', allowRegistration: true }],
};
let cleanup: (() => void) | undefined;
const verifier = 'v'.repeat(43);
const appState = 's'.repeat(43);
const challenge = createHash('sha256').update(verifier).digest('base64url');
const issuer: SessionIssuer = () => ({ access_token: 'ACCESS', refresh_token: 'REFRESH', expires_in: 3600 });
function setup() {
  const db = new Database(':memory:'); createUserTables(db);
  const providerFetch = (async (input: RequestInfo | URL) => String(input).endsWith('/token')
    ? Response.json({ access_token: 'IDP' })
    : Response.json({ sub: 'external-user', email: 'native@example.com', email_verified: true })) as typeof fetch;
  const routes = OAuthRoutes.fromConfig(db, config, providerFetch)!;
  cleanup = () => { db.close(); };
  return { db, routes };
}
async function authorize(routes: OAuthRoutes) {
  const start = await routes.handle(new Request(`https://home.example/api/aep/oauth/example/start?native_challenge=${challenge}&native_state=${appState}`), ['oauth', 'example', 'start'], issuer);
  const state = new URL(start!.headers.get('Location')!).searchParams.get('state')!;
  const callback = await routes.handle(new Request(`https://home.example/api/aep/oauth/example/callback?state=${state}&code=IDP_CODE`, {
    headers: { Cookie: `aepbase_oauth_state=${state}` },
  }), ['oauth', 'example', 'callback'], issuer);
  return callback!;
}
function exchange(routes: OAuthRoutes, code: string, proof = verifier) {
  return routes.handle(new Request('https://home.example/api/aep/oauth/native/exchange', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, verifier: proof }),
  }), ['oauth', 'native', 'exchange'], issuer);
}
describe('native OAuth handoff', () => {
  afterEach(() => { cleanup?.(); cleanup = undefined; });
  test('returns only a code and state and exchanges exactly once with PKCE', async () => {
    const { routes } = setup();
    const callback = await authorize(routes);
    const location = callback.headers.get('Location')!;
    expect(location.startsWith('homestead://oauth?')).toBe(true);
    expect(location).not.toContain('ACCESS'); expect(location).not.toContain('REFRESH');
    const params = new URL(location).searchParams;
    expect(params.get('state')).toBe(appState);
    const code = params.get('code')!;
    const response = await exchange(routes, code);
    expect(response!.status).toBe(200);
    expect(response!.headers.get('Cache-Control')).toBe('no-store');
    expect(await response!.json()).toEqual(issuer('user'));
    expect((await exchange(routes, code))!.status).toBe(400);
  });
  test('wrong proof cannot redeem or consume a valid code', async () => {
    const { routes } = setup();
    const code = new URL((await authorize(routes)).headers.get('Location')!).searchParams.get('code')!;
    expect((await exchange(routes, code, 'x'.repeat(43)))!.status).toBe(400);
    expect((await exchange(routes, code))!.status).toBe(200);
  });
  test('expired codes cannot be redeemed', async () => {
    const { routes, db } = setup();
    const code = new URL((await authorize(routes)).headers.get('Location')!).searchParams.get('code')!;
    db.run('UPDATE _oauth_native_codes SET expires_at = 0');
    expect((await exchange(routes, code))!.status).toBe(400);
  });
  test('invalid challenges are rejected before redirecting to the provider', async () => {
    const { routes } = setup();
    const response = await routes.handle(new Request('https://home.example/oauth/example/start?native_challenge=bad&native_state=bad'), ['oauth', 'example', 'start']);
    expect(response!.status).toBe(400); expect(response!.headers.get('Location')).toBeNull();
  });
  test('native flow still requires the provider CSRF cookie to match', async () => {
    const { routes } = setup();
    const response = await routes.handle(new Request('https://home.example/oauth/example/callback?code=abc&state=wrong', {
      headers: { Cookie: 'aepbase_oauth_state=correct' },
    }), ['oauth', 'example', 'callback'], issuer);
    expect(response!.status).toBe(400);
  });
});
