/**
 * An MCP server that signs in with OAuth, served in-process at
 * {@link OAUTH_STUB_ORIGIN} through the fetch shim: the server itself (the
 * same tools as `./mcp-stub`) and its own authorization server — protected
 * resource and authorization server metadata, dynamic client registration, an
 * authorize endpoint that approves at once (it redirects straight back with a
 * code), and a token endpoint that checks PKCE and rotates refresh tokens.
 *
 * Specs drive Homestead's OAuth connections (`server/mcp/oauth.ts`) through
 * it end to end. {@link OAUTH_STUB_PASTED_CLIENT} is a client "registered by
 * hand", for servers without dynamic registration. Point a spec at it with
 * `HOMESTEAD_MCP_TRUSTED_HOSTS` including {@link OAUTH_STUB_HOST}.
 */

import { createHash, randomBytes } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import { registerService } from './fetch-shim';

export const OAUTH_STUB_HOST = 'oauth-mcp.test';
export const OAUTH_STUB_ORIGIN = `http://${OAUTH_STUB_HOST}`;
export const OAUTH_STUB_URL = `${OAUTH_STUB_ORIGIN}/mcp`;
export const OAUTH_STUB_PASTED_CLIENT = { id: 'pasted-client', secret: 'pasted-client-secret-0123456789' };

interface Client {
  id: string;
  secret: string;
  redirectUris?: string[];
}

interface Grant {
  clientId: string;
  redirectUri: string;
  challenge: string;
  scope?: string;
}

