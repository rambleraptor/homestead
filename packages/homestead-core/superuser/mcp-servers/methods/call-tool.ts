/**
 * `POST /mcp-servers/{id}:call-tool` — call one of a server's tools yourself,
 * through the broker (`server/mcp/broker.ts`), with `{ tool, arguments }`.
 * Open to anyone the server is shared with, on the same terms as the
 * assistant: View for its "use freely" tools, Can edit for the rest. Calling
 * it is your approval, so an "ask first" tool runs. Every call is logged.
 *
 * Server-only: lives under `methods/`, so vite stubs it out of the browser bundle.
 */

import type { CustomMethodHandler } from '../../../resources/types';
import { callConnectionTool } from '../../../server/mcp/broker';

const error = (status: number, message: string) =>
  Response.json({ error: { code: status, message } }, { status });

const callTool: CustomMethodHandler = async ({ request, auth, id }) => {
  if (!id) return error(400, 'address a server: /mcp-servers/{id}:call-tool');
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return error(400, 'send a JSON body: { "tool": "<name>", "arguments": { ... } }');
  }
  const { tool, arguments: args } = (body ?? {}) as { tool?: unknown; arguments?: unknown };
  if (typeof tool !== 'string' || !tool) return error(400, '"tool" is required');
  if (args !== undefined && (args === null || typeof args !== 'object' || Array.isArray(args))) {
    return error(400, '"arguments" must be an object');
  }

  const called = await callConnectionTool({
    server: id,
    tool,
    args: args as Record<string, unknown> | undefined,
    caller: { token: auth.token, userId: auth.user.id },
    approved: true,
  });
  if (called.outcome === 'ok') return Response.json(called.result);
  if (called.outcome === 'error') return error(502, called.error);
  return error(403, called.error);
};

export default callTool;
