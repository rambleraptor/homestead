import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { personalAccessTokensKey, type TokenScope } from './usePersonalAccessTokens';

export interface MintTokenInput {
  name: string;
  /** ISO timestamp; omit for a token that never expires. */
  expires_at?: string;
  scopes: TokenScope[];
}

export interface MintTokenResult {
  /** The plaintext secret — shown to the user exactly once. */
  token: string;
  id: string;
}

/**
 * Mint a personal access token. The server returns the secret a single time;
 * the caller must surface it immediately (it can never be recovered).
 */
export function useMintPersonalAccessToken() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { skipErrorToast: true },
    mutationFn: async (input: MintTokenInput): Promise<MintTokenResult> => {
      const userId = aepbase.getCurrentUser()?.id || '';
      const res = await aepbase.authorizedFetch('/api/tokens', {
        method: 'POST',
        headers: { 'X-User-Id': userId, 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error((detail as { error?: string }).error || `HTTP ${res.status}`);
      }
      return (await res.json()) as MintTokenResult;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: personalAccessTokensKey });
    },
  });
}
