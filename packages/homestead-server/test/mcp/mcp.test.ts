/**
 * MCP server tests.
 *  - HTTP surface: unauthenticated 401 + WWW-Authenticate, and the
 *    protected-resource metadata a client discovers from it.
 *  - Protocol: the tools registered on an McpServer, driven through a real MCP
 *    Client over an in-memory transport (tools/list + the error path of
 *    tools/call). Real CRUD persistence runs against a live engine and is
 *    covered by the boot smoke test, since executeToolCall talks to aepbase
 *    over AEPBASE_URL.
 */

import { describe, expect, it, test } from 'vitest';
import { Hono } from 'hono';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthServerConfig } from '@rambleraptor/homestead-core/apps/config';
import type { ResourceDefinition } from '@rambleraptor/homestead-core/resources/types';
import { makeEngine } from '../engine/helpers';
import { AuthService } from '../../src/auth/service';
import { createOAuthTables } from '../../src/auth/oauth/storage';
import { makeWellKnownRoutes } from '../../src/auth/oauth/metadata';
import { makeMcpRoute, mcpAudience } from '../../src/routes/mcp';
import { registerHomesteadTools, type RegisterOptions } from '../../src/mcp/register';
import { scopeAllowsWrite } from '../../src/auth/scopes';
import { seedUser } from '../engine/helpers';
import type { AuthIdentity, RequestAuthenticator } from '../../src/auth/authenticator';

const CFG: AuthServerConfig = {
  enabled: true,
  issuerUrl: 'https://home.example.com',
  scopesSupported: ['homestead'],
};

const BOOK: ResourceDefinition = {
  singular: 'book',
  plural: 'books',
  fields: {
    title: { type: 'string', required: true },
    pages: { type: 'number' },
  },
  // An AEP-136 custom method, exposed as a tool of its own alongside CRUD.
  customMethods: {
    reshelve: {
      target: 'item',
      description: 'Move a book to another shelf.',
      request: {
        type: 'object',
        required: ['shelf'],
        properties: { shelf: { type: 'string' } },
      },
      load: async () => ({ default: async () => new Response('{}') }),
    },
  },
};

async function httpHarness() {
  const t = await makeEngine();
  createOAuthTables(t.engine.db);
  const auth = new AuthService(t.engine.db);
  const app = new Hono();
  app.route('/.well-known', makeWellKnownRoutes(CFG));
  app.route('/api/mcp', makeMcpRoute(t.engine, CFG, () => [BOOK]));
  return { t, auth, app };
}

describe('MCP HTTP surface', () => {
  test('an unauthenticated request is 401 with a discovery pointer', async () => {
    const { app } = await httpHarness();
    const res = await app.request('/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(401);
    expect(res.headers.get('WWW-Authenticate')).toContain(
      'https://home.example.com/.well-known/oauth-protected-resource/api/mcp',
    );
  });

  test('protected-resource metadata points at the resource and the AS', async () => {
    const { app } = await httpHarness();
    const res = await app.request('/.well-known/oauth-protected-resource/api/mcp');
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.resource).toBe('https://home.example.com/api/mcp');
    expect(body.authorization_servers).toEqual(['https://home.example.com']);
  });

  test('an audience-bound token passes auth and the transport answers initialize', async () => {
    const { t, auth, app } = await httpHarness();
    const token = auth.issueSession(t.admin.id, { audience: mcpAudience(CFG.issuerUrl) })
      .access_token;
    const res = await app.request('/api/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'test', version: '1' },
        },
      }),
    });
    expect(res.status).not.toBe(401);
    const text = await res.text();
    // Streamable HTTP with enableJsonResponse returns the JSON-RPC result
    // (possibly as an SSE `data:` line); either way it carries serverInfo.
    expect(text).toContain('serverInfo');
    // A wrong-audience token is rejected even though the token is otherwise valid.
    const wrong = auth.issueSession(t.admin.id, { audience: 'https://other/resource' })
      .access_token;
    const badRes = await app.request('/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${wrong}` },
      body: '{}',
    });
    expect(badRes.status).toBe(401);
  });
});

