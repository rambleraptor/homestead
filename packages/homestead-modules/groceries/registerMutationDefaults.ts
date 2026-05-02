/**
 * Grocery mutation defaults — registered on the QueryClient so that paused
 * offline mutations can be resumed after a page reload.
 *
 * Why this file exists: when `PersistQueryClientProvider` rehydrates the
 * mutation queue, the original `useMutation` call site closure is gone — only
 * the serialized `variables` survive. The QueryClient must own the
 * `mutationFn` (plus its optimistic helpers) for replay to work. Hooks
 * (`useCreateGroceryItem`, …) are thin shells that reference these keys.
 *
 * The `tempId → realId` map below reconciles offline-created items: after a
 * create resolves, subsequent update/delete mutations that were queued
 * against the temp id rewrite their variables to target the server id.
 */

import type { QueryClient } from '@tanstack/react-query';
import { onlineManager } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { queryKeys } from '@/core/api/queryClient';
import { logger } from '@/core/utils/logger';
import type { GroceryItem, Store } from './types';

// ----------------------------------------------------------------------------
// Mutation keys
// ----------------------------------------------------------------------------

export const GroceryMutationKeys = {
  createItem: ['module', 'groceries', 'create-item'] as const,
  updateItem: ['module', 'groceries', 'update-item'] as const,
  deleteItem: ['module', 'groceries', 'delete-item'] as const,
  createStore: ['module', 'groceries', 'create-store'] as const,
  updateStore: ['module', 'groceries', 'update-store'] as const,
  deleteStore: ['module', 'groceries', 'delete-store'] as const,
};

// ----------------------------------------------------------------------------
// Variable shapes
// ----------------------------------------------------------------------------

export interface CreateItemVars {
  name: string;
  notes?: string;
  store?: string;
  /** Stable temp id assigned at the call site so optimistic updates and the
   *  resulting reconciliation share the same handle. */
  tempId: string;
}

export interface UpdateItemVars {
  id: string;
  data: Partial<{ name: string; notes: string; checked: boolean; store: string }>;
}

export type DeleteItemVars = string;

export interface CreateStoreVars {
  name: string;
  sort_order?: number;
  tempId: string;
}

export interface UpdateStoreVars {
  id: string;
  data: Partial<Pick<Store, 'name' | 'sort_order'>>;
}

export type DeleteStoreVars = string;

// ----------------------------------------------------------------------------
// Temp-id reconciliation maps (module-scoped, survive across mutation calls)
// ----------------------------------------------------------------------------

const itemIdMap = new Map<string, string>();
const storeIdMap = new Map<string, string>();

export const TEMP_ID_PREFIX = 'tmp_';

export function isTempId(id: string): boolean {
  return id.startsWith(TEMP_ID_PREFIX);
}

