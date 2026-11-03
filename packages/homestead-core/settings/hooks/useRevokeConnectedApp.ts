import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { connectedAppsKey } from './useConnectedApps';

/**
 * Disconnect an OAuth app: revokes every access + refresh token that client
 * holds for the current user. Mirrors the PAT revoke route — a dedicated
 * endpoint, because the tokens live in the auth service's tables, not as plain
 * records the client can delete.
 */
export function useRevokeConnectedApp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (clientId: string): Promise<void> => {
      const userId = aepbase.getCurrentUser()?.id || '';
      const res = await aepbase.authorizedFetch(`/api/connections/${encodeURIComponent(clientId)}`, {
        method: 'DELETE',
        headers: { 'X-User-Id': userId },
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error((detail as { error?: string }).error || `HTTP ${res.status}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: connectedAppsKey });
    },
  });
}
