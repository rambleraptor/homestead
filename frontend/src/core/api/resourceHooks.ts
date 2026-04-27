/**
 * Generic React Query primitives for aepbase resources.
 *
 * aepbase exposes a uniform CRUD surface (list/get/create/update/remove with
 * an optional parent path), so the per-module hooks were all the same
 * boilerplate around a one-line `aepbase.*` call. These hooks collapse that
 * boilerplate while preserving:
 *  - The existing `queryKeys.module(moduleId)` cache key strategy, so
 *    invalidation/persistence behavior is unchanged.
 *  - Per-callsite typing (each module hook is a thin typed wrapper).
 *  - Escape hatches for the rare custom case (custom queryFn, transform,
 *    parent functions, additional invalidations).
 *
 * For the more involved offline / optimistic / temp-id pattern see
 * `offlineResource.ts`.
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
  type UseMutationOptions,
  type UseMutationResult,
  type UseQueryOptions,
  type UseQueryResult,
} from '@tanstack/react-query';
import { aepbase, type ParentPath } from '@/core/api/aepbase';
import { queryKeys } from '@/core/api/queryClient';

/** A parent path or a function that produces one (e.g. for current-user-scoped resources). */
export type ParentLike = ParentPath | (() => ParentPath | undefined);

function resolveParent(parent: ParentLike | undefined): ParentPath | undefined {
  if (!parent) return undefined;
  return typeof parent === 'function' ? parent() : parent;
}

// ----------------------------------------------------------------------------
// Queries
// ----------------------------------------------------------------------------

export interface UseAepListOptions<T>
  extends Omit<UseQueryOptions<T[], Error, T[], QueryKey>, 'queryKey' | 'queryFn'> {
  moduleId: string;
  parent?: ParentLike;
  /** Client-side sort applied after the list comes back. aepbase has no sort param. */
  sort?: (a: T, b: T) => number;
  /** Override the default queryFn (custom joins, N+1 fetches, normalization). */
  queryFn?: () => Promise<T[]>;
  /** Override the default queryKey (e.g. for parameterized lists). */
  queryKey?: QueryKey;
}

export function useAepList<T>(
  collection: string,
  options: UseAepListOptions<T>,
): UseQueryResult<T[], Error> {
  const { moduleId, parent, sort, queryFn, queryKey, ...rest } = options;
  const resolvedParent = resolveParent(parent);
  const key: QueryKey =
    queryKey ??
    (resolvedParent
      ? [...queryKeys.module(moduleId).all(), 'list', collection, resolvedParent]
      : queryKeys.module(moduleId).list());

  return useQuery<T[], Error, T[], QueryKey>({
    queryKey: key,
    queryFn: async () => {
      const items = queryFn
        ? await queryFn()
        : resolvedParent
          ? await aepbase.list<T>(collection, { parent: resolvedParent })
          : await aepbase.list<T>(collection);
      return sort ? [...items].sort(sort) : items;
    },
    ...rest,
  });
}

export interface UseAepGetOptions<T>
  extends Omit<UseQueryOptions<T, Error, T, QueryKey>, 'queryKey' | 'queryFn' | 'enabled'> {
  moduleId: string;
  parent?: ParentLike;
  enabled?: boolean;
  queryKey?: QueryKey;
  /** Override the default fetch (multi-step joins). */
  queryFn?: () => Promise<T>;
}

export function useAepGet<T>(
  collection: string,
  id: string | null | undefined,
  options: UseAepGetOptions<T>,
): UseQueryResult<T, Error> {
  const { moduleId, parent, enabled, queryKey, queryFn, ...rest } = options;
  const key: QueryKey = queryKey ?? queryKeys.module(moduleId).detail(id ?? '');

  return useQuery<T, Error, T, QueryKey>({
    queryKey: key,
    queryFn: async () => {
      if (!id) throw new Error(`${collection}: id is required`);
      if (queryFn) return queryFn();
      const resolvedParent = resolveParent(parent);
      return resolvedParent
        ? aepbase.get<T>(collection, id, { parent: resolvedParent })
        : aepbase.get<T>(collection, id);
    },
    enabled: enabled !== undefined ? enabled && !!id : !!id,
    ...rest,
  });
}

// ----------------------------------------------------------------------------
// Mutations
// ----------------------------------------------------------------------------

interface MutationDefaults {
  moduleId: string;
  /**
   * Override the default `[module(moduleId).all()]` invalidation set.
   * Useful when a hook lives outside the module cache namespace (e.g.
   * superuser hits `queryKeys.users` instead).
   */
  invalidateKeys?: readonly QueryKey[];
  /** Extra cache keys to invalidate after success (added to the default set). */
  invalidateAlso?: readonly QueryKey[];
}

