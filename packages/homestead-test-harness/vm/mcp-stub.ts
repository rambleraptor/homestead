/**
 * A stand-in for an outside MCP server — Home Assistant, say — served
 * in-process at {@link MCP_STUB_ORIGIN} through the fetch shim, so specs can
 * drive Homestead as an MCP *client* (`server/mcp/broker.ts`) through the real
 * Streamable HTTP exchange.
 *
 * It answers only requests carrying {@link MCP_STUB_TOKEN} as their bearer
 * token, and records every tool call it receives, so a spec can tell whether a
 * call reached the server at all. Point a spec's server at it with
 * `HOMESTEAD_MCP_TRUSTED_HOSTS` including {@link MCP_STUB_HOST}.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import { registerService } from './fetch-shim';

export const MCP_STUB_HOST = 'mcp-stub.test';
export const MCP_STUB_ORIGIN = `http://${MCP_STUB_HOST}`;
export const MCP_STUB_URL = `${MCP_STUB_ORIGIN}/mcp`;
export const MCP_STUB_TOKEN = 'mcp-stub-token-0123456789abcdef';

export interface StubCall {
  tool: string;
  arguments: Record<string, unknown>;
}

export interface McpStub {
  /** Tool calls the stub has received, oldest first. */
  calls: StubCall[];
}

/**
 * The stub's tools: `get_state` (reads), `turn_on` and `unlock` (change things), `fail`
 * (reports an error), `big` (returns `size` characters).
 */
function stubServer(calls: StubCall[]): McpServer {
  const server = new McpServer({ name: 'stub', version: '1.0.0' }, { instructions: 'A test home.' });
  const record = (tool: string, args: Record<string, unknown>) => calls.push({ tool, arguments: args });
  server.registerTool(
    'get_state',
    { description: 'Read a device’s state', inputSchema: { entity: z.string() }, annotations: { readOnlyHint: true } },
    async (args) => {
      record('get_state', args);
      return { content: [{ type: 'text', text: `${args.entity} is off` }] };
    },
  );
  server.registerTool('turn_on', { description: 'Turn a device on', inputSchema: { entity: z.string() } }, async (args) => {
    record('turn_on', args);
    return { content: [{ type: 'text', text: `${args.entity} is on` }] };
  });
  server.registerTool('unlock', { description: 'Unlock a door', inputSchema: { entity: z.string() } }, async (args) => {
    record('unlock', args);
    return { content: [{ type: 'text', text: `${args.entity} is unlocked` }] };
  });
  server.registerTool('fail', { description: 'Always fails' }, async () => {
    record('fail', {});
    return { isError: true, content: [{ type: 'text', text: 'the device is unreachable' }] };
  });
  server.registerTool('big', { description: 'Returns a lot', inputSchema: { size: z.number() } }, async (args) => {
    record('big', args);
    return { content: [{ type: 'text', text: 'x'.repeat(args.size) }] };
  });
  return server;
}

/** Serve the stub for the rest of this worker; returns its call log, emptied. */
export function installMcpStub(): McpStub {
  const stub: McpStub = { calls: [] };
  registerService(MCP_STUB_ORIGIN, async (request) => {
    if (request.headers.get('authorization') !== `Bearer ${MCP_STUB_TOKEN}`) {
      return new Response('unauthorized', { status: 401 });
    }
    const server = stubServer(stub.calls);
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
  });
  return stub;
}