describe('MCP behind Cloudflare Access', () => {
  const HEADER = 'Cf-Access-Jwt-Assertion';
  const initialize = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'test', version: '1' },
    },
  });

  // A stub authenticator standing in for real JWT verification (covered in
  // access-jwt.test.ts): it maps the header value straight to an email.
  const stubAuthenticator: RequestAuthenticator = {
    name: 'stub',
    async authenticate(req: Request): Promise<AuthIdentity | null> {
      const email = req.headers.get(HEADER);
      return email ? { email } : null;
    },
  };

  async function accessHarness() {
    const t = await makeEngine();
    createOAuthTables(t.engine.db);
    const app = new Hono();
    app.route(
      '/api/mcp',
      makeMcpRoute(t.engine, CFG, () => [BOOK], { authenticators: [stubAuthenticator] }),
    );
    return { t, app };
  }

  test('a request with a valid Access identity for a known user authenticates', async () => {
    const { t, app } = await accessHarness();
    const res = await app.request('/api/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        [HEADER]: t.admin.email,
      },
      body: initialize,
    });
    expect(res.status).not.toBe(401);
    expect(await res.text()).toContain('serverInfo');
  });

  test('an Access identity with no matching Homestead user is 403', async () => {
    const { app } = await accessHarness();
    const res = await app.request('/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [HEADER]: 'stranger@example.com' },
      body: initialize,
    });
    expect(res.status).toBe(403);
  });

  test('no Access header and no bearer is still 401', async () => {
    const { app } = await accessHarness();
    const res = await app.request('/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(401);
  });

  test('the minted per-request token does not linger in the token table', async () => {
    const { t, app } = await accessHarness();
    const before = (
      t.engine.db.query('SELECT COUNT(*) AS n FROM _tokens').get() as { n: number }
    ).n;
    await app.request('/api/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        [HEADER]: t.admin.email,
      },
      body: initialize,
    });
    const after = (
      t.engine.db.query('SELECT COUNT(*) AS n FROM _tokens').get() as { n: number }
    ).n;
    expect(after).toBe(before);
  });

  test('a mapped regular user still authenticates (not just the admin)', async () => {
    const { t, app } = await accessHarness();
    const { user } = await seedUser(t.engine, { email: 'member@example.com' });
    const res = await app.request('/api/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        [HEADER]: user.email,
      },
      body: initialize,
    });
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});

describe('scopeAllowsWrite', () => {
  it('grants write for the write scope, the legacy scope, and unscoped tokens', () => {
    expect(scopeAllowsWrite('homestead:write')).toBe(true);
    expect(scopeAllowsWrite('homestead:read homestead:write')).toBe(true);
    expect(scopeAllowsWrite('homestead')).toBe(true);
    expect(scopeAllowsWrite(null)).toBe(true);
    expect(scopeAllowsWrite('')).toBe(true);
  });

  it('limits a read-only scope to reads', () => {
    expect(scopeAllowsWrite('homestead:read')).toBe(false);
  });
});