export interface OAuthMcpStub {
  /** Tool calls the server received. */
  calls: Array<{ tool: string; arguments: Record<string, unknown> }>;
  /** Clients registered dynamically. */
  registered: Client[];
  /** Grant types the token endpoint was asked for, in order. */
  tokenRequests: string[];
  /** Scopes each authorize request asked for. */
  authorizeScopes: Array<string | null>;
  /** Access tokens' lifetime in seconds for the next ones issued. */
  expiresIn: number;
  /** Whether the authorization server offers dynamic registration. */
  dynamicRegistration: boolean;
  /** Revoke every token issued so far: requests and refreshes then fail. */
  revokeAll(): void;
  /** Every access and refresh token issued, to check none leak. */
  issuedTokens(): string[];
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

const tokenError = (code: string) => json({ error: code }, 400);

function mcpServer(calls: OAuthMcpStub['calls']): McpServer {
  const server = new McpServer({ name: 'oauth-stub', version: '1.0.0' });
  server.registerTool(
    'get_state',
    { description: 'Read a device’s state', inputSchema: { entity: z.string() }, annotations: { readOnlyHint: true } },
    async (args) => {
      calls.push({ tool: 'get_state', arguments: args });
      return { content: [{ type: 'text', text: `${args.entity} is off` }] };
    },
  );
  return server;
}

/** Serve the OAuth stub for the rest of this worker; returns its controls, fresh. */
export function installOAuthMcpStub(): OAuthMcpStub {
  const clients = new Map<string, Client>([
    [OAUTH_STUB_PASTED_CLIENT.id, { id: OAUTH_STUB_PASTED_CLIENT.id, secret: OAUTH_STUB_PASTED_CLIENT.secret }],
  ]);
  const codes = new Map<string, Grant>();
  const access = new Map<string, number>(); // token → expires at (ms)
  const refresh = new Map<string, string>(); // token → client id
  let revoked = new Set<string>();

  const stub: OAuthMcpStub = {
    calls: [],
    registered: [],
    tokenRequests: [],
    authorizeScopes: [],
    expiresIn: 3600,
    dynamicRegistration: true,
    revokeAll() {
      revoked = new Set([...access.keys(), ...refresh.keys()]);
      access.clear();
      refresh.clear();
    },
    issuedTokens: () => [...revoked, ...access.keys(), ...refresh.keys()],
  };

  const issue = (clientId: string) => {
    const accessToken = `at-${randomBytes(16).toString('hex')}`;
    const refreshToken = `rt-${randomBytes(16).toString('hex')}`;
    access.set(accessToken, Date.now() + stub.expiresIn * 1000);
    refresh.set(refreshToken, clientId);
    return json({ access_token: accessToken, token_type: 'Bearer', expires_in: stub.expiresIn, refresh_token: refreshToken });
  };

  /** The client a token request authenticates as (basic or post), or null. */
  const authenticateClient = (request: Request, form: URLSearchParams): Client | null => {
    let id = form.get('client_id');
    let secret = form.get('client_secret');
    const basic = request.headers.get('authorization');
    if (basic?.startsWith('Basic ')) {
      const [user, pass] = Buffer.from(basic.slice(6), 'base64').toString().split(':');
      id = decodeURIComponent(user ?? '');
      secret = decodeURIComponent(pass ?? '');
    }
    const client = id ? clients.get(id) : undefined;
    return client && client.secret === secret ? client : null;
  };

  registerService(OAUTH_STUB_ORIGIN, async (request) => {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path.startsWith('/.well-known/oauth-protected-resource')) {
      return json({ resource: OAUTH_STUB_URL, authorization_servers: [OAUTH_STUB_ORIGIN] });
    }
    if (path === '/.well-known/oauth-authorization-server') {
      return json({
        issuer: OAUTH_STUB_ORIGIN,
        authorization_endpoint: `${OAUTH_STUB_ORIGIN}/authorize`,
        token_endpoint: `${OAUTH_STUB_ORIGIN}/token`,
        ...(stub.dynamicRegistration ? { registration_endpoint: `${OAUTH_STUB_ORIGIN}/register` } : {}),
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
      });
    }
    if (path === '/register' && request.method === 'POST' && stub.dynamicRegistration) {
      const body = (await request.json()) as { redirect_uris?: string[] };
      const client: Client = {
        id: `dcr-${stub.registered.length + 1}`,
        secret: randomBytes(16).toString('hex'),
        redirectUris: body.redirect_uris ?? [],
      };
      clients.set(client.id, client);
      stub.registered.push(client);
      return json({ client_id: client.id, client_secret: client.secret, redirect_uris: client.redirectUris }, 201);
    }
    if (path === '/authorize') {
      const q = url.searchParams;
      const client = clients.get(q.get('client_id') ?? '');
      const redirectUri = q.get('redirect_uri') ?? '';
      if (!client || (client.redirectUris && !client.redirectUris.includes(redirectUri))) {
        return new Response('unknown client or redirect_uri', { status: 400 });
      }
      if (q.get('response_type') !== 'code' || q.get('code_challenge_method') !== 'S256') {
        return new Response('PKCE S256 required', { status: 400 });
      }
      stub.authorizeScopes.push(q.get('scope'));
      const code = `code-${randomBytes(8).toString('hex')}`;
      codes.set(code, {
        clientId: client.id,
        redirectUri,
        challenge: q.get('code_challenge') ?? '',
        scope: q.get('scope') ?? undefined,
      });
      const back = new URL(redirectUri);
      back.searchParams.set('code', code);
      if (q.get('state')) back.searchParams.set('state', q.get('state')!);
      return new Response(null, { status: 302, headers: { location: back.toString() } });
    }
    if (path === '/token' && request.method === 'POST') {
      const form = new URLSearchParams(await request.text());
      const grantType = form.get('grant_type') ?? '';
      stub.tokenRequests.push(grantType);
      const client = authenticateClient(request, form);
      if (!client) return json({ error: 'invalid_client' }, 401);
      if (grantType === 'authorization_code') {
        const grant = codes.get(form.get('code') ?? '');
        codes.delete(form.get('code') ?? '');
        if (!grant || grant.clientId !== client.id || grant.redirectUri !== form.get('redirect_uri')) {
          return tokenError('invalid_grant');
        }
        const verifier = form.get('code_verifier') ?? '';
        if (createHash('sha256').update(verifier).digest('base64url') !== grant.challenge) {
          return tokenError('invalid_grant');
        }
        return issue(client.id);
      }
      if (grantType === 'refresh_token') {
        const token = form.get('refresh_token') ?? '';
        if (refresh.get(token) !== client.id) return tokenError('invalid_grant');
        refresh.delete(token); // rotated: each refresh token works once
        return issue(client.id);
      }
      return tokenError('unsupported_grant_type');
    }
    if (path === '/mcp') {
      const bearer = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
      const expiresAt = access.get(bearer);
      if (!expiresAt || expiresAt <= Date.now()) {
        return new Response('unauthorized', {
          status: 401,
          headers: {
            'www-authenticate': `Bearer resource_metadata="${OAUTH_STUB_ORIGIN}/.well-known/oauth-protected-resource/mcp"`,
          },
        });
      }
      const server = mcpServer(stub.calls);
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      await server.connect(transport);
      try {
        return await transport.handleRequest(request);
      } finally {
        await transport.close();
      }
    }
    return new Response('not found', { status: 404 });
  });
  return stub;
}
