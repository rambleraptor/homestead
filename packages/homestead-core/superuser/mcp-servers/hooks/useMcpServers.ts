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
import { CREDENTIALS } from '../../credentials/resources';
import type { McpCall, McpServer, McpServerFormData } from '../types';

const APP = 'mcp-servers';

export function useMcpServers() {
  return useResourceList<McpServer>(APP, 'mcp-server', MCP_SERVERS, { orderBy: 'name' });
}

/**
 * The servers shared with the viewer, for labelling the assistant's calls in
 * chat. Fetched only while `enabled` — when a message shows an MCP tool call.
 */
export function useSharedMcpServers({ enabled }: { enabled: boolean }) {
  return useQuery({
    queryKey: ['mcp-servers-shared'],
    queryFn: () => aepbase.list<McpServer>(MCP_SERVERS),
    enabled,
    staleTime: 5 * 60_000,
  });
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

/** The SPA page an OAuth provider sends the browser back to. */
export const OAUTH_CALLBACK_PATH = '/superuser/mcp-servers/oauth-callback';
const OAUTH_SERVER_KEY = 'homestead:mcp-oauth-server';

/** Park the server being connected; the callback page has no other way to know it. */
function rememberConnectingServer(id: string): void {
  try {
    window.sessionStorage.setItem(OAUTH_SERVER_KEY, id);
  } catch {
    // Storage unavailable: the callback page says to connect again.
  }
}

/** Read and clear the server being connected; null when none was parked. */
export function takeConnectingServer(): string | null {
  try {
    const id = window.sessionStorage.getItem(OAUTH_SERVER_KEY);
    window.sessionStorage.removeItem(OAUTH_SERVER_KEY);
    return id;
  } catch {
    return null;
  }
}

/**
 * Leaving for the provider's sign-in page. An object so the VM tier, which has
 * no provider to leave for, can follow the sign-in itself.
 */
export const providerNavigation = {
  go(url: string): void {
    window.location.assign(url);
  },
};

/** OAuth writes refresh the servers and credentials once they land. */
function useOAuthMutation<V, R>(key: string, mutationFn: (vars: V) => Promise<R>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: [key],
    mutationFn,
    gcTime: 0,
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.app(APP).resource('mcp-server').all() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.app('credentials').resource('credential').all() }),
      ]);
    },
  });
}

export interface SwitchToOAuthVars {
  server: McpServer;
  clientId?: string;
  clientSecret?: string;
  scope?: string;
}

/**
 * Switch a server to OAuth: a new `oauth` credential (with a pasted client, if
 * given) that the server then points at. Not the generic optimistic mutations:
 * a client secret must never sit in the persisted query cache.
 */
export function useSwitchToOAuth() {
  return useOAuthMutation('mcp-servers-switch-to-oauth', async ({ server, clientId, clientSecret, scope }: SwitchToOAuthVars) => {
    const userId = aepbase.getCurrentUser()?.id;
    const credential = await aepbase.create<{ id: string }>(CREDENTIALS, {
      name: `${server.name} sign-in`,
      description: `OAuth sign-in for the ${server.name} MCP server.`,
      kind: 'oauth',
      ...(clientId ? { oauth_client_id: clientId } : {}),
      ...(clientSecret ? { oauth_client_secret: clientSecret } : {}),
      ...(scope ? { oauth_scope: scope } : {}),
      ...(userId ? { created_by: `users/${userId}` } : {}),
    });
    return aepbase.update<McpServer>(MCP_SERVERS, server.id, { credential: `${CREDENTIALS}/${credential.id}` });
  });
}

/**
 * Start signing in: the provider's sign-in page, which the browser then goes
 * to. It comes back to {@link OAUTH_CALLBACK_PATH}.
 */
export function useConnectMcpServer() {
  return useOAuthMutation('mcp-servers-connect', async (id: string) => {
    const { authorization_url } = await customMethod<{ authorization_url: string }>(
      MCP_SERVERS,
      'connect',
      { redirect_uri: `${window.location.origin}${OAUTH_CALLBACK_PATH}` },
      { id },
    );
    rememberConnectingServer(id);
    return authorization_url;
  });
}

/** Finish a sign-in with what the provider sent back; resolves with the checked server. */
export function useFinishConnect() {
  return useOAuthMutation('mcp-servers-finish-connect', ({ id, code, state }: { id: string; code: string; state: string }) =>
    customMethod<McpServer>(MCP_SERVERS, 'finish-connect', { code, state }, { id }),
  );
}

export function useDisconnectMcpServer() {
  return useOAuthMutation('mcp-servers-disconnect', (id: string) =>
    customMethod<McpServer>(MCP_SERVERS, 'disconnect', undefined, { id }),
  );
}