describe('MCP tool registration (over an in-memory client)', () => {
  async function connectClient(defs: ResourceDefinition[], opts?: RegisterOptions) {
    const server = new McpServer({ name: 'homestead', version: '0.2.0' });
    registerHomesteadTools(server, defs, 'test-token', opts);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: 'test-client', version: '1.0.0' });
    await client.connect(clientTransport);
    return client;
  }

  /** The generic surface is opt-in; `mode` defaults to the typed one. */
  const generic = (opts: RegisterOptions = {}): RegisterOptions => ({ ...opts, mode: 'generic' });

  it('collapses to six tools when the generic surface is selected', async () => {
    const client = await connectClient([BOOK], generic());
    const names = (await client.listTools()).tools.map((tool) => tool.name);
    expect(names.sort()).toEqual([
      'create_record',
      'delete_record',
      'describe_resources',
      'read_records',
      'run_custom_method',
      'update_record',
    ]);
    await client.close();
  });

  it('describes a resource through the generic surface', async () => {
    const client = await connectClient([BOOK], generic());
    const res = (await client.callTool({
      name: 'describe_resources',
      arguments: { resource: 'books' },
    })) as { isError?: boolean; content: { type: string; text: string }[] };
    expect(res.isError).toBeFalsy();
    const described = JSON.parse(res.content[0].text) as Record<string, any>;
    expect(described.fields.title).toEqual({ type: 'string', required: true });
    expect(described.custom_methods[0].verb).toBe('reshelve');
    await client.close();
  });

  it('exposes the four CRUD tools per resource by default, and no search tool', async () => {
    const client = await connectClient([BOOK]);
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name);
    expect(names).toEqual(
      expect.arrayContaining(['create_book', 'read_book', 'update_book', 'delete_book']),
    );
    // Embeddings/vector store aren't configured in this process → no search tool.
    expect(names).not.toContain('search_documents');
    await client.close();
  });

  it('a read-only registration exposes only the read tool, no writers', async () => {
    const client = await connectClient([BOOK], { write: false });
    const names = (await client.listTools()).tools.map((tool) => tool.name);
    expect(names).toContain('read_book');
    expect(names).not.toContain('create_book');
    expect(names).not.toContain('update_book');
    expect(names).not.toContain('delete_book');
    // A POST custom method has side effects, so it's a write too.
    expect(names).not.toContain('reshelve_book');
    await client.close();
  });

  it('a per-resource write gate drops only the read-only resource’s writers', async () => {
    const SHELF: ResourceDefinition = { singular: 'shelf', plural: 'shelves', fields: { name: { type: 'string' } } };
    const client = await connectClient([BOOK, SHELF], { write: (def) => def.singular === 'shelf' });
    const names = (await client.listTools()).tools.map((tool) => tool.name);
    expect(names).toEqual(expect.arrayContaining(['read_book', 'read_shelf', 'create_shelf', 'delete_shelf']));
    expect(names).not.toContain('create_book');
    expect(names).not.toContain('reshelve_book');
    await client.close();
  });

  it('read-only narrows the generic surface to describe + read', async () => {
    const client = await connectClient([BOOK], generic({ write: false }));
    const names = (await client.listTools()).tools.map((tool) => tool.name);
    expect(names.sort()).toEqual(['describe_resources', 'read_records']);
    await client.close();
  });

  it('exposes a custom method as its own tool, with its declared schema', async () => {
    const client = await connectClient([BOOK]);
    const tool = (await client.listTools()).tools.find((t) => t.name === 'reshelve_book');
    expect(tool?.description).toContain('Move a book to another shelf.');
    expect(tool?.inputSchema.required).toEqual(expect.arrayContaining(['id', 'shelf']));
    // No engine is reachable at AEPBASE_URL here, so the call comes back as a
    // structured error — the same wiring proof the CRUD tools get below.
    const res = (await client.callTool({
      name: 'reshelve_book',
      arguments: { id: 'b1', shelf: 'fiction' },
    })) as { isError?: boolean; content: { type: string; text: string }[] };
    expect(res.isError).toBe(true);
    await client.close();
  });

  it('a CRUD tool is callable and surfaces failures as a structured error', async () => {
    // No engine is reachable at AEPBASE_URL here, so executeToolCall returns a
    // structured error rather than throwing — proving the tool is wired and the
    // error mapping works. (Successful persistence is covered by the boot smoke.)
    const client = await connectClient([BOOK]);
    const res = (await client.callTool({ name: 'read_book', arguments: {} })) as {
      isError?: boolean;
      content: { type: string; text: string }[];
    };
    expect(res.isError).toBe(true);
    expect(res.content[0].type).toBe('text');
    await client.close();
  });
});
