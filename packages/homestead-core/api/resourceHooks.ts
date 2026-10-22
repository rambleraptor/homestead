/**
 * Thin generic hooks over an AEP resource. Apps wrap these to expose
 * domain-specific names (e.g. `useCreditCards`, `useCreateCreditCard`,
 * `useRecipeImageUrl`) while the boilerplate — query keys, pagination,
 * optimistic mutation lifecycle, blob-URL plumbing — lives here once.
 *
 * - Reads: `useResourceList`, `useResourceItem`, `useFileFieldUrl`.
 * - Writes: `useResourceCreate`, `useResourceUpdate`, `useResourceDelete`
 *   (bind to the defaults registered via `registerResourceMutationDefaults`).
 */

import { useEffect, useState } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryOptions,
  type UseQueryResult,
} from '@tanstack/react-query';
import { aepbase, type ParentPath } from './aepbase';
import { logger } from '../utils/logger';
import { queryKeys } from './queryClient';
import { registerListShape } from './resourceEvents';
import {
  newTempId,
  resolveParentChainFromCache,
  resourceHasParents,
  resourceMutationKeys,
  type CreateVarsBase,
  type DeleteVars,
  type UpdateVars,
} from './registerResourceMutationDefaults';

// ----------------------------------------------------------------------------
// Reads
// ----------------------------------------------------------------------------

/** Extra `useQuery` options a caller may layer on (gcTime, refetchInterval…). */
type ExtraQueryOptions<TData> = Omit<
  UseQueryOptions<TData, Error>,
  'queryKey' | 'queryFn' | 'enabled'
>;

/**
 * Build a client-side comparator equivalent to an AEP `order_by` string, so a
 * list keeps the server's ordering even for the optimistic row the mutation
 * factory appends before a refetch confirms it. Same grammar as the wire
 * param: comma-separated fields, `-` prefix for descending, whitespace
 * insignificant. Only top-level fields are supported (dotted subfields are
 * ordered server-side only); unknown fields compare equal and fall through to
 * the next term.
 */
export function comparatorFromOrderBy<T>(orderBy: string): (a: T, b: T) => number {
  const terms = orderBy
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '')
    .map((s) => {
      const desc = s.startsWith('-');
      return { field: (desc ? s.slice(1) : s).trim(), dir: desc ? -1 : 1 };
    });

  const cmp = (a: unknown, b: unknown): number => {
    if (a == null && b == null) return 0;
    if (a == null) return -1;
    if (b == null) return 1;
    if (typeof a === 'string' || typeof b === 'string') {
      return String(a).localeCompare(String(b));
    }
    if (typeof a === 'boolean' || typeof b === 'boolean') {
      return Number(a) - Number(b);
    }
    return a < b ? -1 : a > b ? 1 : 0;
  };

  return (a, b) => {
    for (const { field, dir } of terms) {
      const c = cmp((a as Record<string, unknown>)[field], (b as Record<string, unknown>)[field]);
      if (c !== 0) return c * dir;
    }
    return 0;
  };
}

export interface ResourceListOptions<T, R = T> extends ExtraQueryOptions<R[]> {
  /** aepbase list filter, passed straight through. */
  filter?: string;
  /**
   * AEP `order_by` (e.g. `-create_time`, `name`). Sent to the engine for
   * server-side ordering AND, when no explicit `sort` is given, applied
   * client-side via `comparatorFromOrderBy` — so the optimistic row the
   * mutation factory appends lands in the right place before the next refetch.
   */
  orderBy?: string;
  /** Parent chain for a nested resource. */
  parent?: ParentPath;
  /** Per-page cap; the client follows pagination until exhausted. */
  maxPageSize?: number;
  /** Per-record transform applied before sorting (e.g. `create_time` → `created`). */
  map?: (record: T) => R;
  /**
   * Client-side comparator. Overrides the one derived from `orderBy` (use it
   * for computed or multi-source sorts). Applied to a copy — the fetched array
   * is not mutated.
   */
  sort?: (a: R, b: R) => number;
}

