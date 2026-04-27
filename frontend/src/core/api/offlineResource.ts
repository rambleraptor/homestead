/**
 * Generic offline-capable resource for an aepbase collection.
 *
 * Encapsulates the QueryClient-registered mutation pattern that groceries
 * needs to survive a page reload mid-offline-queue:
 *  - Optimistic insert / update / remove with rollback on error.
 *  - Stable temp ids assigned at the call site, swapped to real server ids
 *    when the create resolves so subsequent updates/deletes targeting the
 *    same row are rewritten transparently.
 *  - Update / delete that target a still-pending temp id wait for (or cancel)
 *    the matching create rather than calling the server with a fake id.
 *  - `setMutationDefaults` so the mutation queue can be rehydrated by
 *    `PersistQueryClientProvider` after a reload — the call-site closure is
 *    gone at that point, so the mutationFn must live on the QueryClient.
 *
 * The default mutationKeys are scoped under `['module', moduleId, ...]` so
 * they pass the `isGroceryKey`-style filters in `persistQueryClient.ts`.
 *
 * For simple non-optimistic CRUD use `resourceHooks.ts` instead.
 */

import { onlineManager, type QueryClient, type QueryKey } from '@tanstack/react-query';
import { aepbase, type ParentPath } from '@/core/api/aepbase';
import { logger } from '@/core/utils/logger';

const TEMP_ID_PREFIX = 'tmp_';

