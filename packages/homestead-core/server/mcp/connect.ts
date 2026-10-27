/**
 * Connecting to a household MCP server (`superuser/mcp-servers`).
 *
 * One place attaches a server's token: it's read here, in-process, from the
 * credential the server references (`readCredential`), sent as a bearer header,
 * and goes nowhere else. Every request the client makes is address-checked
 * (`../net/mcp-url`), redirects are refused, and each step is bounded in time.
 * The connection is opened for one piece of work and closed after it.
 */

import { createMCPClient, type MCPClient } from '@ai-sdk/mcp';
import { referenceId } from '../../resources/references';
import { readCredential } from '../credentials';
import { assertMcpUrl, mcpFetch } from '../net/mcp-url';
import type { ListedTool } from '../../superuser/mcp-servers/tools';

/** Bounds each step: connecting, then the work done over the connection. */
const STEP_TIMEOUT_MS = 15_000;
/** `tools/list` pages to follow before giving up on a server that never stops. */
const MAX_TOOL_PAGES = 20;

/** The parts of an `mcp-server` record a connection needs. */
export interface McpServerTarget {
  url: string;
  /** `credentials/{id}` or a bare id. */
  credential?: string;
}

/** A connection failed for a reason fit to show a superuser. Never carries the token. */
export class McpConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'McpConnectionError';
  }
}

async function bounded<T>(work: Promise<T>, what: string, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new McpConnectionError(`timed out ${what}`)), ms);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function bearerHeaders(server: McpServerTarget): Record<string, string> | undefined {
  if (!server.credential) return undefined;
  const token = readCredential(referenceId(server.credential, 'credentials'));
  if (!token) {
    throw new McpConnectionError('its credential has no value — set one in Credentials');
  }
  return { Authorization: `Bearer ${token}` };
}

/** Open a connection to `server`, run `use` over it, and close it. */
export async function withMcpServer<T>(
  server: McpServerTarget,
  use: (client: MCPClient) => Promise<T>,
  timeoutMs = STEP_TIMEOUT_MS,
): Promise<T> {
  await assertMcpUrl(server.url);
  const client = await bounded(
    createMCPClient({
      clientName: 'homestead',
      transport: {
        type: 'http',
        url: server.url,
        headers: bearerHeaders(server),
        fetch: mcpFetch(),
        redirect: 'error',
      },
    }),
    'connecting',
    timeoutMs,
  );
  try {
    return await bounded(use(client), 'waiting for the server', timeoutMs);
  } finally {
    await client.close().catch(() => undefined);
  }
}

/** Every tool the server reports, following `tools/list` pagination. */
export async function listAllTools(client: MCPClient): Promise<ListedTool[]> {
  const tools: ListedTool[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_TOOL_PAGES; page++) {
    const result = await client.listTools(cursor ? { params: { cursor } } : undefined);
    tools.push(...(result.tools as ListedTool[]));
    cursor = result.nextCursor;
    if (!cursor) break;
  }
  return tools;
}

/** A connection error as one short line for the record's `last_error`. */
export function describeConnectionError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.length > 500 ? `${message.slice(0, 497)}...` : message;
}
