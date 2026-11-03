/**
 * Generic offline-capable mutation defaults for any AEP resource.
 *
 * The factory binds three mutation keys per resource — `create-${singular}`,
 * `update-${singular}`, `delete-${singular}` — to the AEP standard methods:
 * the mutation writes the change into the cache optimistically, then queues
 * the request in the outbox (`outbox.ts`), which sends it now or when the
 * connection is back. Defaults live on the QueryClient (not in a
 * `useMutation` closure) so a mutation persisted by an earlier version still
 * replays after `PersistQueryClientProvider` rehydrates it.
 *
 * Every write is addressed by the record's AEP-122 resource name — the `path`
 * the engine returns on each record. A create picks its id up front (AEP-133),
 * so the optimistic record already has its final id and name: an update or
 * delete made before the create reaches the server targets the same name, and
 * the outbox folds them together. There are no temporary ids to reconcile and
 * no parent chains to rebuild at send time.
 *
 * A mutation waits for the server while it can reach it, so an online error
 * still rejects `mutateAsync` (a form stays open, the global toast fires, the
 * optimistic change rolls back). Once the write is waiting for a connection,
 * the mutation resolves with the optimistic record: it's saved on the device,
 * and the outbox owns it from there. Its later result is folded into the cache
 * by `syncCacheWithOutbox`, and a refusal nobody is waiting for is toasted
 * there.
 *
 * Convention: each resource's list lives at
 * `queryKeys.app(appId).resource(singular).list()` and each record's detail
 * at `queryKeys.app(appId).resource(singular).detail(id)`. Read hooks query
 * those keys; the factory writes optimistic state to both, so a detail view
 * stays coherent with the list it was opened from.
 */

import type { QueryClient, MutationOptions } from '@tanstack/react-query';
import { onlineManager } from '@tanstack/react-query';
import { toast } from 'sonner';
import { aepbase, type ParentPath } from './aepbase';
import { getAepErrorMessage } from './errorMessage';
import { queryKeys } from './queryClient';
import {
  applyMergePatch,
  applyPendingWrites,
  outbox,
  parseResourceName,
  resourceName,
  type Outbox,
  type OutboxTicket,
} from './outbox';

// ---------------------------------------------------------------------------
// Record ids (AEP-133)
// ---------------------------------------------------------------------------

/**
 * A new record's id, chosen by the client (AEP-133): lowercase letters and
 * digits, so it's a valid AEP-122 resource id as-is.
 */
export function newRecordId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID().replace(/-/g, '');
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

/**
 * Earlier versions gave an optimistic record a `tmp_` id and derived the
 * server id from it when sending. A write persisted by one of those versions
 * still names records that way, so these map it to the id it was sent with.
 */
export const TEMP_ID_PREFIX = 'tmp_';

export function isTempId(id: string): boolean {
  return id.startsWith(TEMP_ID_PREFIX);
}

