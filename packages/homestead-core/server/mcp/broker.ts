/**
 * The MCP broker: the one way any part of Homestead calls a tool on a
 * household MCP server (`superuser/mcp-servers`) — the assistant, an app, a
 * person through `:call-tool`.
 *
 * Every call is decided here, the same way, before anything leaves the box:
 *
 *  1. **The server must be shared with the caller.** Reading the `mcp-server`
 *     record (a share's View) lets you use its `read` tools; writing it (Can
 *     edit) lets you use its `ask` and `allow` tools too. Superusers reach all
 *     of them. (Who may *change* the server stays superusers-only.)
 *  2. **The tool's policy.** `off`, or anything unrecognized, never runs.
 *     `ask` runs only when the call says the person approved it.
 *  3. **The token** is attached in `./connect` and nowhere else.
 *  4. **The result is untrusted data** from outside the household — labelled
 *     so, and capped in size, before it goes anywhere.
 *  5. **Every call is logged** as an `mcp-call` row — who, which server and
 *     tool, a summary of the arguments, the conversation, the outcome — with a
 *     system token, so the person can't delete the record of their own call.
 */

import { referenceId } from '../../resources/references';
import { serverClient } from '../client';
import { canUseRecord } from '../collection-access';
import { withSystemToken } from '../system-token';
import { logger } from '../../utils/logger';
import { MCP_CALLS, MCP_SERVERS } from '../../superuser/mcp-servers/resources';
import { TOOL_POLICIES, type ToolPolicy } from '../../superuser/mcp-servers/tools';
import type { McpCallOutcome, McpServer } from '../../superuser/mcp-servers/types';
import { describeConnectionError, withMcpServer } from './connect';

/** The longest result text handed back; the rest is cut and flagged. */
export const MAX_RESULT_CHARS = 16_000;
/** The longest argument summary kept in the log. */
const MAX_LOGGED_ARGS = 500;

export interface McpCallRequest {
  /** The server: `mcp-servers/{id}` or a bare id. */
  server: string;
  tool: string;
  args?: Record<string, unknown>;
  /** Who the call is for. Their token decides what they may use. */
  caller: { token: string; userId: string };
  /** `conversations/{id}`, when the assistant makes the call. */
  conversation?: string;
  /** The person approved this call — the approval card, or calling it themselves. */
  approved?: boolean;
}

/** A tool's result, as data from outside the household. */
export interface McpToolResult {
  untrusted: true;
  /** "Home Assistant (MCP server)" — where it came from. */
  source: string;
  tool: string;
  /** The tool's output as text, capped at {@link MAX_RESULT_CHARS}. */
  content: string;
  truncated: boolean;
}

export type McpCallResult =
  | { outcome: 'ok'; result: McpToolResult }
  | { outcome: Exclude<McpCallOutcome, 'ok'>; error: string };

function isPolicy(value: unknown): value is ToolPolicy {
  return typeof value === 'string' && (TOOL_POLICIES as readonly string[]).includes(value);
}

/** Arguments as one short line for the log. */
export function summarizeArgs(args: Record<string, unknown> | undefined): string | undefined {
  if (!args || Object.keys(args).length === 0) return undefined;
  const text = JSON.stringify(args);
  return text.length > MAX_LOGGED_ARGS ? `${text.slice(0, MAX_LOGGED_ARGS - 3)}...` : text;
}

/** A `tools/call` result's content as capped text. Non-text parts are named, not inlined. */
export function resultText(content: unknown): { text: string; truncated: boolean } {
  const parts = Array.isArray(content) ? content : [];
  const text = parts
    .map((part) => {
      const p = part as { type?: string; text?: string; resource?: { text?: string; uri?: string } };
      if (p.type === 'text' && typeof p.text === 'string') return p.text;
      if (p.type === 'resource' && typeof p.resource?.text === 'string') return p.resource.text;
      return `[${p.type ?? 'unknown'} content omitted]`;
    })
    .join('\n');
  return text.length > MAX_RESULT_CHARS
    ? { text: text.slice(0, MAX_RESULT_CHARS), truncated: true }
    : { text, truncated: false };
}

interface LogEntry {
  serverId: string;
  serverName?: string;
  tool: string;
  callerId: string;
  conversation?: string;
  args?: Record<string, unknown>;
  outcome: McpCallOutcome;
  error?: string;
  durationMs?: number;
}