/**
 * Fetch a whole collection into `queryKeys.app(appId).resource(singular).list()`
 * — the exact slot the offline mutation factory writes optimistic updates to,
 * so list reads and writes stay coherent. Wrap it per app:
 *
 * ```ts
 * export const useRecipes = () =>
 *   useResourceList<Recipe>('recipes', 'recipe', RECIPES, { orderBy: '-create_time' });
 * ```
 */
export function useResourceList<T, R = T>(
  appId: string,
  singular: string,
  plural: string,
  options: ResourceListOptions<T, R> = {},
): UseQueryResult<R[], Error> {
  const { filter, orderBy, parent, maxPageSize, map, sort, ...queryOptions } = options;
  const comparator = sort ?? (orderBy ? comparatorFromOrderBy<R>(orderBy) : undefined);
  // Tell the change feed how this slot is built, so another device's edit can
  // be written straight into it (see resourceEvents.ts).
  registerListShape(appId, singular, {
    map: map as ((record: never) => unknown) | undefined,
    comparator: comparator as ((a: never, b: never) => number) | undefined,
    complete: !filter && !parent,
  });
  return useQuery<R[], Error>({
    queryKey: queryKeys.app(appId).resource(singular).list(),
    queryFn: async (): Promise<R[]> => {
      const records = await aepbase.list<T>(plural, { filter, orderBy, parent, maxPageSize });
      const mapped = map ? records.map(map) : (records as unknown as R[]);
      return comparator ? [...mapped].sort(comparator) : mapped;
    },
    ...queryOptions,
  });
}

export interface ResourceItemOptions<T> extends ExtraQueryOptions<T> {
  /** Parent chain for a nested resource. */
  parent?: ParentPath;
}

/**
 * Fetch a single record by id. The query is disabled while `id` is null, so
 * detail pages can call it unconditionally. Keyed by
 * `queryKeys.app(appId).resource(singular).detail(id)` — the exact slot the
 * mutation factory keeps in step with the list, so an edit shows up here
 * immediately (and offline, where the settle-time invalidation is skipped).
 */
export function useResourceItem<T>(
  appId: string,
  singular: string,
  plural: string,
  id: string | null,
  options: ResourceItemOptions<T> = {},
): UseQueryResult<T, Error> {
  const { parent, ...queryOptions } = options;
  return useQuery<T, Error>({
    queryKey: queryKeys.app(appId).resource(singular).detail(id ?? ''),
    queryFn: async (): Promise<T> => {
      if (!id) throw new Error('Resource id is required');
      return aepbase.get<T>(plural, id, { parent });
    },
    enabled: !!id,
    ...queryOptions,
  });
}

/**
 * Resolve a file-field to a blob URL the browser can render. aepbase's
 * `:download` endpoint is POST-only, so the bytes can't go straight into an
 * `<img src>` — they're fetched here, blob-URL'd, and revoked on unmount or
 * when the record/field changes. Wrap it per app:
 *
 * ```ts
 * export const useRecipeImageUrl = (recipe: Recipe | null | undefined) =>
 *   useFileFieldUrl(RECIPES, recipe?.id, 'image', recipe?.image);
 * ```
 *
 * `filename` is the field's stored value; passing it lets the URL refresh when
 * a new upload replaces the file. Returns null until the bytes resolve (and
 * whenever `id`/`filename` are absent).
 *
 * Pass `type` (the record's stored MIME type) whenever the caller knows it:
 * `:download` serves every file as `application/octet-stream`, and a blob URL
 * carrying that type is treated as an unknown download rather than something
 * to render — an `<iframe>` or a new tab turns into a download prompt instead
 * of an inline preview. `<img>` sniffs the bytes and survives without it;
 * PDFs do not.
 */
