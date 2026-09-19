/**
 * Generic offline-capable mutation defaults for any aepbase resource.
 *
 * The factory binds three mutation keys per resource — `create-${singular}`,
 * `update-${singular}`, `delete-${singular}` — to a six-phase lifecycle on
 * the QueryClient: cancel → snapshot → optimistic write → mutationFn (with
 * temp-id resolution) → success/replace → error/rollback → settle/invalidate
 * (online only). Defaults must live on the QueryClient (not in a
 * `useMutation` closure) so paused mutations replay across a page reload
 * after `PersistQueryClientProvider` rehydrates them.
 *
 * Convention: each resource's list lives at
 * `queryKeys.app(appId).resource(singular).list()` and each record's detail
 * at `queryKeys.app(appId).resource(singular).detail(id)`. Read hooks query
 * those keys; the factory writes optimistic state to both, so a detail view
 * stays coherent with the list it was opened from — including offline, where
 * the settle-time invalidation is deliberately skipped. No per-app
 * `listQueryKey` override is necessary.
 */

import type { QueryClient, MutationOptions } from '@tanstack/react-query';
import { onlineManager } from '@tanstack/react-query';
import { aepbase, type ParentPath } from './aepbase';
import { queryKeys } from './queryClient';

// ---------------------------------------------------------------------------
// Temp-id helpers
// ---------------------------------------------------------------------------

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

// One reconciliation map per (appId, singular). Maps survive across
// QueryClients in the same JS realm so a page reload that recreates the
// client still finds prior temp→real mappings during queue replay.
const tempIdMaps = new Map<string, Map<string, string>>();

function tempIdMap(appId: string, singular: string): Map<string, string> {
  const key = `${appId}:${singular}`;
  let map = tempIdMaps.get(key);
  if (!map) {
    map = new Map();
    tempIdMaps.set(key, map);
  }
  return map;
}

/** Reset all temp-id maps. Test-only — runtime callers shouldn't need this. */
export function clearTempIdMaps(): void {
  tempIdMaps.clear();
}

// ---------------------------------------------------------------------------
// Resource metadata registry (drives convention-based nesting)
// ---------------------------------------------------------------------------

/**
 * Minimal per-resource metadata every registration self-publishes. The
 * nesting walk consults this to resolve a resource's ancestors at mutation
 * time — `providers.tsx` registers every resource at boot, so the registry
 * is complete long before any mutation fires.
 */
interface ResourceMeta {
  appId: string;
  singular: string;
  plural: string;
  parents: string[];
}

const resourceMetaRegistry = new Map<string, ResourceMeta>();

function metaKey(appId: string, singular: string): string {
  return `${appId}:${singular}`;
}

function metaFor(appId: string, singular: string): ResourceMeta | undefined {
  return resourceMetaRegistry.get(metaKey(appId, singular));
}

/**
 * FK field naming a parent on its child record. aepbase paths use kebab-case
 * singulars (`credit-card`) but stored/injected field names are snake_case
 * (`credit_card`), so the child's FK is the parent singular with dashes
 * swapped for underscores.
 */
export function parentFkField(parentSingular: string): string {
  return parentSingular.replace(/-/g, '_');
}

/** Reset the resource metadata registry. Test-only. */
export function clearResourceMetaRegistry(): void {
  resourceMetaRegistry.clear();
}

/**
 * Resolve the aepbase URL parent chain for an existing record, reading each
 * ancestor id from the convention list caches on `qc`. Used by the generic
 * `useResourceDelete` wrapper to capture the chain up front — before the
 * optimistic delete removes the record — so it rides in the (persisted)
 * mutation variables and survives an offline reload. Returns undefined for a
 * top-level resource or when the chain can't be resolved from cache.
 */
