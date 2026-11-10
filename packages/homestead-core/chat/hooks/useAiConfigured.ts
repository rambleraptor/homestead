import { useQuery } from '@tanstack/react-query';
import { fetchOrNetworkError } from '@rambleraptor/homestead-core/api/connectivity';
import { useOnlineStatus } from '@rambleraptor/homestead-core/shared/hooks/useOnlineStatus';

/** Where the last answer is kept on the device, for a start with no connection. */
export const AI_CONFIGURED_STORAGE_KEY = 'homestead:ai-configured';

function remembered(): boolean | undefined {
  try {
    const saved = localStorage.getItem(AI_CONFIGURED_STORAGE_KEY);
    return saved === null ? undefined : saved === 'true';
  } catch {
    return undefined;
  }
}

function remember(configured: boolean): void {
  try {
    localStorage.setItem(AI_CONFIGURED_STORAGE_KEY, String(configured));
  } catch {
    // Storage is a convenience here; without it an offline start just doesn't know.
  }
}

/**
 * Whether the server has an AI provider configured (`GET /api/chat`, no model
 * call). `undefined` while it's being asked; `false` when the server says so
 * or answers with an error.
 *
 * A request that never reached the server is not an answer: being offline must
 * not read as "the assistant isn't set up". The query then waits for the
 * connection (the default retry) and, while offline, this gives the last
 * answer the server gave on this device — `undefined` if it never has. Online
 * the remembered answer is never used: the server is about to say.
 */
export function useAiConfigured(): boolean | undefined {
  const { data } = useQuery({
    queryKey: ['chat', 'status'],
    queryFn: async () => {
      const res = await fetchOrNetworkError('/api/chat');
      let configured = false;
      if (res.ok) {
        try {
          configured = !!((await res.json()) as { configured?: boolean }).configured;
        } catch {
          configured = false;
        }
      }
      remember(configured);
      return configured;
    },
    staleTime: 60_000,
  });
  const { isOffline } = useOnlineStatus();
  return data ?? (isOffline ? remembered() : undefined);
}