export function newTempId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${TEMP_ID_PREFIX}${crypto.randomUUID()}`;
  }
  return `${TEMP_ID_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function isTempId(id: string): boolean {
  return id.startsWith(TEMP_ID_PREFIX);
}

// ----------------------------------------------------------------------------
// Public types
// ----------------------------------------------------------------------------

export interface OfflineResourceMutationKeys {
  create: readonly unknown[];
  update: readonly unknown[];
  remove: readonly unknown[];
}

export interface OfflineResourceConfig<
  T,
  CreateVars,
  UpdateVars,
  DeleteVars,
> {
  /** aepbase plural (URL segment). */
  collection: string;
  /** Module identifier — drives default mutation keys + invalidation. */
  moduleId: string;
  /** Cache key whose value is the optimistic list `T[]`. */
  listKey: QueryKey;
  /** Override the default mutation keys (defaults to `['module', moduleId, '<op>-<collection>']`). */
  mutationKeys?: OfflineResourceMutationKeys;
  /** Optional parent path for nested resources. */
  parent?: ParentPath;

  // ---- create ----
  /** Variables → request body sent to aepbase. */
  buildCreateBody: (vars: CreateVars) => Record<string, unknown> | FormData;
  /** Variables + tempId → optimistic record inserted into the cache list. */
  buildOptimistic: (vars: CreateVars, tempId: string) => T;
  /** Pull the stable temp id from the variables. Defaults to `vars.tempId`. */
  getCreateTempId?: (vars: CreateVars) => string;

  // ---- update ----
  /** Pull the resource id from the update variables. Defaults to `vars.id`. */
  getUpdateId?: (vars: UpdateVars) => string;
  /** Variables → wire body for the PATCH. Defaults to `vars.data`. */
  buildUpdateBody?: (vars: UpdateVars) => Record<string, unknown>;
  /** Apply the update to the cached list (returns a NEW array). */
  applyOptimisticUpdate: (current: T[], vars: UpdateVars) => T[];

  // ---- remove ----
  /** Pull the resource id from the delete variables. Defaults to identity for `string` vars. */
  getRemoveId?: (vars: DeleteVars) => string;
  /** Apply the deletion to the cached list (returns a NEW array). */
  applyOptimisticRemove: (current: T[], vars: DeleteVars) => T[];

  /** Re-applied after every cache write so list ordering stays consistent. */
  sort?: (items: T[]) => T[];

  /**
   * Optional cascade for delete (e.g. removing a store also re-homes any items
   * that referenced it). Runs inside the delete onMutate; the returned
   * snapshot is restored on error.
   */
  onDeleteCascade?: (
    queryClient: QueryClient,
    vars: DeleteVars,
  ) => CascadeSnapshot | undefined;
}

export interface CascadeSnapshot {
  rollback: (queryClient: QueryClient) => void;
}

export interface OfflineResource<T, CreateVars, UpdateVars, DeleteVars> {
  mutationKeys: OfflineResourceMutationKeys;
  /** Map of tempId → real server id. Used so callers can resolve ids in tests. */
  resolveId: (id: string) => string;
  /** Wipe the temp-id map (tests + auth changes). */
  clearTempIdMap: () => void;
  /** Register the three setMutationDefaults entries on the QueryClient. */
  registerDefaults: (queryClient: QueryClient) => void;
  /** Convenience re-exports so callers don't need a second import. */
  newTempId: () => string;
  isTempId: (id: string) => boolean;

  // Marker types (compile-time only) so TS can infer V on `useMutation` calls.
  _types?: { T: T; create: CreateVars; update: UpdateVars; remove: DeleteVars };
}

// ----------------------------------------------------------------------------
// Implementation
// ----------------------------------------------------------------------------

function defaultMutationKeys(
  moduleId: string,
  collection: string,
): OfflineResourceMutationKeys {
  return {
    create: ['module', moduleId, `create-${collection}`],
    update: ['module', moduleId, `update-${collection}`],
    remove: ['module', moduleId, `remove-${collection}`],
  };
}

export function createOfflineResource<
  T extends { id: string },
  CreateVars = Record<string, unknown>,
  UpdateVars = { id: string; data: Record<string, unknown> },
  DeleteVars = string,
>(
  config: OfflineResourceConfig<T, CreateVars, UpdateVars, DeleteVars>,
): OfflineResource<T, CreateVars, UpdateVars, DeleteVars> {
  const {
    collection,
    moduleId,
    listKey,
    parent,
    buildCreateBody,
    buildOptimistic,
    getCreateTempId = (vars) => (vars as unknown as { tempId: string }).tempId,
    getUpdateId = (vars) => (vars as unknown as { id: string }).id,
    buildUpdateBody = (vars) =>
      (vars as unknown as { data: Record<string, unknown> }).data,
    applyOptimisticUpdate,
    getRemoveId = (vars) => vars as unknown as string,
    applyOptimisticRemove,
    sort,
    onDeleteCascade,
  } = config;
  const mutationKeys = config.mutationKeys ?? defaultMutationKeys(moduleId, collection);

  const idMap = new Map<string, string>();
  const resolveId = (id: string): string => idMap.get(id) ?? id;
  const clearTempIdMap = (): void => idMap.clear();

  const applySort = (items: T[]): T[] => (sort ? sort(items) : items);

  function registerDefaults(queryClient: QueryClient): void {
    // ---- create ----------------------------------------------------------
    queryClient.setMutationDefaults(mutationKeys.create, {
      networkMode: 'online',
      mutationFn: async (vars: CreateVars) =>
        parent
          ? aepbase.create<T>(collection, buildCreateBody(vars), { parent })
          : aepbase.create<T>(collection, buildCreateBody(vars)),

      onMutate: async (vars: CreateVars) => {
        await queryClient.cancelQueries({ queryKey: listKey });
        const previous = queryClient.getQueryData<T[]>(listKey) ?? [];
        const tempId = getCreateTempId(vars);
        const optimistic = buildOptimistic(vars, tempId);
        queryClient.setQueryData<T[]>(listKey, applySort([...previous, optimistic]));
        return { previous };
      },

      onSuccess: (created: T, vars: CreateVars) => {
        const tempId = getCreateTempId(vars);
        idMap.set(tempId, created.id);
        const list = queryClient.getQueryData<T[]>(listKey) ?? [];
        queryClient.setQueryData<T[]>(
          listKey,
          applySort(list.map((it) => (it.id === tempId ? created : it))),
        );
      },

      onError: (error: Error, _vars: CreateVars, context: unknown) => {
        logger.error(`Failed to create ${collection}`, error);
        const ctx = context as { previous?: T[] } | undefined;
        if (ctx?.previous !== undefined) {
          queryClient.setQueryData<T[]>(listKey, ctx.previous);
        }
      },

      onSettled: () => {
        if (onlineManager.isOnline()) {
          queryClient.invalidateQueries({ queryKey: listKey });
        }
      },
    });

    // ---- update ----------------------------------------------------------
    queryClient.setMutationDefaults(mutationKeys.update, {
      networkMode: 'online',
      mutationFn: async (vars: UpdateVars) => {
        const realId = resolveId(getUpdateId(vars));
        if (isTempId(realId)) {
          // Backing create still pending — wait for it, then re-resolve.
          const matching = queryClient
            .getMutationCache()
            .findAll({ mutationKey: mutationKeys.create as unknown[] })
            .find(
              (m) =>
                getCreateTempId((m.state.variables ?? {}) as CreateVars) === realId,
            );
          if (matching) {
            await matching.continue().catch(() => undefined);
            const resolved = resolveId(getUpdateId(vars));
            if (!isTempId(resolved)) {
              return parent
                ? aepbase.update<T>(collection, resolved, buildUpdateBody(vars), { parent })
                : aepbase.update<T>(collection, resolved, buildUpdateBody(vars));
            }
          }
          throw new Error(
            `Cannot update ${collection} ${realId}: backing create has not resolved`,
          );
        }
        return parent
          ? aepbase.update<T>(collection, realId, buildUpdateBody(vars), { parent })
          : aepbase.update<T>(collection, realId, buildUpdateBody(vars));
      },

      onMutate: async (vars: UpdateVars) => {
        await queryClient.cancelQueries({ queryKey: listKey });
        const previous = queryClient.getQueryData<T[]>(listKey) ?? [];
        queryClient.setQueryData<T[]>(
          listKey,
          applySort(applyOptimisticUpdate(previous, vars)),
        );
        return { previous };
      },

      onError: (error: Error, _vars: UpdateVars, context: unknown) => {
        logger.error(`Failed to update ${collection}`, error);
        const ctx = context as { previous?: T[] } | undefined;
        if (ctx?.previous !== undefined) {
          queryClient.setQueryData<T[]>(listKey, ctx.previous);
        }
      },

      onSettled: () => {
        if (onlineManager.isOnline()) {
          queryClient.invalidateQueries({ queryKey: listKey });
        }
      },
    });

    // ---- remove ----------------------------------------------------------
    queryClient.setMutationDefaults(mutationKeys.remove, {
      networkMode: 'online',
      mutationFn: async (vars: DeleteVars) => {
        const id = getRemoveId(vars);
        const realId = resolveId(id);
        if (isTempId(realId)) {
          // Create still pending (or never landed). Cancel it and skip the
          // network call — there is nothing on the server to delete.
          queryClient
            .getMutationCache()
            .findAll({ mutationKey: mutationKeys.create as unknown[] })
            .filter(
              (m) =>
                getCreateTempId((m.state.variables ?? {}) as CreateVars) === realId,
            )
            .forEach((m) => m.destroy());
          return realId;
        }
        if (parent) {
          await aepbase.remove(collection, realId, { parent });
        } else {
          await aepbase.remove(collection, realId);
        }
        return realId;
      },

      onMutate: async (vars: DeleteVars) => {
        await queryClient.cancelQueries({ queryKey: listKey });
        const previous = queryClient.getQueryData<T[]>(listKey) ?? [];
        queryClient.setQueryData<T[]>(
          listKey,
          applySort(applyOptimisticRemove(previous, vars)),
        );
        const cascade = onDeleteCascade?.(queryClient, vars);
        return { previous, cascade };
      },

      onError: (error: Error, _vars: DeleteVars, context: unknown) => {
        logger.error(`Failed to delete ${collection}`, error);
        const ctx = context as
          | { previous?: T[]; cascade?: CascadeSnapshot }
          | undefined;
        if (ctx?.previous !== undefined) {
          queryClient.setQueryData<T[]>(listKey, ctx.previous);
        }
        ctx?.cascade?.rollback(queryClient);
      },

      onSettled: () => {
        if (onlineManager.isOnline()) {
          queryClient.invalidateQueries({ queryKey: listKey });
        }
      },
    });
  }

  return {
    mutationKeys,
    resolveId,
    clearTempIdMap,
    registerDefaults,
    newTempId,
    isTempId,
  };
}
