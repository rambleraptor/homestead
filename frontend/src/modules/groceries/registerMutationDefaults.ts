/**
 * Grocery mutation defaults — registered on the QueryClient so that paused
 * offline mutations can be resumed after a page reload.
 *
 * Both `groceries` (items) and `stores` are wired up via the generic
 * `createOfflineResource` factory in `@/core/api/offlineResource`. That
 * factory owns the optimistic update + temp-id reconciliation logic; this
 * file just supplies the per-collection shape (cache key, body builders,
 * how to apply optimistic mutations to the cached list).
 *
 * Exports retain their original names so the public surface used by hook
 * shells (`useCreateGroceryItem`, etc.) and the existing tests is unchanged.
 */

import type { QueryClient } from '@tanstack/react-query';
import { AepCollections } from '@/core/api/aepbase';
import {
  createOfflineResource,
  isTempId as _isTempId,
  newTempId as _newTempId,
  type CascadeSnapshot,
} from '@/core/api/offlineResource';
import { queryKeys } from '@/core/api/queryClient';
import type { GroceryItem, Store } from './types';

// ----------------------------------------------------------------------------
// Variable shapes (public — consumed by hook shells)
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
// Mutation keys (public — match the legacy names so the persister filter and
// `findAll({ mutationKey })` lookups in the test suite keep working).
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
// Helpers
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
// Resource definitions
// ----------------------------------------------------------------------------

const itemsResource = createOfflineResource<
  GroceryItem,
  CreateItemVars,
  UpdateItemVars,
  DeleteItemVars
>({
  collection: AepCollections.GROCERIES,
  moduleId: 'groceries',
  listKey: ITEMS_KEY,
  mutationKeys: {
    create: GroceryMutationKeys.createItem,
    update: GroceryMutationKeys.updateItem,
    remove: GroceryMutationKeys.deleteItem,
  },
  buildCreateBody: (vars) => ({
    name: vars.name,
    notes: vars.notes ?? '',
    store: vars.store ?? '',
    checked: false,
  }),
  buildOptimistic: (vars, tempId) => ({
    id: tempId,
    name: vars.name,
    notes: vars.notes ?? '',
    store: vars.store ?? '',
    checked: false,
    created: nowIso(),
    updated: nowIso(),
  }),
  applyOptimisticUpdate: (current, vars) =>
    current.map((it) =>
      it.id === vars.id ? { ...it, ...vars.data, updated: nowIso() } : it,
    ),
  applyOptimisticRemove: (current, id) => current.filter((it) => it.id !== id),
  sort: applyItemSort,
});

const storesResource = createOfflineResource<
  Store,
  CreateStoreVars,
  UpdateStoreVars,
  DeleteStoreVars
>({
  collection: AepCollections.STORES,
  moduleId: 'groceries',
  listKey: STORES_KEY,
  mutationKeys: {
    create: GroceryMutationKeys.createStore,
    update: GroceryMutationKeys.updateStore,
    remove: GroceryMutationKeys.deleteStore,
  },
  buildCreateBody: (vars) => ({
    name: vars.name,
    sort_order: vars.sort_order ?? 0,
  }),
  buildOptimistic: (vars, tempId) => ({
    id: tempId,
    name: vars.name,
    sort_order: vars.sort_order ?? 0,
    created: nowIso(),
    updated: nowIso(),
  }),
  applyOptimisticUpdate: (current, vars) =>
    current.map((s) =>
      s.id === vars.id ? { ...s, ...vars.data, updated: nowIso() } : s,
    ),
  applyOptimisticRemove: (current, id) => current.filter((s) => s.id !== id),
  sort: applyStoreSort,
  // Cascade: items pointing at the deleted store reappear under "No Store".
  onDeleteCascade: (queryClient, id): CascadeSnapshot => {
    const previousItems = queryClient.getQueryData<GroceryItem[]>(ITEMS_KEY) ?? [];
    queryClient.setQueryData<GroceryItem[]>(
      ITEMS_KEY,
      applyItemSort(
        previousItems.map((it) => (it.store === id ? { ...it, store: '' } : it)),
      ),
    );
    return {
      rollback: (qc) => qc.setQueryData<GroceryItem[]>(ITEMS_KEY, previousItems),
    };
  },
});

// ----------------------------------------------------------------------------
// Public API
// ----------------------------------------------------------------------------

export const TEMP_ID_PREFIX = 'tmp_';

export const newTempId = _newTempId;
export const isTempId = _isTempId;

/** For tests + a clean slate when the auth user changes. */
export function clearTempIdMaps(): void {
  itemsResource.clearTempIdMap();
  storesResource.clearTempIdMap();
}

export function registerGroceryMutationDefaults(queryClient: QueryClient): void {
  itemsResource.registerDefaults(queryClient);
  storesResource.registerDefaults(queryClient);
}