export function useFileFieldUrl(
  plural: string,
  id: string | null | undefined,
  field: string,
  filename: string | null | undefined,
  options: { parent?: ParentPath; type?: string | null } = {},
): string | null {
  const { parent, type } = options;
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !filename) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    let createdUrl: string | null = null;

    aepbase
      .download(plural, id, field, { parent })
      .then((blob) => {
        if (cancelled) return;
        // `slice` with a content type is the cheap way to re-label the bytes.
        const typed = type && blob.type !== type ? blob.slice(0, blob.size, type) : blob;
        createdUrl = URL.createObjectURL(typed);
        setUrl(createdUrl);
      })
      .catch((error) => {
        if (cancelled) return;
        logger.error('Failed to download file field', error, { plural, id, field });
      });

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
    // `parent` is a fresh array each render; callers pass a stable field set,
    // so key the effect on the primitive inputs that actually change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plural, id, field, filename, type]);

  return id && filename ? url : null;
}

/** Newest-first comparator for records carrying aepbase's `create_time`. */
export function byCreateTimeDesc<T extends { create_time?: string }>(a: T, b: T): number {
  return (b.create_time || '').localeCompare(a.create_time || '');
}

/** Oldest-first comparator for records carrying aepbase's `create_time`. */
export function byCreateTimeAsc<T extends { create_time?: string }>(a: T, b: T): number {
  return (a.create_time || '').localeCompare(b.create_time || '');
}

// ----------------------------------------------------------------------------
// Writes
// ----------------------------------------------------------------------------

/**
 * Create-mutation wrapper. The hook auto-injects a stable `tempId` on each
 * call so optimistic + persisted state share one handle through the queue.
 */
export function useResourceCreate<T, V extends object>(
  appId: string,
  singular: string,
): UseMutationResult<T, Error, V> & {
  mutate: (vars: V) => void;
  mutateAsync: (vars: V) => Promise<T>;
} {
  const keys = resourceMutationKeys(appId, singular);
  const mutation = useMutation<T, Error, V & CreateVarsBase>({
    mutationKey: keys.create as unknown as readonly unknown[],
  });

  return {
    ...mutation,
    mutate: (vars: V) =>
      mutation.mutate({ ...(vars as object), tempId: newTempId() } as V & CreateVarsBase),
    mutateAsync: (vars: V) =>
      mutation.mutateAsync({
        ...(vars as object),
        tempId: newTempId(),
      } as V & CreateVarsBase),
  } as UseMutationResult<T, Error, V> & {
    mutate: (vars: V) => void;
    mutateAsync: (vars: V) => Promise<T>;
  };
}

/** Update-mutation wrapper. Variables are `{ id, data }`. */
export function useResourceUpdate<T, U = Record<string, unknown>>(
  appId: string,
  singular: string,
): UseMutationResult<T | undefined, Error, UpdateVars<U>> {
  const keys = resourceMutationKeys(appId, singular);
  return useMutation<T | undefined, Error, UpdateVars<U>>({
    mutationKey: keys.update as unknown as readonly unknown[],
  });
}

/**
 * Delete-mutation wrapper. Public variables are the record id. For a nested
 * resource the wrapper resolves the aepbase URL parent chain from cache up
 * front (before the optimistic delete removes the record) and passes it in
 * the variables, so the chain persists into the offline queue and survives a
 * reload. Top-level resources pass the bare id unchanged.
 */
export function useResourceDelete(
  appId: string,
  singular: string,
): UseMutationResult<string, Error, string> {
  const queryClient = useQueryClient();
  const keys = resourceMutationKeys(appId, singular);
  const mutation = useMutation<string, Error, DeleteVars>({
    mutationKey: keys.delete as unknown as readonly unknown[],
  });

  const toVars = (id: string): DeleteVars => {
    if (!resourceHasParents(appId, singular)) return id;
    const parent = resolveParentChainFromCache(queryClient, appId, singular, id);
    return { id, parent };
  };

  return {
    ...mutation,
    mutate: (id: string, options?: Parameters<typeof mutation.mutate>[1]) =>
      mutation.mutate(toVars(id), options),
    mutateAsync: (id: string, options?: Parameters<typeof mutation.mutateAsync>[1]) =>
      mutation.mutateAsync(toVars(id), options),
  } as unknown as UseMutationResult<string, Error, string>;
}
