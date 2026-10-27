/**
 * Homestead as an MCP *client*: `withMcpServer` connects to a household MCP
 * server with the bearer token from its credential and lists its tools. The
 * server here is Homestead's own `/api/mcp`, mounted in-process and reached
 * through a stubbed `fetch` at a trusted test host, so the full Streamable HTTP
 * exchange runs for real.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { Hono } from 'hono';
import type { AuthServerConfig } from '@rambleraptor/homestead-core/apps/config';
import type { ResourceDefinition } from '@rambleraptor/homestead-core/resources/types';
import { setSecretReader } from '@rambleraptor/homestead-core/server/secrets';
import {
  listAllTools,
  McpConnectionError,
  withMcpServer,
} from '@rambleraptor/homestead-core/server/mcp/connect';
import { makeEngine } from '../engine/helpers';
import { AuthService } from '../../src/auth/service';
import { createOAuthTables } from '../../src/auth/oauth/storage';
import { makeMcpRoute, mcpAudience } from '../../src/routes/mcp';

const CFG: AuthServerConfig = { enabled: true, issuerUrl: 'https://home.example.com', scopesSupported: ['homestead'] };
const BOOK: ResourceDefinition = {
  singular: 'book',
  plural: 'books',
  fields: { title: { type: 'string', required: true } },
};
const SERVER_URL = 'http://mcp.test/api/mcp';

// Swapped by hand rather than with vi.stubGlobal/stubEnv, which bun's vitest
// alias doesn't provide — this suite runs under both runtimes.
const realFetch = globalThis.fetch;
const realTrusted = process.env.HOMESTEAD_MCP_TRUSTED_HOSTS;

let token: string;
const secrets = new Map<string, unknown>();
let sentAuthorization: Array<string | null>;

beforeEach(async () => {
  const t = await makeEngine();
  createOAuthTables(t.engine.db);
  token = new AuthService(t.engine.db).issueSession(t.admin.id, { audience: mcpAudience(CFG.issuerUrl) })
    .access_token;
  const app = new Hono();
  app.route('/api/mcp', makeMcpRoute(t.engine, CFG, () => [BOOK]));

  sentAuthorization = [];
  process.env.HOMESTEAD_MCP_TRUSTED_HOSTS = 'mcp.test';
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    sentAuthorization.push(request.headers.get('authorization'));
    return app.fetch(request);
  }) as typeof fetch;
  secrets.clear();
  setSecretReader((resource, path, field) => secrets.get(`${resource}:${path}:${field}`) ?? null);
});

afterEach(() => {
  globalThis.fetch = realFetch;
  if (realTrusted === undefined) delete process.env.HOMESTEAD_MCP_TRUSTED_HOSTS;
  else process.env.HOMESTEAD_MCP_TRUSTED_HOSTS = realTrusted;
  setSecretReader(null);
});

describe('withMcpServer', () => {
  test('connects with the credential’s token and lists the server’s tools', async () => {
    secrets.set('credential:credentials/ha:value', token);
    const tools = await withMcpServer({ url: SERVER_URL, credential: 'credentials/ha' }, listAllTools);
    const names = tools.map((tool) => tool.name);
    expect(names.length).toBeGreaterThan(0);
    expect(names.some((name) => name.includes('book'))).toBe(true);
    // Every request carried the token, and only as the bearer header.
    expect(sentAuthorization.length).toBeGreaterThan(0);
    expect(sentAuthorization.every((value) => value === `Bearer ${token}`)).toBe(true);
  });

  test('a credential with no value fails before anything is sent', async () => {
    await expect(
      withMcpServer({ url: SERVER_URL, credential: 'credentials/missing' }, listAllTools),
    ).rejects.toBeInstanceOf(McpConnectionError);
    expect(sentAuthorization).toEqual([]);
  });

  test('a server that refuses the token fails, without the token in the error', async () => {
    secrets.set('credential:credentials/ha:value', 'not-a-real-token');
    const failure = await withMcpServer({ url: SERVER_URL, credential: 'credentials/ha' }, listAllTools).then(
      () => null,
      (err: unknown) => err as Error,
    );
    expect(failure).toBeInstanceOf(Error);
    expect(String(failure?.message)).not.toContain('not-a-real-token');
  });

  test('a fenced address is refused before connecting', async () => {
    await expect(withMcpServer({ url: 'http://127.0.0.1:8090/api/mcp' }, listAllTools)).rejects.toThrow(
      'loopback',
    );
    expect(sentAuthorization).toEqual([]);
  });
});