/**
 * Write one `mcp-call` row. Also for callers that decide an outcome themselves
 * — the assistant records a call the person declined as `denied`. Never throws:
 * a log that can't be written is reported, and doesn't undo the call.
 */
export async function recordMcpCall(entry: LogEntry): Promise<void> {
  try {
    await withSystemToken((token) =>
      serverClient(token)
        .collection(MCP_CALLS)
        .create({
          server: `${MCP_SERVERS}/${entry.serverId}`,
          ...(entry.serverName ? { server_name: entry.serverName } : {}),
          tool: entry.tool,
          caller: `users/${entry.callerId}`,
          ...(entry.conversation ? { conversation: entry.conversation } : {}),
          ...(summarizeArgs(entry.args) ? { arguments: summarizeArgs(entry.args) } : {}),
          outcome: entry.outcome,
          ...(entry.error ? { error: entry.error.slice(0, 1000) } : {}),
          ...(entry.durationMs !== undefined ? { duration_ms: Math.round(entry.durationMs) } : {}),
        }),
    );
  } catch (err) {
    logger.warn('could not record an MCP call', {
      server: entry.serverId,
      tool: entry.tool,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Load a server as the system, so a refusal can still name it in the log. */
async function loadServer(id: string): Promise<McpServer | null> {
  try {
    return await withSystemToken((token) => serverClient(token).collection<McpServer>(MCP_SERVERS).get(id));
  } catch {
    return null;
  }
}

/** Call a tool on a household MCP server for `request.caller`. Never throws. */
export async function callConnectionTool(request: McpCallRequest): Promise<McpCallResult> {
  const serverId = referenceId(request.server, MCP_SERVERS);
  const path = `${MCP_SERVERS}/${serverId}`;
  const { token, userId } = request.caller;
  const base = { serverId, tool: request.tool, callerId: userId, conversation: request.conversation, args: request.args };

  const refuse = async (error: string, serverName?: string): Promise<McpCallResult> => {
    await recordMcpCall({ ...base, serverName, outcome: 'refused', error });
    return { outcome: 'refused', error };
  };

  const server = await loadServer(serverId);
  // Unknown and not-shared read the same, so a refusal doesn't confirm a server
  // exists. Only a real server's refusals are logged: an unknown id is the
  // caller's text, and there's no server to file it under.
  const notShared = `no MCP server "${serverId}" is shared with you`;
  if (!server) return { outcome: 'refused', error: notShared };
  if (!(await canUseRecord(token, 'mcp-server', path, 'read'))) return refuse(notShared, server.name);
  const tool = server.tools?.find((t) => t.name === request.tool);
  const policy = tool && isPolicy(tool.policy) ? tool.policy : 'off';
  if (policy === 'off') {
    return refuse(`the tool "${request.tool}" isn't turned on for ${server.name}`, server.name);
  }
  if (policy !== 'read' && !(await canUseRecord(token, 'mcp-server', path, 'write'))) {
    return refuse(`${server.name} is shared with you to look things up only; "${request.tool}" can change things`, server.name);
  }
  if (policy === 'ask' && !request.approved) {
    return refuse(`"${request.tool}" on ${server.name} needs the person's approval first`, server.name);
  }

  const started = performance.now();
  try {
    const called = await withMcpServer(server, (client) =>
      client.callTool({ name: request.tool, arguments: request.args ?? {} }),
    );
    const durationMs = performance.now() - started;
    const { text, truncated } = resultText((called as { content?: unknown }).content);
    if ((called as { isError?: boolean }).isError) {
      const error = text.slice(0, 1000) || 'the tool reported an error';
      await recordMcpCall({ ...base, serverName: server.name, outcome: 'error', error, durationMs });
      return { outcome: 'error', error };
    }
    await recordMcpCall({ ...base, serverName: server.name, outcome: 'ok', durationMs });
    return {
      outcome: 'ok',
      result: { untrusted: true, source: `${server.name} (MCP server)`, tool: request.tool, content: text, truncated },
    };
  } catch (err) {
    const error = describeConnectionError(err);
    await recordMcpCall({
      ...base,
      serverName: server.name,
      outcome: 'error',
      error,
      durationMs: performance.now() - started,
    });
    return { outcome: 'error', error };
  }
}
