import { useMutation, useQueryClient } from '@tanstack/react-query';
import { customMethod } from '@rambleraptor/homestead-core/api/aepbase';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import {
  useResourceCreate,
  useResourceDelete,
  useResourceList,
  useResourceUpdate,
} from '@rambleraptor/homestead-core/api/resourceHooks';
import { MCP_SERVERS } from '../resources';
import type { McpServer, McpServerFormData } from '../types';

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