export function newTempId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${TEMP_ID_PREFIX}${crypto.randomUUID()}`;
  }
  return `${TEMP_ID_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/** Resolve a possibly-temp id to its real server id, or return as-is. */
function resolveItemId(id: string): string {
  return itemIdMap.get(id) ?? id;
}

function resolveStoreId(id: string): string {
  return storeIdMap.get(id) ?? id;
}

/** For tests + a clean slate when the auth user changes. */
export function clearTempIdMaps(): void {
  itemIdMap.clear();
  storeIdMap.clear();
}

// ----------------------------------------------------------------------------
// Cache helpers
// ----------------------------------------------------------------------------

const ITEMS_KEY = queryKeys.module('groceries').list();
const STORES_KEY = queryKeys.module('groceries').detail('stores');

function nowIso(): string {
  return new Date().toISOString();
}

function applyItemSort(items: GroceryItem[]): GroceryItem[] {
  return [...items].sort((a, b) => {
    if (a.checked !== b.checked) return a.checked ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
}

function applyStoreSort(stores: Store[]): Store[] {
  return [...stores].sort((a, b) => {
    const ao = a.sort_order ?? 0;
    const bo = b.sort_order ?? 0;
    if (ao !== bo) return ao - bo;
    return a.name.localeCompare(b.name);
  });
}

// ----------------------------------------------------------------------------
// Registration
// ----------------------------------------------------------------------------

export function registerGroceryMutationDefaults(queryClient: QueryClient): void {
  // ---- create-item -------------------------------------------------------

  queryClient.setMutationDefaults(GroceryMutationKeys.createItem, {
    networkMode: 'online',
    mutationFn: async (vars: CreateItemVars) => {
      logger.info(`Creating grocery item: ${vars.name}`);
      return aepbase.create<GroceryItem>(AepCollections.GROCERIES, {
        name: vars.name,
        notes: vars.notes ?? '',
        store: vars.store ?? '',
        checked: false,
      });
    },
    onMutate: async (vars: CreateItemVars) => {
      await queryClient.cancelQueries({ queryKey: ITEMS_KEY });
      const previous = queryClient.getQueryData<GroceryItem[]>(ITEMS_KEY) ?? [];
      const optimistic: GroceryItem = {
        id: vars.tempId,
        name: vars.name,
        notes: vars.notes ?? '',
        store: vars.store ?? '',
        checked: false,
        created: nowIso(),
        updated: nowIso(),
      };
      queryClient.setQueryData<GroceryItem[]>(
        ITEMS_KEY,
        applyItemSort([...previous, optimistic]),
      );
      return { previous };
    },
    onSuccess: (created, vars) => {
      itemIdMap.set(vars.tempId, created.id);
      // Replace the temp record with the server record so subsequent reads /
      // writes target the real id without waiting for a refetch.
      const list = queryClient.getQueryData<GroceryItem[]>(ITEMS_KEY) ?? [];
      queryClient.setQueryData<GroceryItem[]>(
        ITEMS_KEY,
        applyItemSort(list.map((it) => (it.id === vars.tempId ? created : it))),
      );
    },
    onError: (error, _vars, context) => {
      logger.error('Failed to create grocery item', error);
      if (context && (context as { previous?: GroceryItem[] }).previous !== undefined) {
        queryClient.setQueryData<GroceryItem[]>(
          ITEMS_KEY,
          (context as { previous: GroceryItem[] }).previous,
        );
      }
    },
    onSettled: () => {
      if (onlineManager.isOnline()) {
        queryClient.invalidateQueries({ queryKey: ITEMS_KEY });
      }
    },
  });

  // ---- update-item -------------------------------------------------------

  queryClient.setMutationDefaults(GroceryMutationKeys.updateItem, {
    networkMode: 'online',
    mutationFn: async (vars: UpdateItemVars) => {
      const realId = resolveItemId(vars.id);
      if (isTempId(realId)) {
        // Create not yet resolved — wait for the matching create mutation.
        const matching = queryClient
          .getMutationCache()
          .findAll({ mutationKey: GroceryMutationKeys.createItem })
          .find(
            (m) => (m.state.variables as CreateItemVars | undefined)?.tempId === realId,
          );
        if (matching) {
          await matching.continue().catch(() => undefined);
          const resolved = resolveItemId(vars.id);
          if (!isTempId(resolved)) {
            return aepbase.update<GroceryItem>(AepCollections.GROCERIES, resolved, vars.data);
          }
        }
        throw new Error(
          `Cannot update grocery item ${vars.id}: backing create has not resolved`,
        );
      }
      return aepbase.update<GroceryItem>(AepCollections.GROCERIES, realId, vars.data);
    },
    onMutate: async (vars: UpdateItemVars) => {
      await queryClient.cancelQueries({ queryKey: ITEMS_KEY });
      const previous = queryClient.getQueryData<GroceryItem[]>(ITEMS_KEY) ?? [];
      queryClient.setQueryData<GroceryItem[]>(
        ITEMS_KEY,
        applyItemSort(
          previous.map((it) =>
            it.id === vars.id ? { ...it, ...vars.data, updated: nowIso() } : it,
          ),
        ),
      );
      return { previous };
    },
    onError: (error, _vars, context) => {
      logger.error('Failed to update grocery item', error);
      if (context && (context as { previous?: GroceryItem[] }).previous !== undefined) {
        queryClient.setQueryData<GroceryItem[]>(
          ITEMS_KEY,
          (context as { previous: GroceryItem[] }).previous,
        );
      }
    },
    onSettled: () => {
      if (onlineManager.isOnline()) {
        queryClient.invalidateQueries({ queryKey: ITEMS_KEY });
      }
    },
  });

  // ---- delete-item -------------------------------------------------------

  queryClient.setMutationDefaults(GroceryMutationKeys.deleteItem, {
    networkMode: 'online',
    mutationFn: async (id: DeleteItemVars) => {
      const realId = resolveItemId(id);
      if (isTempId(realId)) {
        // Create still pending (or never landed). Cancel it and skip the
        // network call — there is nothing on the server to delete.
        queryClient
          .getMutationCache()
          .findAll({ mutationKey: GroceryMutationKeys.createItem })
          .filter(
            (m) => (m.state.variables as CreateItemVars | undefined)?.tempId === realId,
          )
          .forEach((m) => m.destroy());
        return;
      }
      await aepbase.remove(AepCollections.GROCERIES, realId);
    },
    onMutate: async (id: DeleteItemVars) => {
      await queryClient.cancelQueries({ queryKey: ITEMS_KEY });
      const previous = queryClient.getQueryData<GroceryItem[]>(ITEMS_KEY) ?? [];
      queryClient.setQueryData<GroceryItem[]>(
        ITEMS_KEY,
        previous.filter((it) => it.id !== id),
      );
      return { previous };
    },
    onError: (error, _vars, context) => {
      logger.error('Failed to delete grocery item', error);
      if (context && (context as { previous?: GroceryItem[] }).previous !== undefined) {
        queryClient.setQueryData<GroceryItem[]>(
          ITEMS_KEY,
          (context as { previous: GroceryItem[] }).previous,
        );
      }
    },
    onSettled: () => {
      if (onlineManager.isOnline()) {
        queryClient.invalidateQueries({ queryKey: ITEMS_KEY });
      }
    },
  });

  // ---- create-store ------------------------------------------------------

  queryClient.setMutationDefaults(GroceryMutationKeys.createStore, {
    networkMode: 'online',
    mutationFn: async (vars: CreateStoreVars) => {
      logger.info(`Creating store: ${vars.name}`);
      return aepbase.create<Store>(AepCollections.STORES, {
        name: vars.name,
        sort_order: vars.sort_order ?? 0,
      });
    },
    onMutate: async (vars: CreateStoreVars) => {
      await queryClient.cancelQueries({ queryKey: STORES_KEY });
      const previous = queryClient.getQueryData<Store[]>(STORES_KEY) ?? [];
      const optimistic: Store = {
        id: vars.tempId,
        name: vars.name,
        sort_order: vars.sort_order ?? 0,
        created: nowIso(),
        updated: nowIso(),
      };
      queryClient.setQueryData<Store[]>(
        STORES_KEY,
        applyStoreSort([...previous, optimistic]),
      );
      return { previous };
    },
    onSuccess: (created, vars) => {
      storeIdMap.set(vars.tempId, created.id);
      const list = queryClient.getQueryData<Store[]>(STORES_KEY) ?? [];
      queryClient.setQueryData<Store[]>(
        STORES_KEY,
        applyStoreSort(list.map((s) => (s.id === vars.tempId ? created : s))),
      );
    },
    onError: (error, _vars, context) => {
      logger.error('Failed to create store', error);
      if (context && (context as { previous?: Store[] }).previous !== undefined) {
        queryClient.setQueryData<Store[]>(
          STORES_KEY,
          (context as { previous: Store[] }).previous,
        );
      }
    },
    onSettled: () => {
      if (onlineManager.isOnline()) {
        queryClient.invalidateQueries({ queryKey: STORES_KEY });
      }
    },
  });

  // ---- update-store ------------------------------------------------------

  queryClient.setMutationDefaults(GroceryMutationKeys.updateStore, {
    networkMode: 'online',
    mutationFn: async (vars: UpdateStoreVars) => {
      const realId = resolveStoreId(vars.id);
      if (isTempId(realId)) {
        const matching = queryClient
          .getMutationCache()
          .findAll({ mutationKey: GroceryMutationKeys.createStore })
          .find(
            (m) => (m.state.variables as CreateStoreVars | undefined)?.tempId === realId,
          );
        if (matching) {
          await matching.continue().catch(() => undefined);
          const resolved = resolveStoreId(vars.id);
          if (!isTempId(resolved)) {
            return aepbase.update<Store>(AepCollections.STORES, resolved, vars.data);
          }
        }
        throw new Error(
          `Cannot update store ${vars.id}: backing create has not resolved`,
        );
      }
      return aepbase.update<Store>(AepCollections.STORES, realId, vars.data);
    },
    onMutate: async (vars: UpdateStoreVars) => {
      await queryClient.cancelQueries({ queryKey: STORES_KEY });
      const previous = queryClient.getQueryData<Store[]>(STORES_KEY) ?? [];
      queryClient.setQueryData<Store[]>(
        STORES_KEY,
        applyStoreSort(
          previous.map((s) =>
            s.id === vars.id ? { ...s, ...vars.data, updated: nowIso() } : s,
          ),
        ),
      );
      return { previous };
    },
    onError: (error, _vars, context) => {
      logger.error('Failed to update store', error);
      if (context && (context as { previous?: Store[] }).previous !== undefined) {
        queryClient.setQueryData<Store[]>(
          STORES_KEY,
          (context as { previous: Store[] }).previous,
        );
      }
    },
    onSettled: () => {
      if (onlineManager.isOnline()) {
        queryClient.invalidateQueries({ queryKey: STORES_KEY });
      }
    },
  });

  // ---- delete-store ------------------------------------------------------

  queryClient.setMutationDefaults(GroceryMutationKeys.deleteStore, {
    networkMode: 'online',
    mutationFn: async (id: DeleteStoreVars) => {
      const realId = resolveStoreId(id);
      if (isTempId(realId)) {
        queryClient
          .getMutationCache()
          .findAll({ mutationKey: GroceryMutationKeys.createStore })
          .filter(
            (m) => (m.state.variables as CreateStoreVars | undefined)?.tempId === realId,
          )
          .forEach((m) => m.destroy());
        return realId;
      }
      logger.info(`Deleting store: ${realId}`);
      await aepbase.remove(AepCollections.STORES, realId);
      return realId;
    },
    onMutate: async (id: DeleteStoreVars) => {
      await queryClient.cancelQueries({ queryKey: STORES_KEY });
      const previousStores = queryClient.getQueryData<Store[]>(STORES_KEY) ?? [];
      const previousItems = queryClient.getQueryData<GroceryItem[]>(ITEMS_KEY) ?? [];
      queryClient.setQueryData<Store[]>(
        STORES_KEY,
        previousStores.filter((s) => s.id !== id),
      );
      // Items pointing at this store reappear under "No Store".
      queryClient.setQueryData<GroceryItem[]>(
        ITEMS_KEY,
        applyItemSort(
          previousItems.map((it) => (it.store === id ? { ...it, store: '' } : it)),
        ),
      );
      return { previousStores, previousItems };
    },
    onError: (error, _vars, context) => {
      logger.error('Failed to delete store', error);
      const ctx = context as
        | { previousStores?: Store[]; previousItems?: GroceryItem[] }
        | undefined;
      if (ctx?.previousStores !== undefined) {
        queryClient.setQueryData<Store[]>(STORES_KEY, ctx.previousStores);
      }
      if (ctx?.previousItems !== undefined) {
        queryClient.setQueryData<GroceryItem[]>(ITEMS_KEY, ctx.previousItems);
      }
    },
    onSettled: () => {
      if (onlineManager.isOnline()) {
        queryClient.invalidateQueries({ queryKey: STORES_KEY });
        queryClient.invalidateQueries({ queryKey: ITEMS_KEY });
      }
    },
  });
}