/** The id an earlier version sent a `tmp_` record's create with. */
export function serverIdForTempId(tempId: string): string {
  return tempId
    .slice(TEMP_ID_PREFIX.length)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

// ---------------------------------------------------------------------------
// Resource metadata registry (drives convention-based nesting)
// ---------------------------------------------------------------------------

/**
 * Minimal per-resource metadata every registration self-publishes: how a
 * resource name maps back to an app's cache slots, and — for a record the
 * cache doesn't hold — how to build its name from its parents.
 * `providers.tsx` registers every resource at boot.
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
 * Ids of the apps that registered a resource singular — how a server change
 * event (which names only the singular) finds the query caches to invalidate.
 */
export function appIdsForResource(singular: string): string[] {
  const ids: string[] = [];
  for (const meta of resourceMetaRegistry.values()) {
    if (meta.singular === singular) ids.push(meta.appId);
  }
  return ids;
}

/** True when a resource declares any parent (i.e. is nested). */
export function resourceHasParents(appId: string, singular: string): boolean {
  return (metaFor(appId, singular)?.parents.length ?? 0) > 0;
}


/** The URL collections an app's resources live in (for "anything queued here?"). */
export function collectionsForApp(appId: string): Set<string> {
  const out = new Set<string>();
  for (const meta of resourceMetaRegistry.values()) {
    if (meta.appId === appId) out.add(meta.plural);
  }
  return out;
}

function metasForCollection(collection: string): ResourceMeta[] {
  return [...resourceMetaRegistry.values()].filter((m) => m.plural === collection);
}

/** A record id as the server knows it (maps an earlier version's `tmp_` ids). */
function serverId(id: string): string {
  return isTempId(id) ? serverIdForTempId(id) : id;
}

type CachedRecord = { id: string; path?: unknown } & Record<string, unknown>;

function findCachedRecord(
  qc: QueryClient,
  appId: string,
  singular: string,
  id: string,
): CachedRecord | undefined {
  const keys = queryKeys.app(appId).resource(singular);
  const list = qc.getQueryData<CachedRecord[]>(keys.list());
  const ids = new Set([id, serverId(id)]);
  return (
    list?.find((r) => ids.has(r.id)) ??
    qc.getQueryData<CachedRecord>(keys.detail(id)) ??
    qc.getQueryData<CachedRecord>(keys.detail(serverId(id)))
  );
}

/**
 * The AEP-122 name of a record: its `path` when the cache holds it, else
 * built from its parents — `{collection}/{id}` at the top level, or the
 * parent's name (found the same way, through the record's parent field)
 * followed by the record's own collection and id. Undefined when a nested
 * record's parent can't be found.
 *
 * A parent the registry doesn't know (the built-in `user`) is left out of the
 * name, as earlier versions did.
 */
export function resourceNameFromCache(
  qc: QueryClient,
  appId: string,
  singular: string,
  id: string,
): string | undefined {
  const meta = metaFor(appId, singular);
  if (!meta) return undefined;
  const record = findCachedRecord(qc, appId, singular, id);
  if (typeof record?.path === 'string') return record.path;
  const parentSingular = meta.parents[0];
  if (!parentSingular || !metaFor(appId, parentSingular)) {
    return resourceName(meta.plural, serverId(id));
  }
  const parentId = record?.[parentFkField(parentSingular)];
  if (typeof parentId !== 'string') return undefined;
  const parent = resourceNameFromCache(qc, appId, parentSingular, parentId);
  return parent ? resourceName(meta.plural, serverId(id), parent) : undefined;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * What every create carries besides the record's fields: the id it will have
 * (`recordId`, chosen by `useResourceCreate`), or — from a create an earlier
 * version persisted — the `tempId` that id is derived from.
 */
export interface CreateVarsBase {
  recordId?: string;
  tempId?: string;
}

export interface UpdateVars<U = Record<string, unknown>> {
  id: string;
  data: U;
}

/**
 * Delete variables. `useResourceDelete` resolves the record's resource name
 * before the optimistic delete removes it from the cache, and passes it
 * along. A bare id still works (a top-level record, or one the cache holds
 * until `onMutate`), and so does the `{ id, parent }` form earlier versions
 * persisted.
 */
export type DeleteVars = string | { id: string; name?: string; parent?: ParentPath };

export interface ResourceMutationKeys {
  create: readonly unknown[];
  update: readonly unknown[];
  delete: readonly unknown[];
}

export interface ResourceMutationOpts {
  appId: string;
  /** Resource singular, used in mutation keys (`create-${singular}`). */
  singular: string;
  /** The resource's URL collection (its plural). */
  plural: string;
  /**
   * Singulars of this resource's parent chain, as declared on the resource
   * definition (e.g. `['credit-card']` for a perk) — how a record the cache
   * doesn't hold finds its name, and which parent field a create's parent
   * id rides in. Empty/omitted for top-level resources.
   */
  parents?: string[];
  /** The outbox writes go through; the page's by default. */
  outbox?: Outbox;
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

/**
 * Wait for the server's answer while the write is being sent; once it's
 * waiting for a connection instead, settle for the local copy. Either way
 * the outbox keeps the request until the server has it.
 */
async function sentOrSaved<T>(ticket: OutboxTicket, local: () => T): Promise<T> {
  const parked = Symbol('parked');
  const outcome = await Promise.race([ticket.done, ticket.parked.then(() => parked)]);
  if (outcome === parked) return local();
  return (outcome as T | undefined) ?? local();
}

export function registerResourceMutationDefaults<
  T extends { id: string } = { id: string } & Record<string, unknown>,
  C extends CreateVarsBase = CreateVarsBase & Record<string, unknown>,
  U = Record<string, unknown>,
>(qc: QueryClient, opts: ResourceMutationOpts): ResourceMutationKeys {
  const { appId, singular, plural, parents = [] } = opts;
  const queue = opts.outbox ?? outbox;

  resourceMetaRegistry.set(metaKey(appId, singular), { appId, singular, plural, parents });

  const listKey = queryKeys.app(appId).resource(singular).list();
  const detailKey = (id: string) => queryKeys.app(appId).resource(singular).detail(id);
  const keys = resourceMutationKeys(appId, singular);

  // Parent fields (e.g. `credit_card` on a perk) stay on the cached record so
  // hooks can join by them, but the resource name carries the parent on the
  // wire, so they never go in a request body.
  const parentFields = parents.map(parentFkField);
  const primaryParent: string | undefined = parents[0];

  function withoutParentFields(body: Record<string, unknown>): Record<string, unknown> {
    for (const field of parentFields) delete body[field];
    return body;
  }

  function fieldsOf(vars: C): Record<string, unknown> {
    const { recordId: _r, tempId: _t, ...fields } = vars as unknown as Record<string, unknown>;
    void _r;
    void _t;
    return fields;
  }

  function idForCreate(vars: C): string {
    if (vars.recordId) return vars.recordId;
    if (vars.tempId) return serverIdForTempId(vars.tempId);
    throw new Error(`Cannot create a ${singular} without an id`);
  }

  /** The name a create makes: under its parent's name when it has one. */
  function nameForCreate(vars: C): string {
    const id = idForCreate(vars);
    if (!primaryParent || !metaFor(appId, primaryParent)) return resourceName(plural, id);
    const parentId = (vars as unknown as Record<string, unknown>)[parentFkField(primaryParent)];
    const parent =
      typeof parentId === 'string'
        ? resourceNameFromCache(qc, appId, primaryParent, parentId)
        : undefined;
    if (!parent) {
      throw new Error(`Cannot create a ${singular}: its ${primaryParent} isn't loaded`);
    }
    return resourceName(plural, id, parent);
  }

  function nameForExisting(id: string): string {
    const name = resourceNameFromCache(qc, appId, singular, id);
    if (!name) throw new Error(`Cannot find ${singular} ${id} to change it`);
    return name;
  }

  function bodyForCreate(vars: C): Record<string, unknown> {
    const body = withoutParentFields(fieldsOf(vars));
    const userId = aepbaseUserId();
    if (userId && !('created_by' in body)) body.created_by = `users/${userId}`;
    return body;
  }

  function buildOptimistic(vars: C): T {
    const ts = nowIso();
    return {
      ...fieldsOf(vars),
      id: idForCreate(vars),
      path: nameForCreate(vars),
      // aepbase records use create_time/update_time; PB-era types still
      // expose created/updated. Set both — extra fields are harmless.
      create_time: ts,
      update_time: ts,
      created: ts,
      updated: ts,
    } as unknown as T;
  }

  /**
   * Write a record into the resource's detail slot, merging over whatever is
   * already there — keeping any fields a read hook layered on top, and
   * priming the slot for the next navigation.
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

  const cachedRow = (id: string): T | undefined =>
    qc.getQueryData<T[]>(listKey)?.find((r) => r.id === id) ?? qc.getQueryData<T>(detailKey(id));

  // ---- create (AEP-133) ---------------------------------------------------
  const createDef: MutationOptions<T, Error, C, { previous: T[] }> = {
    networkMode: 'always',
    mutationFn: async (vars: C) => {
      const ticket = queue.enqueue('create', nameForCreate(vars), bodyForCreate(vars));
      const id = idForCreate(vars);
      return sentOrSaved(ticket, () => cachedRow(id) ?? buildOptimistic(vars));
    },
    onMutate: async (vars: C) => {
      await qc.cancelQueries({ queryKey: listKey });
      const previous = qc.getQueryData<T[]>(listKey) ?? [];
      qc.setQueryData<T[]>(listKey, [...previous, buildOptimistic(vars)]);
      return { previous };
    },
    onSuccess: (created, vars) => {
      // Matched by the id we chose too, in case a server ignored it.
      const requested = idForCreate(vars);
      qc.setQueryData<T[]>(listKey, (list) =>
        list?.map((r) =>
          r.id === requested || r.id === created.id ? ({ ...r, ...created } as T) : r,
        ),
      );
      // Prime the new record's detail slot so navigating straight into it
      // renders from cache instead of round-tripping for what we just got.
      writeDetail(created.id, created);
    },
    onError: (_error, _vars, context) => {
      if (context?.previous !== undefined) qc.setQueryData<T[]>(listKey, context.previous);
    },
  };
  qc.setMutationDefaults(keys.create, createDef);

  // ---- update (AEP-134) ---------------------------------------------------
  const updateDef: MutationOptions<
    T | undefined,
    Error,
    UpdateVars<U>,
    { previous: T[]; previousDetail: T | undefined }
  > = {
    networkMode: 'always',
    mutationFn: async (vars: UpdateVars<U>) => {
      const patch = withoutParentFields({ ...(vars.data as Record<string, unknown>) });
      const ticket = queue.enqueue('update', nameForExisting(vars.id), patch);
      return sentOrSaved(ticket, () => cachedRow(vars.id));
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
      // Mirror the patch into the detail slot, so an open detail view and the
      // list agree — including offline, where nothing refetches.
      if (previousDetail !== undefined) {
        qc.setQueryData<T>(detailKey(vars.id), { ...previousDetail, ...patch } as T);
      }
      return { previous, previousDetail };
    },
    onSuccess: (updated, vars) => {
      if (!updated) return;
      // Fold the server's copy over the optimistic one so server-computed
      // fields land immediately rather than one refetch later. Returning
      // undefined bails out, so a list that was never loaded isn't conjured up.
      qc.setQueryData<T[]>(listKey, (list) =>
        list?.map((r) =>
          r.id === vars.id || r.id === updated.id ? ({ ...r, ...updated } as T) : r,
        ),
      );
      writeDetail(updated.id, updated);
      if (vars.id !== updated.id) writeDetail(vars.id, updated);
    },
    onError: (_error, vars, context) => {
      if (context?.previous !== undefined) qc.setQueryData<T[]>(listKey, context.previous);
      if (context) restoreDetail(vars.id, context.previousDetail);
    },
  };
  qc.setMutationDefaults(keys.update, updateDef);

  // ---- delete (AEP-135) ---------------------------------------------------
  type DeleteContext = { previous: T[]; previousDetail: T | undefined };
  // Names resolved in onMutate for bare-id deletes, before the record leaves
  // the cache. `useResourceDelete` passes the name in the vars instead.
  const namesBeforeDelete = new Map<string, string | undefined>();
  const deleteId = (vars: DeleteVars): string => (typeof vars === 'string' ? vars : vars.id);
  const deleteName = (vars: DeleteVars): string | undefined => {
    if (typeof vars === 'string') return undefined;
    if (vars.name) return vars.name;
    // An earlier version's `{ id, parent }`.
    return vars.parent ? `${vars.parent.join('/')}/${plural}/${serverId(vars.id)}` : undefined;
  };
  const deleteDef: MutationOptions<string, Error, DeleteVars, DeleteContext> = {
    networkMode: 'always',
    mutationFn: async (vars: DeleteVars) => {
      const id = deleteId(vars);
      const name = deleteName(vars) ?? namesBeforeDelete.get(id) ?? nameForExisting(id);
      namesBeforeDelete.delete(id);
      const ticket = queue.enqueue('delete', name);
      await sentOrSaved(ticket, () => undefined);
      return parseResourceName(name).id;
    },
    onMutate: async (vars: DeleteVars) => {
      const id = deleteId(vars);
      await qc.cancelQueries({ queryKey: listKey });
      await qc.cancelQueries({ queryKey: detailKey(id) });
      const previous = qc.getQueryData<T[]>(listKey) ?? [];
      const previousDetail = qc.getQueryData<T>(detailKey(id));
      if (deleteName(vars) === undefined) {
        namesBeforeDelete.set(id, resourceNameFromCache(qc, appId, singular, id));
      }
      qc.setQueryData<T[]>(listKey, previous.filter((r) => r.id !== id));
      // Drop the detail slot too, so the cache stops serving a record the
      // person just deleted (and the persisted cache doesn't resurrect it).
      qc.removeQueries({ queryKey: detailKey(id), exact: true });
      return { previous, previousDetail };
    },
    onError: (_error, vars, context) => {
      if (context?.previous !== undefined) qc.setQueryData<T[]>(listKey, context.previous);
      if (context) restoreDetail(deleteId(vars), context.previousDetail);
    },
  };
  qc.setMutationDefaults(keys.delete, deleteDef);

  return keys;
}

function aepbaseUserId(): string | undefined {
  return aepbase.getCurrentUser?.()?.id;
}

// ---------------------------------------------------------------------------
// Keeping the cache in step with the outbox
// ---------------------------------------------------------------------------

/**
 * Fold what the server says about each sent write into the cache, and refetch
 * once the queue is empty.
 *
 * - A record the server returned replaces the optimistic copy in every app
 *   slot for its collection (matched by id — the client chose it).
 * - A write the server refused while nobody was waiting on it (made offline,
 *   sent later) is toasted here; one a mutation was still waiting on was
 *   already toasted by the global mutation handler.
 * - Every app a result touched is refetched when the queue drains, so the
 *   screen ends on the server's truth — refused writes roll back, other
 *   people's changes arrive — without a refetch landing mid-queue and
 *   dropping optimistic rows the server hasn't seen yet.
 *
 * Installed once at boot. Returns the unsubscribe.
 */
export function syncCacheWithOutbox(qc: QueryClient, queue: Outbox = outbox): () => void {
  const touched = new Set<string>();
  const stopResults = queue.onResult((result) => {
    const { collection, id } = parseResourceName(result.request.name);
    const metas = metasForCollection(collection);
    for (const meta of metas) touched.add(meta.appId);

    if (!result.ok) {
      if (!result.awaited) toast.error(getAepErrorMessage(result.error));
      return;
    }
    const record = result.record;
    if (!record) return;
    for (const meta of metas) {
      const keys = queryKeys.app(meta.appId).resource(meta.singular);
      qc.setQueryData<CachedRecord[]>(keys.list(), (list) =>
        list?.map((r) => (r.id === id ? { ...r, ...record } : r)),
      );
      if (qc.getQueryData(keys.detail(id)) !== undefined) {
        qc.setQueryData<CachedRecord>(keys.detail(id), (prev) => ({ ...(prev ?? { id }), ...record }));
      }
    }
  });
  const stopChanges = queue.subscribe(() => {
    // Keep cached lists showing what's queued — including writes loaded from
    // the device after the cache was restored from an older snapshot.
    overlayPendingWrites(qc, queue);
    if (queue.requests().length > 0 || touched.size === 0 || !onlineManager.isOnline()) return;
    const apps = [...touched];
    touched.clear();
    for (const appId of apps) void qc.invalidateQueries({ queryKey: queryKeys.app(appId).all() });
  });
  return () => {
    stopResults();
    stopChanges();
  };
}

// ---------------------------------------------------------------------------
// Reads that include queued writes
// ---------------------------------------------------------------------------

/** A created row gets its parent field back from its name (`credit_card` on a perk). */
function withParentField(meta: ResourceMeta, row: CachedRecord): CachedRecord {
  const parent = meta.parents[0];
  if (!parent || typeof row.path !== 'string') return row;
  const field = parentFkField(parent);
  if (row[field] !== undefined) return row;
  const segments = row.path.split('/');
  return segments.length >= 4 ? { ...row, [field]: segments[segments.length - 3] } : row;
}

/**
 * A list as the person should see it: what the cache holds, with this
 * device's queued writes to it applied (`applyPendingWrites`). Without it, a
 * list read from the server while writes are still queued — or restored from
 * a snapshot older than the person's last changes — would show it as if they
 * hadn't touched it. Safe to apply to rows that already reflect the writes:
 * each AEP method is idempotent here. `parent` is the list's parent chain;
 * `map` shapes a created row like the hook's other rows.
 */
export function withPendingWrites<T>(
  appId: string,
  singular: string,
  records: T[],
  options: { parent?: ParentPath; map?: (record: never) => T; queue?: Outbox } = {},
): T[] {
  const { parent, map, queue = outbox } = options;
  const meta = metaFor(appId, singular);
  if (!meta || queue.requests().length === 0) return records;
  const collection = parent?.length ? `${parent.join('/')}/${meta.plural}` : meta.plural;
  const shape = (raw: CachedRecord): T => {
    const row = withParentField(meta, raw);
    return (map ? map(row as never) : row) as T;
  };
  return applyPendingWrites(
    records as unknown as CachedRecord[],
    collection,
    queue.requests(),
    shape as unknown as (raw: CachedRecord) => CachedRecord,
  ) as unknown as T[];
}

/** One record just read from the server, with queued updates to it applied. */
export function withPendingUpdates<T>(record: T, queue: Outbox = outbox): T {
  const path = (record as { path?: unknown } | null)?.path;
  if (typeof path !== 'string') return record;
  let out = record as unknown as Record<string, unknown>;
  for (const request of queue.requests()) {
    if (request.name === path && request.method === 'update') out = applyMergePatch(out, request.body ?? {});
  }
  return out as unknown as T;
}

/**
 * Apply the queued writes to every resource list the cache holds: whenever
 * the queue changes (`syncCacheWithOutbox`), and once the cache has been
 * restored from the device. The cache snapshot is saved on a throttle, so it
 * can predate the person's last few changes; the outbox never does (it saves
 * on every change). A slot holds one resource from any parent, so writes
 * under every parent of that resource apply. Idempotent, so applying it to
 * rows that already show a write changes nothing.
 */
export function overlayPendingWrites(qc: QueryClient, queue: Outbox = outbox): void {
  const requests = queue.requests();
  if (requests.length === 0) return;
  for (const meta of resourceMetaRegistry.values()) {
    const collections = new Set(
      requests
        .map((r) => r.name.slice(0, r.name.lastIndexOf('/')))
        .filter((c) => c === meta.plural || c.endsWith(`/${meta.plural}`)),
    );
    if (collections.size === 0) continue;
    qc.setQueryData<CachedRecord[]>(queryKeys.app(meta.appId).resource(meta.singular).list(), (list) => {
      if (!list) return list;
      let rows = list;
      for (const collection of collections) rows = applyPendingWrites(rows, collection, requests);
      return rows.map((row) => withParentField(meta, row));
    });
  }
}