export function resolveParentChainFromCache(
  qc: QueryClient,
  appId: string,
  singular: string,
  id: string,
): ParentPath | undefined {
  const findRecord = (
    forSingular: string,
    recordId: string,
  ): Record<string, unknown> | undefined => {
    const key = queryKeys.app(appId).resource(forSingular).list();
    const list = qc.getQueryData<Array<{ id: string } & Record<string, unknown>>>(key);
    if (!list) return undefined;
    return (
      list.find((r) => r.id === recordId) ??
      list.find((r) => r.id === (tempIdMap(appId, forSingular).get(recordId) ?? recordId))
    );
  };

  const meta = metaFor(appId, singular);
  const primaryParent = meta?.parents[0];
  if (!primaryParent) return undefined;
  const rec = findRecord(singular, id);
  let curParentSingular: string | undefined = primaryParent;
  let curParentId = rec?.[parentFkField(primaryParent)] as string | undefined;
  if (!curParentId) return undefined;

  const chain: ParentPath = [];
  while (curParentSingular && curParentId) {
    const parentMeta = metaFor(appId, curParentSingular);
    if (!parentMeta) break;
    chain.unshift(
      parentMeta.plural,
      tempIdMap(appId, curParentSingular).get(curParentId) ?? curParentId,
    );
    const grandParentSingular = parentMeta.parents[0];
    if (!grandParentSingular) break;
    const parentRec = findRecord(curParentSingular, curParentId);
    curParentId = parentRec?.[parentFkField(grandParentSingular)] as string | undefined;
    curParentSingular = grandParentSingular;
  }
  return chain.length ? chain : undefined;
}

