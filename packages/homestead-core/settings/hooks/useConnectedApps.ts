import { useQuery } from '@tanstack/react-query';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';

/**
 * One OAuth app the user has authorized through the `/oauth2` flow (an MCP
 * client, or any other connected app). Non-secret metadata only — the bearer
 * tokens live server-side, hashed.
 */
export interface ConnectedApp {
  client_id: string;
  client_name: string | null;
  /** Space-delimited scope granted to the latest session, or null (unscoped). */
  scope: string | null;
  audience: string | null;
  session_count: number;
  connected_at: string;
  expires_at: string;
}

/** Shared cache key so the disconnect mutation can invalidate this list. */
export const connectedAppsKey = queryKeys.app('settings').list({ type: 'connected-app' });

/**
 * The OAuth apps the current user has connected. Returns an empty list when the
 * authorization server isn't enabled (the route 404s), so the settings card can
 * render its empty state without special-casing; any other failure rejects so
 * the card can report it instead of passing it off as "nothing connected".
 */
export function useConnectedApps() {
  return useQuery({
    queryKey: connectedAppsKey,
    queryFn: async (): Promise<ConnectedApp[]> => {
      const token = aepbase.authStore.token;
      const userId = aepbase.getCurrentUser()?.id || '';
      const res = await fetch('/api/connections', {
        headers: { Authorization: `Bearer ${token}`, 'X-User-Id': userId },
      });
      if (res.status === 404) return [];
      if (!res.ok) {
        const detail = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(detail.error || `HTTP ${res.status}`);
      }
      const body = (await res.json()) as { apps?: ConnectedApp[] };
      return body.apps ?? [];
    },
  });
}
