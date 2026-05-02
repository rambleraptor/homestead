/**
 * React Query Configuration
 *
 * Centralized configuration for TanStack Query (React Query)
 * Used for async state management and caching of PocketBase data
 */

import { QueryClient, type DefaultOptions } from '@tanstack/react-query';

/**
 * Default query options for all queries
 */
const defaultQueryOptions: DefaultOptions = {
  queries: {
    // Refetch on window focus in development, not in production
    refetchOnWindowFocus: process.env.NODE_ENV !== 'production',

    // Retry failed queries 1 time
    retry: 1,

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
    // No automatic retry — offline writes pause and resume via onlineManager.
    retry: 0,

    // Default 'online' mode: when offline, mutations are paused (variables
    // captured + onMutate runs for optimistic UI) and the mutationFn does
    // NOT fire until the connection returns. 'offlineFirst' would fire
    // immediately and only pause *retries*, which defeats the queue.
    networkMode: 'online',
  },
};

/**
 * Create and configure React Query client
 */
export const queryClient = new QueryClient({
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

  // Module Permissions
  modulePermissions: {
    all: () => ['module_permissions'] as const,
    byUser: (userId: string) => ['module_permissions', 'user', userId] as const,
    byModule: (moduleId: string) => ['module_permissions', 'module', moduleId] as const,
  },

  // Module-specific keys (can be extended by modules)
  module: (moduleId: string) => ({
    all: () => ['module', moduleId] as const,
    list: (filters?: Record<string, unknown>) => ['module', moduleId, 'list', filters] as const,
    detail: (id: string) => ['module', moduleId, 'detail', id] as const,
  }),
} as const;

/**
 * Helper to invalidate all module-related queries
 */
export function invalidateModuleQueries(moduleId: string) {
  return queryClient.invalidateQueries({
    queryKey: queryKeys.module(moduleId).all(),
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
export async function prefetchModuleData(
  moduleId: string,
  queryFn: () => Promise<unknown>
) {
  await queryClient.prefetchQuery({
    queryKey: queryKeys.module(moduleId).all(),
    queryFn,
  });
}
