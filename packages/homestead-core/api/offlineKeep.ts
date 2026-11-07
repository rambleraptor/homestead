/**
 * Resources kept on the device for good (`offline: 'keep'`).
 *
 * The offline cache (`persistQueryClient.ts`) is a cache: reads saved by one
 * build are dropped when the next one loads, and any older than a week are
 * dropped too, because they can always be fetched again. That's wrong for data
 * a person wrote and expects to find with no signal — opening Notes on a plane
 * the morning after an update would show an empty notebook.
 *
 * A kept resource's list escapes both rules. Its cache slot is stamped with the
 * resource's *shape* (a fingerprint of its fields and parents) instead of the
 * build: the saved copy is thrown away only when the records it holds could
 * have a different shape. The slot is never garbage-collected while the page
 * is open either, so it's always in the snapshot that gets saved. And the
 * first read asks the browser to make the site's storage persistent, so it
 * isn't evicted to free space (Safari otherwise clears a site's storage after
 * a week without a visit, unless it was added to the home screen).
 */

import type { QueryClient } from '@tanstack/react-query';
import type { ResourceDefinition } from '../resources/types';
import { queryKeys } from './queryClient';

/** The query `meta` key a kept list carries its resource's shape under. */
export const OFFLINE_SHAPE_META = 'offlineShape';

type ShapeSource = Pick<ResourceDefinition, 'fields' | 'parents'>;

/** Key-order-independent JSON, so a reordered definition is the same shape. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined && typeof v !== 'function')
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** A fingerprint of what a resource's records look like (FNV-1a over its fields and parents). */
export function resourceShape(def: ShapeSource): string {
  const text = stableJson({ fields: def.fields, parents: def.parents ?? [] });
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/**
 * Mark a kept resource's list slot: never garbage-collected, and stamped with
 * its shape so the persister can keep it across builds. A no-op for any other
 * resource. Called once per resource at boot, before the cache is restored.
 */
export function registerOfflineKeep(
  qc: QueryClient,
  appId: string,
  def: Pick<ResourceDefinition, 'singular' | 'offline'> & ShapeSource,
): void {
  if (def.offline !== 'keep') return;
  qc.setQueryDefaults(queryKeys.app(appId).resource(def.singular).list(), {
    gcTime: Infinity,
    meta: { [OFFLINE_SHAPE_META]: resourceShape(def) },
  });
}

/** Singular → current shape, for every kept resource. */
export function keptShapes(
  defs: readonly (Pick<ResourceDefinition, 'singular' | 'offline'> & ShapeSource)[],
): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  for (const def of defs) if (def.offline === 'keep') out.set(def.singular, resourceShape(def));
  return out;
}

/**
 * Whether a saved query is a kept list whose records still have the current
 * shape — `['app', appId, singular, 'list']` stamped with that singular's shape.
 */
export function isKeptQuery(
  query: { queryKey: readonly unknown[]; meta?: Record<string, unknown> },
  shapes: ReadonlyMap<string, string>,
): boolean {
  const [head, , singular, slot] = query.queryKey;
  if (head !== 'app' || slot !== 'list' || query.queryKey.length !== 4) return false;
  const shape = typeof singular === 'string' ? shapes.get(singular) : undefined;
  return shape !== undefined && query.meta?.[OFFLINE_SHAPE_META] === shape;
}

let persistRequested: Promise<boolean> | null = null;

/**
 * Ask the browser, once per page, to make the site's storage persistent.
 * Chrome and Safari decide without asking (an installed app is granted);
 * Firefox may ask the person. Resolves to whether storage is persistent.
 */
export function requestPersistentStorage(): Promise<boolean> {
  persistRequested ??= (async () => {
    try {
      const storage = typeof navigator === 'undefined' ? undefined : navigator.storage;
      if (!storage?.persist) return false;
      if (await storage.persisted?.()) return true;
      return await storage.persist();
    } catch {
      return false;
    }
  })();
  return persistRequested;
}
