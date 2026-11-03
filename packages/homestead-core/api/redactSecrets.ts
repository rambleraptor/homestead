/**
 * Keeps secret field values out of the offline cache on the device.
 *
 * The server stores `encrypted` fields (a gift card's number and PIN, the
 * household Wi-Fi password) as ciphertext, but reads hand back the plaintext,
 * and the React Query cache would otherwise write it to disk as-is — readable
 * by anyone holding the unlocked device or a backup of the browser profile.
 * `secret` fields only ever read back as a descriptor, but the descriptor's
 * hint is a piece of the value, so they're treated the same.
 *
 * Applied to every snapshot as it's saved, never to the in-memory cache:
 * the screen keeps showing the number while the app is open; after a cold
 * offline start the record is there without it, and a refetch fills it in.
 */

import type { PersistedClient } from '@tanstack/react-query-persist-client';
import type { ResourceDefinition } from '../resources/types';

/** Which fields are secret: by collection, and every such name across resources. */
export interface SecretFieldIndex {
  /** URL collection (a resource's plural) → its secret field names. */
  byCollection: ReadonlyMap<string, ReadonlySet<string>>;
  /** Every secret field name of any resource. */
  names: ReadonlySet<string>;
}

export function secretFieldIndex(defs: readonly ResourceDefinition[]): SecretFieldIndex {
  const byCollection = new Map<string, Set<string>>();
  const names = new Set<string>();
  for (const def of defs) {
    for (const [name, field] of Object.entries(def.fields ?? {})) {
      if (!field.encrypted && !field.secret) continue;
      names.add(name);
      let fields = byCollection.get(def.plural);
      if (!fields) byCollection.set(def.plural, (fields = new Set()));
      fields.add(name);
    }
  }
  return { byCollection, names };
}

/** The collection a record belongs to, from its AEP `path` (`gift-cards/abc`). */
function collectionOf(record: Record<string, unknown>): string | null {
  if (typeof record.path !== 'string') return null;
  const segments = record.path.split('/');
  return segments.length >= 2 ? segments[segments.length - 2]! : null;
}

/**
 * A deep copy of `value` with secret fields removed. A record (an object with
 * an AEP `path`) loses its own resource's secret fields. Anything else — an
 * app's reshaped view of a record, an optimistic draft — loses every name
 * that is secret anywhere: dropping a same-named harmless field from the disk
 * copy costs a refetch, keeping a real secret would be the leak.
 */
export function redactSecrets(value: unknown, index: SecretFieldIndex): unknown {
  if (index.names.size === 0) return value;
  const seen = new WeakSet<object>();
  const walk = (v: unknown): unknown => {
    if (v === null || typeof v !== 'object') return v;
    if (seen.has(v)) return undefined;
    seen.add(v);
    if (Array.isArray(v)) return v.map(walk);
    const record = v as Record<string, unknown>;
    const collection = collectionOf(record);
    const secret = collection !== null ? index.byCollection.get(collection) : index.names;
    const out: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(record)) {
      if (secret?.has(key)) continue;
      out[key] = walk(field);
    }
    return out;
  };
  return walk(value);
}

/** Whether `value` carries a secret field with a value anywhere inside it. */
export function containsSecretValue(value: unknown, index: SecretFieldIndex): boolean {
  const seen = new WeakSet<object>();
  const walk = (v: unknown): boolean => {
    if (v === null || typeof v !== 'object' || seen.has(v)) return false;
    seen.add(v);
    if (Array.isArray(v)) return v.some(walk);
    return Object.entries(v as Record<string, unknown>).some(
      ([key, field]) =>
        (index.names.has(key) && field !== undefined && field !== null && field !== '') ||
        walk(field),
    );
  };
  return walk(value);
}

/**
 * The snapshot as it may be written to disk. Reads, and what queued writes
 * remember (their result and the optimistic rollback state), lose their
 * secret fields. A queued write whose *own input* carries a secret is left
 * out entirely: replaying it without the value would save the wrong thing,
 * so it stays queued in memory and syncs as long as the app stays open.
 */
export function redactPersistedClient(
  client: PersistedClient,
  index: SecretFieldIndex,
): PersistedClient {
  if (index.names.size === 0) return client;
  const { queries = [], mutations = [] } = client.clientState ?? {};
  return {
    ...client,
    clientState: {
      queries: queries.map((query) => ({
        ...query,
        state: { ...query.state, data: redactSecrets(query.state.data, index) },
      })),
      mutations: mutations
        .filter((mutation) => !containsSecretValue(mutation.state.variables, index))
        .map((mutation) => ({
          ...mutation,
          state: {
            ...mutation.state,
            data: redactSecrets(mutation.state.data, index),
            context: redactSecrets(mutation.state.context, index),
          },
        })),
    },
  };
}
