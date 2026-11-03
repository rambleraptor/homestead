import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { personalAccessTokensKey } from './usePersonalAccessTokens';

/**
 * Revoke a personal access token. Goes through the dedicated route (not a plain
 * record delete) so the bearer secret and the token's grants are torn down too.
 */
export function useRevokePersonalAccessToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const userId = aepbase.getCurrentUser()?.id || '';
      const res = await aepbase.authorizedFetch(`/api/tokens/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { 'X-User-Id': userId },
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error((detail as { error?: string }).error || `HTTP ${res.status}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: personalAccessTokensKey });
    },
  });
}
