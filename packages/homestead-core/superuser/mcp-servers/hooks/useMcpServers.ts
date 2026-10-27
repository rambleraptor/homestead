import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { aepbase, customMethod } from '@rambleraptor/homestead-core/api/aepbase';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import {
  useResourceCreate,
  useResourceDelete,
  useResourceList,
  useResourceUpdate,
} from '@rambleraptor/homestead-core/api/resourceHooks';
import { MCP_CALLS, MCP_SERVERS } from '../resources';
import type { McpCall, McpServer, McpServerFormData } from '../types';

const APP = 'mcp-servers';

export function useMcpServers() {
  return useResourceList<McpServer>(APP, 'mcp-server', MCP_SERVERS, { orderBy: 'name' });
}

export function useCreateMcpServer() {
  return useResourceCreate<McpServer, McpServerFormData & { created_by?: string }>(APP, 'mcp-server');
}

/** `{ id, data }`; send a field as `null` to clear it. */
export function useUpdateMcpServer() {
  return useResourceUpdate<McpServer>(APP, 'mcp-server');
}

export function useDeleteMcpServer() {
  return useResourceDelete(APP, 'mcp-server');
}

/**
 * Connect to a server and fetch its tools (`:refresh-tools`). Resolves with the
 * updated record — `status: 'failing'` and a `last_error` when the server
 * couldn't be reached, which the page shows rather than a toast.
 */
export function useRefreshMcpTools() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['mcp-servers-refresh'],
    mutationFn: (id: string) => customMethod<McpServer>(MCP_SERVERS, 'refresh-tools', undefined, { id }),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.app(APP).resource('mcp-server').all() }),
  });
}

/** How many of a server's calls the page shows. */
export const RECENT_CALLS = 20;

/**
 * A server's most recent calls from the `mcp-call` log, newest first. Fetched
 * each time the panel opens: calls are made server-side, by the assistant, and
 * the log isn't kept offline.
 */
export function useRecentMcpCalls(serverId: string, { enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['mcp-calls', serverId],
    queryFn: () =>
      aepbase.list<McpCall>(MCP_CALLS, {
        filter: `server == "${MCP_SERVERS}/${serverId}"`,
        orderBy: '-create_time',
        limit: RECENT_CALLS,
      }),
    enabled,
    staleTime: 0,
    gcTime: 0,
  });
}
