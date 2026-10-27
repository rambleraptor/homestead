/**
 * What the OAuth sign-in methods share: superusers only, the server they're
 * addressed to, and its OAuth credential.
 *
 * Server-only: lives under `methods/`, so vite stubs it out of the browser bundle.
 */

import { HomesteadError } from '@rambleraptor/homestead-client';
import type { CustomMethodContext } from '../../../resources/types';
import { serverClient } from '../../../server/client';
import { loadOAuthCredential, OAuthConnectionError } from '../../../server/mcp/oauth';
import { MCP_SERVERS } from '../resources';
import type { McpServer } from '../types';

export const error = (status: number, message: string) =>
  Response.json({ error: { code: status, message } }, { status });

type Loaded =
  | { ok: true; server: McpServer; credential: NonNullable<Awaited<ReturnType<typeof loadOAuthCredential>>> }
  | { ok: false; response: Response };

/** The addressed server and its OAuth credential, or the response that refuses. */
export async function loadOAuthServer({ auth, id, verb }: CustomMethodContext): Promise<Loaded> {
  if (auth.user.type !== 'superuser') {
    return { ok: false, response: error(403, 'only superusers can connect an MCP server') };
  }
  if (!id) return { ok: false, response: error(400, `address a server: /mcp-servers/{id}:${verb}`) };
  let server: McpServer;
  try {
    server = await serverClient(auth.token).collection<McpServer>(MCP_SERVERS).get(id);
  } catch (err) {
    if (err instanceof HomesteadError && err.code === 404) {
      return { ok: false, response: error(404, `no MCP server "${id}"`) };
    }
    throw err;
  }
  const credential = server.credential ? await loadOAuthCredential(server.credential) : null;
  if (!credential || credential.kind !== 'oauth') {
    return { ok: false, response: error(400, `${server.name} doesn’t sign in with OAuth — its credential is a token`) };
  }
  return { ok: true, server, credential };
}

/** A sign-in failure as a response: what went wrong, in a line, never a token. */
export function signInFailure(err: unknown): Response {
  if (err instanceof OAuthConnectionError) return error(400, err.message);
  const message = err instanceof Error ? err.message : String(err);
  return error(502, `the sign-in failed: ${message.slice(0, 300)}`);
}
