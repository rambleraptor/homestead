/**
 * First-party MCP server at `/api/mcp` (Streamable HTTP).
 *
 * A thin OAuth 2.1 resource server: each request's bearer token is validated
 * against the auth service (audience-bound to this resource), then the AI
 * chat's tools are re-exposed over MCP, executed under the caller's token. The
 * server is stateless and rebuilt per request so tools bind to that caller —
 * exactly like `handleChat` rebuilds tools per request.
 *
 * Clients authorize with zero manual steps: an unauthenticated request returns
 * 401 with a `WWW-Authenticate` pointer to the protected-resource metadata,
 * from which the client discovers the authorization server, self-registers
 * (DCR) and runs the consent flow.
 */

import { Hono } from 'hono';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { AuthServerConfig } from '@rambleraptor/homestead-core/apps/config';
import type { ResourceDefinition } from '@rambleraptor/homestead-core/resources/types';
import { visibleToModel } from '@rambleraptor/homestead-core/resources/model-tools';
import { modelResourcesFor } from '@rambleraptor/homestead-core/server/collection-access';
import type { Engine } from '../engine/engine';
import { verifyAccessToken, unauthorizedResponse } from '../auth/oauth/verify';
import { accessJwtLog } from '../auth/access-jwt';
import type { RequestAuthenticator } from '../auth/authenticator';
import { buildAuthenticators } from '../auth/providers';
import { getUserByEmail } from '../engine/users';
import { mintTokenForUser } from '../bootstrap';
import { buildSurface, registerHomesteadTools } from '../mcp/register';
import type { McpToolMode } from '@rambleraptor/homestead-core/server/chat/surface';
import { scopeAllowsWrite } from '../auth/scopes';
import { readAppFlag } from '../app-flags';

/** The resource identifier MCP tokens are audience-bound to. */
export function mcpAudience(issuerUrl: string): string {
  return `${issuerUrl.replace(/\/+$/, '')}/api/mcp`;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version',
} as const;

/** How a request to `/api/mcp` was authenticated, resolved to a caller token. */
interface ResolvedCaller {
  /** A bearer token the engine accepts for this caller. */
  token: string;
  /** The OAuth scope string, or null (Access-authenticated callers are unscoped). */
  scope: string | null;
  /** Release a token minted for this request; a no-op for a caller's own token. */
  release: () => void;
}

/** Options for {@link makeMcpRoute}; the authenticator override is a test seam. */
export interface McpRouteOptions {
  /**
   * Override the external-auth chain. Defaults to the authenticators built from
   * `cfg.externalAuth` (empty → OAuth only). Injected in tests so the route can
   * be exercised without a live JWKS endpoint.
   */
  authenticators?: RequestAuthenticator[];
}

function forbidden(message: string): Response {
  return new Response(JSON.stringify({ error: 'forbidden', message }), {
    status: 403,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

/**
 * The tool surface a `settings.mcp_tools` flag value selects.
 *
 * An unset flag (never configured, or a schema sync that hasn't run) reads as
 * undefined, so **this fallback is the real default** — the `default` declared
 * on the flag only seeds the Flag Management UI. The two have to agree; see
 * `homestead-core/settings/app.config.ts`.
 */
function toolMode(flag: unknown): McpToolMode {
  return flag === 'typed' || flag === 'generic' ? flag : 'resource';
}

/**
 * Build the `/api/mcp` route. `resolveDefs` yields the resource definitions to
 * expose as tools (the server passes the same union the chat handler uses); it
 * is injected rather than imported so the route stays decoupled from the app
 * registry and unit-testable.
 */
export function makeMcpRoute(
  engine: Engine,
  cfg: AuthServerConfig,
  resolveDefs: () => ResourceDefinition[],
  opts: McpRouteOptions = {},
): Hono {
  const audience = mcpAudience(cfg.issuerUrl);
  const authenticators = opts.authenticators ?? buildAuthenticators(cfg.externalAuth);
  const app = new Hono();

  app.options('/', () => new Response(null, { status: 204, headers: CORS_HEADERS }));

  /**
   * Resolve a request to a caller token. Tries the endpoint's own OAuth first
   * (an audience-bound bearer), then walks the external-auth chain in order:
   * the first authenticator that resolves an identity wins, and its email is
   * mapped to a Homestead user whose id backs a short-lived minted token.
   * Returns a Response to short-circuit (401/403) when nothing authenticates.
   */
  async function resolveCaller(req: Request): Promise<ResolvedCaller | Response> {
    const verified = verifyAccessToken(engine.db, req, { audience });
    if (verified) {
      return { token: verified.token, scope: verified.scope, release: () => {} };
    }
    if (authenticators.length === 0) {
      accessJwtLog.debug('no external authenticators configured (auth.authServer.externalAuth empty)');
    }
    for (const authenticator of authenticators) {
      const identity = await authenticator.authenticate(req);
      if (!identity) continue;
      const found = getUserByEmail(engine.db, identity.email);
      if (!found) {
        accessJwtLog.debug('no Homestead user for verified email', {
          email: identity.email,
          via: authenticator.name,
        });
        return forbidden(`no Homestead user for ${identity.email}`);
      }
      // The scope rides on the minted token, not just on the tool filter below:
      // the token is a valid bearer at every other door too.
      const minted = mintTokenForUser(engine.db, found.user.id, identity.scope);
      return { token: minted.token, scope: identity.scope ?? null, release: minted.revoke };
    }
    return unauthorizedResponse(cfg.issuerUrl, '/api/mcp');
  }

  app.all('/', async (c) => {
    const caller = await resolveCaller(c.req.raw);
    if (caller instanceof Response) return caller;

    // Less any resource a definition hides from MCP (`modelTools.mcp: false`),
    // and narrowed to what this caller can reach: a tool they can't use costs
    // the client's context on every turn and only ever earns a 403.
    const { defs, writable } = await modelResourcesFor(
      visibleToModel(resolveDefs(), 'mcp'),
      caller.token,
    );
    const write = scopeAllowsWrite(caller.scope) ? writable : false;
    // Read per request (not at mount) so flipping the flag in Flag Management
    // takes effect on the client's next tools/list, with no restart.
    const mode = toolMode(readAppFlag(engine, 'settings', 'mcp_tools'));
    // Built here rather than inside registration because the server needs the
    // surface's `instructions` at construction time; the same object is handed
    // to registerHomesteadTools below so it isn't built twice.
    const surface = mode === 'typed' ? undefined : buildSurface(defs, mode, write);

    // Stateless: no session id, one JSON response per request, fresh server +
    // transport each time (tools bind to this caller's token).
    const server = new McpServer(
      { name: 'homestead', version: '0.2.0' },
      // A derived surface tells the model how to call it — the generic one has
      // to carry the whole resource catalog, since its tool names no longer
      // name the resources; the per-resource one only has to explain `action`.
      surface ? { instructions: surface.instructions } : undefined,
    );
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    registerHomesteadTools(server, defs, caller.token, { write, mode, surface });
    await server.connect(transport);
    try {
      const res = await transport.handleRequest(c.req.raw);
      for (const [k, v] of Object.entries(CORS_HEADERS)) res.headers.set(k, v);
      return res;
    } finally {
      await transport.close();
      // Release any token minted for an Access-authenticated caller. The lease
      // defers the real delete until in-flight operations settle.
      caller.release();
    }
  });

  return app;
}
