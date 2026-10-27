/**
 * `POST /mcp-servers/{id}:disconnect` — forget the server's OAuth sign-in: its
 * tokens are dropped (a pasted client stays), and the server reads as failing
 * until it's connected again. Superusers only.
 *
 * Server-only: lives under `methods/`, so vite stubs it out of the browser bundle.
 */

import type { CustomMethodHandler } from '../../../resources/types';
import { serverClient } from '../../../server/client';
import { disconnect } from '../../../server/mcp/oauth';
import { MCP_SERVERS } from '../resources';
import type { McpServer } from '../types';
import { loadOAuthServer } from './oauth-common';

const disconnectServer: CustomMethodHandler = async (ctx) => {
  const loaded = await loadOAuthServer(ctx);
  if (!loaded.ok) return loaded.response;
  await disconnect(loaded.credential.id);
  return Response.json(
    await serverClient(ctx.auth.token)
      .collection<McpServer>(MCP_SERVERS)
      .record(loaded.server.id)
      .update({ status: 'untested', last_error: null }),
  );
};

export default disconnectServer;
