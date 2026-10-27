/**
 * `POST /mcp-servers/{id}:refresh-tools` — connect to the server, fetch its
 * tools and instructions, and fold them into the record (`mergeTools`: a new
 * tool starts `off`, an existing one keeps its policy). Superusers only.
 *
 * A server that can't be reached isn't an error of this call: the record is
 * saved as `failing` with the reason, and returned, so the page can show it.
 *
 * Server-only: lives under `methods/`, so vite stubs it out of the browser bundle.
 */

import { HomesteadError } from '@rambleraptor/homestead-client';
import type { CustomMethodHandler } from '../../../resources/types';
import { serverClient } from '../../../server/client';
import { describeConnectionError, listAllTools, withMcpServer } from '../../../server/mcp/connect';
import { mergeTools } from '../tools';
import { MCP_SERVERS } from '../resources';
import type { McpServer } from '../types';

const error = (status: number, message: string) =>
  Response.json({ error: { code: status, message } }, { status });

const refreshTools: CustomMethodHandler = async ({ auth, id }) => {
  if (auth.user.type !== 'superuser') return error(403, 'only superusers can check an MCP server');
  if (!id) return error(400, 'address a server: /mcp-servers/{id}:refresh-tools');

  const servers = serverClient(auth.token).collection<McpServer>(MCP_SERVERS);
  let server: McpServer;
  try {
    server = await servers.get(id);
  } catch (err) {
    if (err instanceof HomesteadError && err.code === 404) return error(404, `no MCP server "${id}"`);
    throw err;
  }
  const checkedAt = new Date().toISOString();
  let patch: Record<string, unknown>;
  try {
    const reported = await withMcpServer(server, async (client) => ({
      tools: await listAllTools(client),
      instructions: client.instructions,
    }));
    patch = {
      tools: mergeTools(server.tools, reported.tools),
      instructions: reported.instructions ?? null,
      status: 'ok',
      last_error: null,
      last_checked_at: checkedAt,
    };
  } catch (err) {
    patch = { status: 'failing', last_error: describeConnectionError(err), last_checked_at: checkedAt };
  }
  return Response.json(await servers.record(id).update(patch));
};

export default refreshTools;
