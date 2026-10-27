/**
 * Labels for a tool call on an outside MCP server (`mcp_<server>__<tool>`):
 * the server's name and the tool's title, from the servers shared with the
 * viewer. Null for Homestead's own tools.
 */

import { useSharedMcpServers } from '@rambleraptor/homestead-core/superuser/mcp-servers/hooks/useMcpServers';
import { MCP_TOOL_PREFIX, mcpToolName } from '@rambleraptor/homestead-core/superuser/mcp-servers/tools';

export interface McpToolLabel {
  /** "Home Assistant", or "An outside service" when it isn't known here. */
  server: string;
  /** The tool's title, or its name. */
  tool: string;
}

/** Whether a tool part's type is a call to an outside MCP server. */
export function isMcpToolType(type: string): boolean {
  return type.startsWith(`tool-${MCP_TOOL_PREFIX}`);
}

export function useMcpToolLabel(type: string): McpToolLabel | null {
  const isMcp = isMcpToolType(type);
  const { data: servers } = useSharedMcpServers({ enabled: isMcp });
  if (!isMcp) return null;
  const name = type.slice('tool-'.length);
  for (const server of servers ?? []) {
    const tool = server.tools?.find((t) => mcpToolName(server.id, t.name) === name);
    if (tool) return { server: server.name, tool: tool.title ?? tool.name };
  }
  // Not shared with this viewer any more, or not loaded yet: the raw tool name.
  return { server: 'An outside service', tool: name.slice(name.indexOf('__') + 2) || name };
}
