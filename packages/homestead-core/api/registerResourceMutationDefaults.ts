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
 * `queryKeys.module(moduleId).resource(singular).list()`. Read hooks query
 * that key; the factory writes optimistic state there. No per-module
 * `listQueryKey` override is necessary.
 */

import type { QueryClient, MutationOptions } from '@tanstack/react-query';
import { onlineManager } from '@tanstack/react-query';
import { aepbase, type ParentPath } from './aepbase';
import { queryKeys } from './queryClient';
import { logger } from '../utils/logger';

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

// One reconciliation map per (moduleId, singular). Maps survive across
// QueryClients in the same JS realm so a page reload that recreates the
// client still finds prior temp→real mappings during queue replay.
const tempIdMaps = new Map<string, Map<string, string>>();

function tempIdMap(moduleId: string, singular: string): Map<string, string> {
  const key = `${moduleId}:${singular}`;
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
// Public types
// ---------------------------------------------------------------------------

export interface CreateVarsBase {
  tempId: string;
}

export interface UpdateVars<U = Record<string, unknown>> {
  id: string;
  data: U;
}

export interface ResourceMutationKeys {
  create: readonly unknown[];
  update: readonly unknown[];
  delete: readonly unknown[];
}

export interface ResourceMutationOpts {
  moduleId: string;
  /** Resource singular, used in mutation keys (`create-${singular}`). */
  singular: string;
  /** aepbase collection plural (the URL segment). */
  plural: string;
  /** Build the URL parent chain for nested resources. */
  parentPath?: (vars: unknown) => ParentPath | undefined;
  /**
   * Optimistic cascade applied inside the delete `onMutate` (before any
   * network call) and reversed in `onError`. Use for cross-resource
   * effects, e.g. "unset a foreign key on related records when their
   * parent is deleted". Both callbacks must be pure functions of
   * (qc, snapshot) so the snapshot survives serialization into the
   * persisted mutation queue.
   */
  cascadeDelete?: {
    apply: (deletedId: string, qc: QueryClient) => unknown;
    rollback: (snapshot: unknown, qc: QueryClient) => void;
  };
}

// ---------------------------------------------------------------------------
// Key builder
// ---------------------------------------------------------------------------

export function resourceMutationKeys(
  moduleId: string,
  singular: string,
): ResourceMutationKeys {
  return {
    create: ['module', moduleId, `create-${singular}`] as const,
    update: ['module', moduleId, `update-${singular}`] as const,
    delete: ['module', moduleId, `delete-${singular}`] as const,
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
  const { moduleId, singular, plural, parentPath, cascadeDelete } = opts;
  const listKey = queryKeys.module(moduleId).resource(singular).list();
  const idMap = tempIdMap(moduleId, singular);
  const keys = resourceMutationKeys(moduleId, singular);

  const resolveId = (id: string): string => idMap.get(id) ?? id;

  function buildBody(vars: C): Record<string, unknown> {
    const body = stripTempId(vars);
    const userId = aepbase.getCurrentUser?.()?.id;
    if (userId && !('created_by' in body)) {
      body.created_by = `users/${userId}`;
    }
    return body;
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
      const parent = parentPath?.(vars);
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
    },
    onError: (error, _vars, context) => {
      logger.error(`Failed to create ${singular}`, error);
      if (context?.previous !== undefined) {
        qc.setQueryData<T[]>(listKey, context.previous);
      }
    },
    onSettled: () => {
      if (onlineManager.isOnline()) {
        qc.invalidateQueries({ queryKey: listKey });
      }
    },
  };
  qc.setMutationDefaults(keys.create, createDef);

  // ---- update -----------------------------------------------------------
  const updateDef: MutationOptions<
    T | undefined,
    Error,
    UpdateVars<U>,
    { previous: T[] }
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
            const parent = parentPath?.(vars);
            const body = vars.data as unknown as Record<string, unknown>;
            return parent
              ? aepbase.update<T>(plural, resolved, body, { parent })
              : aepbase.update<T>(plural, resolved, body);
          }
        }
        throw new Error(
          `Cannot update ${singular} ${vars.id}: backing create has not resolved`,
        );
      }
      const parent = parentPath?.(vars);
      const body = vars.data as unknown as Record<string, unknown>;
      return parent
        ? aepbase.update<T>(plural, realId, body, { parent })
        : aepbase.update<T>(plural, realId, body);
    },
    onMutate: async (vars: UpdateVars<U>) => {
      await qc.cancelQueries({ queryKey: listKey });
      const previous = qc.getQueryData<T[]>(listKey) ?? [];
      const ts = nowIso();
      qc.setQueryData<T[]>(
        listKey,
        previous.map((r) =>
          r.id === vars.id
            ? ({
                ...r,
                ...(vars.data as object),
                update_time: ts,
                updated: ts,
              } as T)
            : r,
        ),
      );
      return { previous };
    },
    onError: (error, _vars, context) => {
      logger.error(`Failed to update ${singular}`, error);
      if (context?.previous !== undefined) {
        qc.setQueryData<T[]>(listKey, context.previous);
      }
    },
    onSettled: () => {
      if (onlineManager.isOnline()) {
        qc.invalidateQueries({ queryKey: listKey });
      }
    },
  };
  qc.setMutationDefaults(keys.update, updateDef);

  // ---- delete -----------------------------------------------------------
  type DeleteContext = { previous: T[]; cascade?: unknown };
  const deleteDef: MutationOptions<string, Error, string, DeleteContext> = {
    networkMode: 'online',
    mutationFn: async (id: string) => {
      const realId = resolveId(id);
      if (isTempId(realId)) {
        // Backing create still pending. Cancel it; nothing on server to delete.
        qc.getMutationCache()
          .getAll()
          .filter(
            (m) =>
              (m.state.variables as CreateVarsBase | undefined)?.tempId === realId,
          )
          .forEach((m) => m.destroy());
        return realId;
      }
      const parent = parentPath?.(id);
      if (parent) {
        await aepbase.remove(plural, realId, { parent });
      } else {
        await aepbase.remove(plural, realId);
      }
      return realId;
    },
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: listKey });
      const previous = qc.getQueryData<T[]>(listKey) ?? [];
      qc.setQueryData<T[]>(listKey, previous.filter((r) => r.id !== id));
      const cascade = cascadeDelete ? cascadeDelete.apply(id, qc) : undefined;
      return { previous, cascade };
    },
    onError: (error, _id, context) => {
      logger.error(`Failed to delete ${singular}`, error);
      if (context?.previous !== undefined) {
        qc.setQueryData<T[]>(listKey, context.previous);
      }
      if (cascadeDelete && context?.cascade !== undefined) {
        cascadeDelete.rollback(context.cascade, qc);
      }
    },
    onSettled: () => {
      if (onlineManager.isOnline()) {
        qc.invalidateQueries({ queryKey: listKey });
      }
    },
  };
  qc.setMutationDefaults(keys.delete, deleteDef);

  return keys;
}