function makeOnSuccess<TData, TVars>(
  queryClient: ReturnType<typeof useQueryClient>,
  defaults: MutationDefaults,
  user?: NonNullable<UseMutationOptions<TData, Error, TVars>['onSuccess']>,
): NonNullable<UseMutationOptions<TData, Error, TVars>['onSuccess']> {
  const baseKeys: readonly QueryKey[] =
    defaults.invalidateKeys ?? [queryKeys.module(defaults.moduleId).all()];
  return async (...args) => {
    await Promise.all(
      baseKeys.map((key) => queryClient.invalidateQueries({ queryKey: key })),
    );
    if (defaults.invalidateAlso) {
      await Promise.all(
        defaults.invalidateAlso.map((key) =>
          queryClient.invalidateQueries({ queryKey: key }),
        ),
      );
    }
    if (user) {
      const fn = user as (...a: unknown[]) => unknown;
      await fn(...args);
    }
  };
}

export interface UseAepCreateOptions<T, V>
  extends Omit<UseMutationOptions<T, Error, V>, 'mutationFn'>,
    MutationDefaults {
  parent?: ParentLike;
  /**
   * Map the caller's variables to the request body. Defaults to passing the
   * variables through (when they're already a plain object).
   */
  transform?: (vars: V) => Record<string, unknown> | FormData;
  /** Override the network call entirely (multi-step writes). */
  mutationFn?: (vars: V) => Promise<T>;
}

export function useAepCreate<T, V = Record<string, unknown>>(
  collection: string,
  options: UseAepCreateOptions<T, V>,
): UseMutationResult<T, Error, V> {
  const queryClient = useQueryClient();
  const {
    moduleId,
    parent,
    transform,
    mutationFn,
    invalidateKeys,
    invalidateAlso,
    onSuccess,
    ...rest
  } = options;

  return useMutation<T, Error, V>({
    mutationFn:
      mutationFn ??
      (async (vars: V) => {
        const body = transform
          ? transform(vars)
          : (vars as unknown as Record<string, unknown> | FormData);
        const resolvedParent = resolveParent(parent);
        return resolvedParent
          ? aepbase.create<T>(collection, body, { parent: resolvedParent })
          : aepbase.create<T>(collection, body);
      }),
    onSuccess: makeOnSuccess<T, V>(queryClient, { moduleId, invalidateKeys, invalidateAlso }, onSuccess),
    ...rest,
  });
}

export interface UseAepUpdateOptions<T, V extends { id: string }>
  extends Omit<UseMutationOptions<T, Error, V>, 'mutationFn'>,
    MutationDefaults {
  parent?: ParentLike;
  /** Map the variables' `data` to the wire body. Defaults to `vars.data` as-is. */
  transform?: (vars: V) => Record<string, unknown> | FormData;
  mutationFn?: (vars: V) => Promise<T>;
}

export function useAepUpdate<
  T,
  V extends { id: string } = { id: string; data: Record<string, unknown> },
>(
  collection: string,
  options: UseAepUpdateOptions<T, V>,
): UseMutationResult<T, Error, V> {
  const queryClient = useQueryClient();
  const {
    moduleId,
    parent,
    transform,
    mutationFn,
    invalidateKeys,
    invalidateAlso,
    onSuccess,
    ...rest
  } = options;

  return useMutation<T, Error, V>({
    mutationFn:
      mutationFn ??
      (async (vars: V) => {
        const body = transform
          ? transform(vars)
          : ((vars as unknown as { data?: Record<string, unknown> | FormData })
              .data as Record<string, unknown> | FormData);
        const resolvedParent = resolveParent(parent);
        return resolvedParent
          ? aepbase.update<T>(collection, vars.id, body, { parent: resolvedParent })
          : aepbase.update<T>(collection, vars.id, body);
      }),
    onSuccess: makeOnSuccess<T, V>(queryClient, { moduleId, invalidateKeys, invalidateAlso }, onSuccess),
    ...rest,
  });
}

export interface UseAepRemoveOptions<V = string>
  extends Omit<UseMutationOptions<void, Error, V>, 'mutationFn'>,
    MutationDefaults {
  parent?: ParentLike;
  /** Map the variables to the resource id. Defaults to `vars` itself for `V = string`. */
  getId?: (vars: V) => string;
  mutationFn?: (vars: V) => Promise<void>;
}

export function useAepRemove<V = string>(
  collection: string,
  options: UseAepRemoveOptions<V>,
): UseMutationResult<void, Error, V> {
  const queryClient = useQueryClient();
  const {
    moduleId,
    parent,
    getId,
    mutationFn,
    invalidateKeys,
    invalidateAlso,
    onSuccess,
    ...rest
  } = options;

  return useMutation<void, Error, V>({
    mutationFn:
      mutationFn ??
      (async (vars: V) => {
        const id = getId ? getId(vars) : (vars as unknown as string);
        const resolvedParent = resolveParent(parent);
        if (resolvedParent) {
          await aepbase.remove(collection, id, { parent: resolvedParent });
        } else {
          await aepbase.remove(collection, id);
        }
      }),
    onSuccess: makeOnSuccess<void, V>(
      queryClient,
      { moduleId, invalidateKeys, invalidateAlso },
      onSuccess,
    ),
    ...rest,
  });
}

// ----------------------------------------------------------------------------
// Convenience: aepbase resource path for `created_by` references
// ----------------------------------------------------------------------------

/** Build a `users/{id}` resource path for the current user, or undefined when unauthenticated. */
export function currentUserPath(): string | undefined {
  const id = aepbase.getCurrentUser()?.id;
  return id ? `users/${id}` : undefined;
}
