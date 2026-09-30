/**
 * React Query Configuration
 *
 * Centralized configuration for TanStack Query (React Query)
 * Used for async state management and caching of aepbase data
 */

import { MutationCache, QueryClient, type DefaultOptions } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getAepErrorMessage } from './errorMessage';
import { isNetworkError, reportNetworkFailure } from './connectivity';

/**
 * Per-mutation opt-outs the global error handler understands. Attach via a
 * mutation's `meta`, e.g. `useMutation({ meta: { skipErrorToast: true } })`.
 */
export interface AppMutationMeta extends Record<string, unknown> {
  /** Suppress the automatic error toast (the caller shows its own message). */
  skipErrorToast?: boolean;
  /** Override the message shown in the automatic error toast. */
  errorMessage?: string;
}

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: AppMutationMeta;
  }
}

/**
 * Default query options for all queries
 */
const defaultQueryOptions: DefaultOptions = {
  queries: {
    // Refetch on window focus in development, not in production
    refetchOnWindowFocus: process.env.NODE_ENV !== 'production',

    // Retry a failed query once. A request that never reached the server
    // instead flips the app offline and keeps retrying: with `offlineFirst`
    // the retry pauses until the probe sees the server again, and the cached
    // data stays on screen instead of an error.
    retry: (failureCount, error) => {
      if (isNetworkError(error)) {
        reportNetworkFailure();
        return true;
      }
      return failureCount < 1;
    },

    // Consider data stale after 5 minutes
    staleTime: 5 * 60 * 1000,

    // Keep unused data in cache for 10 minutes
    gcTime: 10 * 60 * 1000,

    // Refetch on mount if data is stale
    refetchOnMount: true,

    // Refetch when the network comes back so persisted caches are reconciled
    // with whatever the server now has (including offline mutation replay).
    refetchOnReconnect: true,

    // Return cached data immediately when offline instead of staying in
    // `paused`. Persisted grocery queries remain visible on cold offline load.
    networkMode: 'offlineFirst',
  },
  mutations: {
    // No automatic retry. The resource factory's create/update/delete opt
    // back in for network failures only (see registerResourceMutationDefaults
    // and connectivity.ts) — their replays are safe; an arbitrary custom
    // method's may not be.
    retry: 0,

    // Default 'online' mode: when offline, mutations are paused (variables
    // captured + onMutate runs for optimistic UI) and the mutationFn does
    // NOT fire until the connection returns. 'offlineFirst' would fire
    // immediately and only pause *retries*, which defeats the queue.
    networkMode: 'online',
  },
};

/**
 * Every failed mutation surfaces a standardized AEP error toast, so writes
 * report failures consistently across Homestead without each call site
 * wiring its own catch. Callers opt out (or override the text) via a
 * mutation's `meta` (see {@link AppMutationMeta}). Reads are left to their
 * own inline error UI and are intentionally not toasted here.
 */
const mutationCache = new MutationCache({
  onError: (error, _variables, _context, mutation) => {
    // The request never reached the server: show the offline state (and start
    // probing for the way back) so the user knows why nothing saved.
    if (isNetworkError(error)) reportNetworkFailure();
    const meta = mutation.meta;
    if (meta?.skipErrorToast) return;
    toast.error(meta?.errorMessage ?? getAepErrorMessage(error));
  },
});

/**
 * Create and configure React Query client
 */
export const queryClient = new QueryClient({
  mutationCache,
  defaultOptions: defaultQueryOptions,
});

/**
 * Query key factory for consistent query keys across the app
 */
export const queryKeys = {
  // Auth
  auth: {
    user: () => ['auth', 'user'] as const,
    session: () => ['auth', 'session'] as const,
  },

  // Users
  users: {
    all: () => ['users'] as const,
    list: (filters?: Record<string, unknown>) => ['users', 'list', filters] as const,
    detail: (id: string) => ['users', 'detail', id] as const,
  },

  // Roles
  roles: {
    all: () => ['roles'] as const,
    detail: (role: string) => ['roles', 'detail', role] as const,
  },

  // App Permissions
  appPermissions: {
    all: () => ['app_permissions'] as const,
    byUser: (userId: string) => ['app_permissions', 'user', userId] as const,
    byApp: (appId: string) => ['app_permissions', 'app', appId] as const,
  },

  // App-specific keys (can be extended by apps)
  app: (appId: string) => ({
    all: () => ['app', appId] as const,
    list: (filters?: Record<string, unknown>) => ['app', appId, 'list', filters] as const,
    detail: (id: string) => ['app', appId, 'detail', id] as const,
    /**
     * Per-resource list/detail under an app — one cache slot per
     * `(appId, singular)`. The offline mutation factory uses this
     * shape by default so an app can declare multiple resources
     * (e.g. groceries owns both `grocery` and `store`) without them
     * sharing a cache slot. Read hooks (`useGroceries`, `useStores`,
     * `useCreditCards`) use these keys too so they read from the
     * same place the factory writes.
     */
    resource: (singular: string) => ({
      all: () => ['app', appId, singular] as const,
      list: () => ['app', appId, singular, 'list'] as const,
      detail: (id: string) => ['app', appId, singular, 'detail', id] as const,
    }),
  }),
} as const;

/**
 * Helper to invalidate all app-related queries
 */
export function invalidateAppQueries(appId: string) {
  return queryClient.invalidateQueries({
    queryKey: queryKeys.app(appId).all(),
  });
}

/**
 * Helper to invalidate user-related queries
 */
export function invalidateUserQueries() {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.auth.user() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.users.all() }),
  ]);
}

/**
 * Helper to prefetch data (useful for optimistic navigation)
 */
export async function prefetchAppData(
  appId: string,
  queryFn: () => Promise<unknown>
) {
  await queryClient.prefetchQuery({
    queryKey: queryKeys.app(appId).all(),
    queryFn,
  });
}
