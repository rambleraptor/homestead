/**
 * MCP servers that sign in with OAuth (`server/mcp/oauth.ts`), on the VM tier,
 * against an in-process server with its own authorization server
 * (`vm/oauth-mcp-stub.ts`): connecting (with a client the server registers,
 * or one pasted in), using it, refreshing, a revoked sign-in, the address
 * binding, the `state` checks, and disconnecting.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { providerNavigation } from '@rambleraptor/homestead-core/superuser/mcp-servers/hooks/useMcpServers';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import {
  installOAuthMcpStub,
  OAUTH_STUB_HOST,
  OAUTH_STUB_PASTED_CLIENT,
  OAUTH_STUB_URL,
  type OAuthMcpStub,
} from '@rambleraptor/homestead-test-harness/vm/oauth-mcp-stub';
import { resetPendingSignInsForTests } from '@rambleraptor/homestead-core/server/mcp/oauth';
import type { McpServer } from '@rambleraptor/homestead-core/superuser/mcp-servers/types';
import { McpServersPage } from '../e2e/pages/McpServersPage';
import { e2eClient } from '../e2e/utils/aepbase-helpers';

const APP = () => process.env.HOMESTEAD_E2E_APP_URL!;
const CALLBACK = () => `${APP()}/superuser/mcp-servers/oauth-callback`;
const realTrusted = process.env.HOMESTEAD_MCP_TRUSTED_HOSTS;

describe('MCP servers with OAuth', () => {
  let h: Harness;
  let stub: OAuthMcpStub;

  beforeEach(async () => {
    process.env.HOMESTEAD_MCP_TRUSTED_HOSTS = OAUTH_STUB_HOST;
    resetPendingSignInsForTests();
    stub = installOAuthMcpStub();
    h = await bootHomestead();
  });

  afterEach(async () => {
    await h.close();
    if (realTrusted === undefined) delete process.env.HOMESTEAD_MCP_TRUSTED_HOSTS;
    else process.env.HOMESTEAD_MCP_TRUSTED_HOSTS = realTrusted;
  });

  const admin = () => e2eClient(h.admin.token);

  /** An OAuth credential and a server using it. */
  async function addServer(credential: Record<string, unknown> = {}): Promise<McpServer> {
    const created = await admin()
      .collection<{ id: string }>('credentials')
      .create({ name: 'Calendar sign-in', kind: 'oauth', ...credential });
    return admin().collection<McpServer>('mcp-servers').create({
      name: 'Calendar',
      url: OAUTH_STUB_URL,
      credential: `credentials/${created.id}`,
    });
  }

  function method(token: string, serverId: string, verb: string, body?: unknown): Promise<Response> {
    return fetch(`${APP()}/api/aep/mcp-servers/${serverId}:${verb}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }

  /** Start a sign-in and follow the provider's (instant) approval back: the callback's code and state. */
  async function signIn(serverId: string, token = h.admin.token): Promise<{ code: string; state: string }> {
    const res = await method(token, serverId, 'connect', { redirect_uri: CALLBACK() });
    expect(res.status).toBe(200);
    const { authorization_url } = (await res.json()) as { authorization_url: string };
    const approved = await fetch(authorization_url, { redirect: 'manual' });
    expect(approved.status).toBe(302);
    const back = new URL(approved.headers.get('location')!);
    expect(back.toString().startsWith(CALLBACK())).toBe(true);
    return { code: back.searchParams.get('code')!, state: back.searchParams.get('state')! };
  }

  async function connect(serverId: string): Promise<McpServer> {
    const { code, state } = await signIn(serverId);
    const res = await method(h.admin.token, serverId, 'finish-connect', { code, state });
    expect(res.status).toBe(200);
    return (await res.json()) as McpServer;
  }

  async function useGetState(serverId: string): Promise<Response> {
    await admin()
      .collection<McpServer>('mcp-servers')
      .record(serverId)
      .update({ tools: [{ name: 'get_state', policy: 'read' }] });
    return method(h.admin.token, serverId, 'call-tool', { tool: 'get_state', arguments: { entity: 'light.hall' } });
  }

  test('connecting registers a client, signs in, and fetches the tools', async () => {
    const server = await addServer();
    const checked = await connect(server.id);
    expect(checked).toMatchObject({ status: 'ok' });
    expect(checked.tools?.map((t) => t.name)).toEqual(['get_state']);
    expect(stub.registered).toHaveLength(1);
    expect(stub.registered[0]!.redirectUris).toEqual([CALLBACK()]);
    expect(stub.tokenRequests).toEqual(['authorization_code']);

    // The credential says it's connected, and for which address — never the tokens.
    const credential = await admin().collection('credentials').get(server.credential!.split('/')[1]!);
    expect(credential).toMatchObject({
      kind: 'oauth',
      oauth_resource: OAUTH_STUB_URL,
      oauth_state: { $secret: true, set: true },
    });
    const body = JSON.stringify(credential);
    for (const token of stub.issuedTokens()) expect(body).not.toContain(token);

    expect((await useGetState(server.id)).status).toBe(200);
    expect(stub.calls).toEqual([{ tool: 'get_state', arguments: { entity: 'light.hall' } }]);
  });

  test('a pasted client is used as typed, with its scope', async () => {
    stub.dynamicRegistration = false;
    const server = await addServer({
      oauth_client_id: OAUTH_STUB_PASTED_CLIENT.id,
      oauth_client_secret: OAUTH_STUB_PASTED_CLIENT.secret,
      oauth_scope: 'calendar.read',
    });
    expect(await connect(server.id)).toMatchObject({ status: 'ok' });
    expect(stub.registered).toEqual([]);
    expect(stub.authorizeScopes).toEqual(['calendar.read']);
  });

  test('a token about to expire is refreshed once, and the refresh token rotates', async () => {
    stub.expiresIn = 30; // inside the minute Homestead refreshes early
    const server = await addServer();
    await connect(server.id);
    expect((await useGetState(server.id)).status).toBe(200);
    expect((await useGetState(server.id)).status).toBe(200);
    // Each use found the token about to expire, and refreshed with the newest refresh token.
    expect(stub.tokenRequests).toEqual(['authorization_code', 'refresh_token', 'refresh_token', 'refresh_token']);
  });

  test('a revoked sign-in fails the call and asks for a reconnect', async () => {
    stub.expiresIn = 30;
    const server = await addServer();
    await connect(server.id);
    stub.revokeAll();
    const res = await useGetState(server.id);
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: { message: string } }).error.message).toContain('reconnect');
  });

  test('tokens go only to the address they were issued for', async () => {
    const server = await addServer();
    await connect(server.id);
    await admin()
      .collection<McpServer>('mcp-servers')
      .record(server.id)
      .update({ url: `http://${OAUTH_STUB_HOST}/elsewhere` });
    const refreshed = await method(h.admin.token, server.id, 'refresh-tools');
    expect(await refreshed.json()).toMatchObject({
      status: 'failing',
      last_error: expect.stringContaining('address changed'),
    });
  });

  test('a state is single-use, and only for the superuser and server that started it', async () => {
    const server = await addServer();
    const other = await addServer();
    const { code, state } = await signIn(server.id);
    // Another server can't take it…
    expect((await method(h.admin.token, other.id, 'finish-connect', { code, state })).status).toBe(400);
    // …and it was spent trying.
    expect((await method(h.admin.token, server.id, 'finish-connect', { code, state })).status).toBe(400);
    const again = await signIn(server.id);
    expect((await method(h.admin.token, server.id, 'finish-connect', { ...again, state: 'made-up' })).status).toBe(
      400,
    );
  });

  test('members can’t connect, finish or disconnect', async () => {
    const server = await addServer();
    for (const verb of ['connect', 'finish-connect', 'disconnect']) {
      expect((await method(h.member.token, server.id, verb, { redirect_uri: CALLBACK(), code: 'x', state: 'y' })).status).toBe(
        403,
      );
    }
  });

  test('a redirect_uri must be this Homestead’s callback page', async () => {
    const server = await addServer();
    for (const redirect_uri of ['https://evil.example/steal', `${APP()}/somewhere-else`, `${CALLBACK()}?x=1`]) {
      expect((await method(h.admin.token, server.id, 'connect', { redirect_uri })).status).toBe(400);
    }
  });

  test('disconnecting forgets the sign-in', async () => {
    const server = await addServer();
    await connect(server.id);
    expect((await method(h.admin.token, server.id, 'disconnect')).status).toBe(200);
    const refreshed = await method(h.admin.token, server.id, 'refresh-tools');
    expect(await refreshed.json()).toMatchObject({ status: 'failing', last_error: expect.stringContaining('connect') });
  });

  describe('from the MCP servers page', () => {
    let leftFor: string[];
    const realGo = providerNavigation.go;

    beforeEach(() => {
      leftFor = [];
      // There's no provider page to leave for: record where the browser would go.
      providerNavigation.go = (url) => void leftFor.push(url);
    });

    afterEach(() => {
      providerNavigation.go = realGo;
    });

    /** Do what the provider would: approve, and send the browser back to Homestead's callback page. */
    async function approveAndReturn(): Promise<void> {
      await expect.poll(() => leftFor.length).toBe(1);
      const approved = await fetch(leftFor[0]!, { redirect: 'manual' });
      const back = new URL(approved.headers.get('location')!);
      await h.driver.goto(`${back.pathname}${back.search}`);
    }

    test('a superuser signs a server in with OAuth, then disconnects it', async () => {
      const server = await admin()
        .collection<McpServer>('mcp-servers')
        .create({ name: 'Calendar', url: OAUTH_STUB_URL });
      await h.loginAs(h.admin);
      const page = new McpServersPage(h.driver);
      await page.goto();

      await page.signInWithOAuth(server.id);
      await approveAndReturn();
      await h.driver.expect(page.signInStatus(server.id)).toContainText('Signed in');
      await h.driver.expect(page.status(server.id)).toContainText('Connected');
      await h.driver.expect(page.toolCount(server.id)).toContainText('0 of 1 tools on');

      await page.disconnect(server.id);
      await h.driver.expect(page.signInStatus(server.id)).toContainText('Not connected');
    });

    test('a pasted client signs in too', async () => {
      stub.dynamicRegistration = false;
      const server = await admin()
        .collection<McpServer>('mcp-servers')
        .create({ name: 'Calendar', url: OAUTH_STUB_URL });
      await h.loginAs(h.admin);
      const page = new McpServersPage(h.driver);
      await page.goto();
      await page.signInWithOAuth(server.id, {
        id: OAUTH_STUB_PASTED_CLIENT.id,
        secret: OAUTH_STUB_PASTED_CLIENT.secret,
        scope: 'calendar.read',
      });
      await approveAndReturn();
      await h.driver.expect(page.signInStatus(server.id)).toContainText('Signed in');
      expect(stub.authorizeScopes).toEqual(['calendar.read']);
    });

    test('a callback it didn’t start says so', async () => {
      await h.loginAs(h.admin);
      const page = new McpServersPage(h.driver);
      await h.driver.goto('/superuser/mcp-servers/oauth-callback?code=abc&state=def');
      await h.driver.expect(page.callbackError).toContainText('Start it again');
    });
  });
});