/** True when a resource declares any parent (i.e. is nested). */
export function resourceHasParents(appId: string, singular: string): boolean {
  return (metaFor(appId, singular)?.parents.length ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface CreateVarsBase {
  tempId: string;
}

export interface UpdateVars<U = Record<string, unknown>> {
  id: string;
  data: U;
}

/**
 * Delete variables. A bare id is enough for a top-level resource. Nested
 * resources need the aepbase URL parent chain, which the record's own cache
 * entry no longer yields once the optimistic delete has removed it — so the
 * generic `useResourceDelete` wrapper resolves it up front and passes the
 * object form, which also persists into the offline queue and survives a
 * reload.
 */
export type DeleteVars = string | { id: string; parent?: ParentPath };

export interface ResourceMutationKeys {
  create: readonly unknown[];
  update: readonly unknown[];
  delete: readonly unknown[];
}

export interface ResourceMutationOpts {
  appId: string;
  /** Resource singular, used in mutation keys (`create-${singular}`). */
  singular: string;
  /** aepbase collection plural (the URL segment). */
  plural: string;
  /**
   * Singulars of this resource's parent chain (as declared on the resource
   * definition, e.g. `['credit-card']` for a perk). The factory derives the
   * aepbase URL parent path by convention from these — resolving each
   * ancestor id from the create vars or the cached record — so nested
   * resources need no bespoke wiring. Empty/omitted for top-level resources.
   */
  parents?: string[];
}

// ---------------------------------------------------------------------------
// Key builder
// ---------------------------------------------------------------------------

export function resourceMutationKeys(
  appId: string,
  singular: string,
): ResourceMutationKeys {
  return {
    create: ['app', appId, `create-${singular}`] as const,
    update: ['app', appId, `update-${singular}`] as const,
    delete: ['app', appId, `delete-${singular}`] as const,
  };
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

function nowIso(): string {
  return new Date().toISOString();
}

function stripTempId<V extends CreateVarsBase>(vars: V): Record<string, unknown> {
  const { tempId: _temp, ...rest } = vars as unknown as Record<string, unknown> & {
    tempId: string;
  };
  void _temp;
  return rest;
}

export function registerResourceMutationDefaults<
  T extends { id: string } = { id: string } & Record<string, unknown>,
  C extends CreateVarsBase = CreateVarsBase & Record<string, unknown>,
  U = Record<string, unknown>,
>(qc: QueryClient, opts: ResourceMutationOpts): ResourceMutationKeys {
  const { appId, singular, plural, parents = [] } = opts;

  // Self-publish this resource's metadata so nested descendants can walk up
  // to it at mutation time (see `buildParentChain`).
  resourceMetaRegistry.set(metaKey(appId, singular), {
    appId,
    singular,
    plural,
    parents,
  });

  const listKey = queryKeys.app(appId).resource(singular).list();
  const detailKey = (id: string) => queryKeys.app(appId).resource(singular).detail(id);
  // Invalidate the whole app on settle — covers list reads, detail
  // reads, and any sibling resources that share computed state.
  const invalidateKey = queryKeys.app(appId).all();
  const idMap = tempIdMap(appId, singular);
  const keys = resourceMutationKeys(appId, singular);

  const resolveId = (id: string): string => idMap.get(id) ?? id;

  // Parent-FK fields (e.g. `credit_card` on a perk). They live on the
  // optimistic/cached record so compute hooks can join by them, but are
  // path-encoded on the wire and must never be sent in the request body.
  const parentFkFields = parents.map(parentFkField);
  const primaryParentSingular: string | undefined = parents[0];
  const primaryFkField: string | undefined = primaryParentSingular
    ? parentFkField(primaryParentSingular)
    : undefined;

  function stripParentFks(body: Record<string, unknown>): Record<string, unknown> {
    for (const field of parentFkFields) delete body[field];
    return body;
  }

  function buildBody(vars: C): Record<string, unknown> {
    const body = stripParentFks(stripTempId(vars));
    const userId = aepbase.getCurrentUser?.()?.id;
    if (userId && !('created_by' in body)) {
      body.created_by = `users/${userId}`;
    }
    return body;
  }

  // Find a record by id in another resource's convention list cache, tolerating
  // a temp↔real id mismatch (the cache may hold either during offline replay).
  function findCachedRecord(
    forSingular: string,
    id: string,
  ): Record<string, unknown> | undefined {
    const key = queryKeys.app(appId).resource(forSingular).list();
    const list = qc.getQueryData<Array<{ id: string } & Record<string, unknown>>>(key);
    if (!list) return undefined;
    return (
      list.find((r) => r.id === id) ??
      list.find((r) => r.id === (tempIdMap(appId, forSingular).get(id) ?? id))
    );
  }

  /**
   * Build the aepbase URL parent chain (`[plural, id, plural, id, ...]`,
   * root-first) for a record of `childSingular` whose immediate parent id is
   * `immediateParentId`. Walks up the declared `parents` chain, reading each
   * ancestor's own parent FK from its cached record. Temp parent ids are
   * mapped through the parent's temp-id map so a parent created offline (and
   * since reconciled) still resolves. Returns undefined for a top-level
   * resource or when the chain can't be resolved.
   */
  function buildParentChain(
    childSingular: string,
    immediateParentId: string | undefined,
  ): ParentPath | undefined {
    const childMeta = metaFor(appId, childSingular);
    let curParentSingular = childMeta?.parents[0];
    if (!curParentSingular || !immediateParentId) return undefined;

    const chain: ParentPath = [];
    let curParentId = immediateParentId;
    while (curParentSingular) {
      const parentMeta = metaFor(appId, curParentSingular);
      if (!parentMeta) break; // unknown ancestor (e.g. built-in `user`) — stop
      const resolvedId = tempIdMap(appId, curParentSingular).get(curParentId) ?? curParentId;
      chain.unshift(parentMeta.plural, resolvedId);

      const grandParentSingular = parentMeta.parents[0];
      if (!grandParentSingular) break;
      const parentRec = findCachedRecord(curParentSingular, curParentId);
      const grandParentId = parentRec?.[parentFkField(grandParentSingular)] as
        | string
        | undefined;
      if (!grandParentId) break;
      curParentSingular = grandParentSingular;
      curParentId = grandParentId;
    }
    return chain.length ? chain : undefined;
  }

  /** Parent chain for a create, whose immediate parent id rides in the vars. */
  function parentForCreate(vars: C): ParentPath | undefined {
    if (!primaryFkField) return undefined;
    const pid = (vars as unknown as Record<string, unknown>)[primaryFkField] as
      | string
      | undefined;
    return buildParentChain(singular, pid);
  }

  /**
   * Parent chain for an update/delete of an existing record — the immediate
   * parent id is read from the record's own cached FK. Delete callers pass a
   * chain in their vars instead (resolved before optimistic removal), so this
   * is the update path and a fallback.
   */
  function parentForExisting(id: string): ParentPath | undefined {
    if (!primaryFkField) return undefined;
    const rec = findCachedRecord(singular, id);
    const pid = rec?.[primaryFkField] as string | undefined;
    return buildParentChain(singular, pid);
  }

  function buildOptimistic(vars: C): T {
    const ts = nowIso();
    return {
      id: vars.tempId,
      ...stripTempId(vars),
      // aepbase records use create_time/update_time; PB-era types still
      // expose created/updated. Set both — extra fields are harmless on
      // shapes that don't declare them.
      create_time: ts,
      update_time: ts,
      created: ts,
      updated: ts,
    } as unknown as T;
  }

  /**
   * Write a record into the resource's detail slot, merging over whatever is
   * already there. Merging (rather than replacing) keeps any fields a read
   * hook layered on top of the raw record, and seeds the slot when the detail
   * view has never been opened — priming it for the next navigation.
   */
  function writeDetail(id: string, record: Partial<T>): void {
    qc.setQueryData<T>(detailKey(id), (prev) =>
      prev ? ({ ...prev, ...record } as T) : (record as T),
    );
  }

  /** Restore a detail slot snapshot taken in `onMutate` (undefined = clear). */
  function restoreDetail(id: string, previous: T | undefined): void {
    if (previous === undefined) {
      qc.removeQueries({ queryKey: detailKey(id), exact: true });
    } else {
      qc.setQueryData<T>(detailKey(id), previous);
    }
  }

  function findPendingCreate(tempId: string) {
    return qc
      .getMutationCache()
      .getAll()
      .find(
        (m) => (m.state.variables as CreateVarsBase | undefined)?.tempId === tempId,
      );
  }

  // ---- create -----------------------------------------------------------
  const createDef: MutationOptions<T, Error, C, { previous: T[] }> = {
    networkMode: 'online',
    mutationFn: async (vars: C) => {
      const body = buildBody(vars);
      const parent = parentForCreate(vars);
      return parent
        ? aepbase.create<T>(plural, body, { parent })
        : aepbase.create<T>(plural, body);
    },
    onMutate: async (vars: C) => {
      await qc.cancelQueries({ queryKey: listKey });
      const previous = qc.getQueryData<T[]>(listKey) ?? [];
      qc.setQueryData<T[]>(listKey, [...previous, buildOptimistic(vars)]);
      return { previous };
    },
    onSuccess: (created, vars) => {
      idMap.set(vars.tempId, created.id);
      const list = qc.getQueryData<T[]>(listKey) ?? [];
      qc.setQueryData<T[]>(
        listKey,
        list.map((r) => (r.id === vars.tempId ? created : r)),
      );
      // Prime the new record's detail slot so navigating straight into it
      // renders from cache instead of round-tripping for what we just got.
      writeDetail(created.id, created);
    },
    onError: (_error, _vars, context) => {
      if (context?.previous !== undefined) {
        qc.setQueryData<T[]>(listKey, context.previous);
      }
    },
    onSettled: () => {
      if (onlineManager.isOnline()) {
        qc.invalidateQueries({ queryKey: invalidateKey });
      }
    },
  };
  qc.setMutationDefaults(keys.create, createDef);

  // ---- update -----------------------------------------------------------
  const updateDef: MutationOptions<
    T | undefined,
    Error,
    UpdateVars<U>,
    { previous: T[]; previousDetail: T | undefined }
  > = {
    networkMode: 'online',
    mutationFn: async (vars: UpdateVars<U>) => {
      const realId = resolveId(vars.id);
      if (isTempId(realId)) {
        // Backing create still pending. Continue it before issuing the
        // update. tempIds are crypto-random so a global lookup is unambiguous.
        const matching = findPendingCreate(realId);
        if (matching) {
          await matching.continue().catch(() => undefined);
          const resolved = resolveId(vars.id);
          if (!isTempId(resolved)) {
            const parent = parentForExisting(vars.id);
            const body = stripParentFks({ ...(vars.data as Record<string, unknown>) });
            return parent
              ? aepbase.update<T>(plural, resolved, body, { parent })
              : aepbase.update<T>(plural, resolved, body);
          }
        }
        throw new Error(
          `Cannot update ${singular} ${vars.id}: backing create has not resolved`,
        );
      }
      const parent = parentForExisting(vars.id);
      const body = stripParentFks({ ...(vars.data as Record<string, unknown>) });
      return parent
        ? aepbase.update<T>(plural, realId, body, { parent })
        : aepbase.update<T>(plural, realId, body);
    },
    onMutate: async (vars: UpdateVars<U>) => {
      await qc.cancelQueries({ queryKey: listKey });
      await qc.cancelQueries({ queryKey: detailKey(vars.id) });
      const previous = qc.getQueryData<T[]>(listKey) ?? [];
      const previousDetail = qc.getQueryData<T>(detailKey(vars.id));
      const ts = nowIso();
      const patch = { ...(vars.data as object), update_time: ts, updated: ts };
      qc.setQueryData<T[]>(
        listKey,
        previous.map((r) => (r.id === vars.id ? ({ ...r, ...patch } as T) : r)),
      );
      // Mirror the patch into the detail slot. Without this an open detail
      // view keeps showing pre-edit data until the settle-time invalidation
      // refetches it — and offline that invalidation never runs, so the list
      // and the detail view would disagree for the whole session.
      if (previousDetail !== undefined) {
        qc.setQueryData<T>(detailKey(vars.id), { ...previousDetail, ...patch } as T);
      }
      return { previous, previousDetail };
    },
    onSuccess: (updated, vars) => {
      if (!updated) return;
      // Fold the server's copy over the optimistic one so server-computed
      // fields land immediately rather than one refetch later.
      // Returning undefined bails out of the write, so an app that only ever
      // reads this record's detail view doesn't get an empty list conjured up.
      qc.setQueryData<T[]>(listKey, (list) =>
        list?.map((r) =>
          r.id === vars.id || r.id === updated.id ? ({ ...r, ...updated } as T) : r,
        ),
      );
      writeDetail(updated.id, updated);
      // An update issued against a still-pending create targets the temp id,
      // so the detail slot a caller opened may still be keyed by it.
      if (vars.id !== updated.id) writeDetail(vars.id, updated);
    },
    onError: (_error, vars, context) => {
      if (context?.previous !== undefined) {
        qc.setQueryData<T[]>(listKey, context.previous);
      }
      if (context) restoreDetail(vars.id, context.previousDetail);
    },
    onSettled: () => {
      if (onlineManager.isOnline()) {
        qc.invalidateQueries({ queryKey: invalidateKey });
      }
    },
  };
  qc.setMutationDefaults(keys.update, updateDef);

  // ---- delete -----------------------------------------------------------
  type DeleteContext = { previous: T[]; previousDetail: T | undefined };
  // Parent chains captured in onMutate for bare-id deletes (before the record
  // is removed from cache). The wrapper's object-form vars are preferred and
  // reload-safe; this covers direct/test callers within a session.
  const pendingDeleteParents = new Map<string, ParentPath | undefined>();
  const deleteId = (vars: DeleteVars): string =>
    typeof vars === 'string' ? vars : vars.id;
  const deleteParent = (vars: DeleteVars): ParentPath | undefined =>
    typeof vars === 'string' ? undefined : vars.parent;
  const deleteDef: MutationOptions<string, Error, DeleteVars, DeleteContext> = {
    networkMode: 'online',
    mutationFn: async (vars: DeleteVars) => {
      const id = deleteId(vars);
      const realId = resolveId(id);
      if (isTempId(realId)) {
        // Backing create still pending. Cancel it; nothing on server to delete.
        pendingDeleteParents.delete(id);
        qc.getMutationCache()
          .getAll()
          .filter(
            (m) =>
              (m.state.variables as CreateVarsBase | undefined)?.tempId === realId,
          )
          .forEach((m) => m.destroy());
        return realId;
      }
      const parent = deleteParent(vars) ?? pendingDeleteParents.get(id);
      pendingDeleteParents.delete(id);
      // force: a "delete" in the UI means delete the whole subtree — the app's
      // confirm dialogs say as much. Harmless for childless resources (the
      // server ignores force when there are no children).
      if (parent) {
        await aepbase.remove(plural, realId, { parent, force: true });
      } else {
        await aepbase.remove(plural, realId, { force: true });
      }
      return realId;
    },
    onMutate: async (vars: DeleteVars) => {
      const id = deleteId(vars);
      await qc.cancelQueries({ queryKey: listKey });
      await qc.cancelQueries({ queryKey: detailKey(id) });
      const previous = qc.getQueryData<T[]>(listKey) ?? [];
      const previousDetail = qc.getQueryData<T>(detailKey(id));
      // Resolve the parent chain from the still-present record before removing
      // it, unless the wrapper already supplied one in the vars.
      if (deleteParent(vars) === undefined && primaryFkField) {
        pendingDeleteParents.set(id, parentForExisting(id));
      }
      qc.setQueryData<T[]>(listKey, previous.filter((r) => r.id !== id));
      // Drop the detail slot too, so the cache stops serving a record the user
      // just deleted (and the persisted cache doesn't resurrect it on reload).
      qc.removeQueries({ queryKey: detailKey(id), exact: true });
      return { previous, previousDetail };
    },
    onError: (_error, vars, context) => {
      if (context?.previous !== undefined) {
        qc.setQueryData<T[]>(listKey, context.previous);
      }
      if (context) restoreDetail(deleteId(vars), context.previousDetail);
    },
    onSettled: () => {
      if (onlineManager.isOnline()) {
        qc.invalidateQueries({ queryKey: invalidateKey });
      }
    },
  };
  qc.setMutationDefaults(keys.delete, deleteDef);

  return keys;
}
