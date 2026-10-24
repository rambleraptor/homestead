/**
 * Which resources a model-facing tool surface offers (see
 * `ResourceDefinition.modelTools`), and which of them one caller can reach.
 *
 * Applied where the definition list enters each surface — the chat handler and
 * the `/api/mcp` route — so every tool built from that list (CRUD tools, custom
 * methods, the generic catalog, document search, reference hints) agrees on
 * what exists. Neither is a permission check: the engine decides every call.
 */

import type { ResourceDefinition } from './types';

/** A model-facing tool surface. */
export type ModelSurface = 'chat' | 'mcp';

/**
 * Whether one caller could read, and could write, a collection — what the
 * engine's `collectionAccess` reports for each resource. "Could" is deliberate:
 * `read` means some read might succeed (their own rows, a record shared with
 * them), not that every row is theirs to see.
 */
export interface CollectionAccess {
  read: boolean;
  write: boolean;
}

/**
 * `defs` minus the resources hidden from `surface`, and minus their
 * descendants: a child whose parent is hidden can't be addressed (its tool
 * would need a parent id the model has no way to find), so it goes too.
 */
export function visibleToModel(
  defs: readonly ResourceDefinition[],
  surface: ModelSurface,
): ResourceDefinition[] {
  return withoutDescendants(defs, (def) => def.modelTools?.[surface] === false);
}

/**
 * `defs` narrowed to what one caller can read, by their `access` per singular.
 * A resource they can't read goes, with its descendants (as in
 * {@link visibleToModel}); so does one `access` doesn't mention, since the
 * engine reports every collection it serves.
 */
export function reachableBy(
  defs: readonly ResourceDefinition[],
  access: ReadonlyMap<string, CollectionAccess>,
): ResourceDefinition[] {
  return withoutDescendants(defs, (def) => access.get(def.singular)?.read !== true);
}

/** `defs` minus each one `drop` names and everything beneath it. */
function withoutDescendants(
  defs: readonly ResourceDefinition[],
  drop: (def: ResourceDefinition) => boolean,
): ResourceDefinition[] {
  const bySingular = new Map(defs.map((d) => [d.singular, d]));
  const dropped = new Map<string, boolean>();

  const isDropped = (def: ResourceDefinition, seen: Set<string>): boolean => {
    const known = dropped.get(def.singular);
    if (known !== undefined) return known;
    let result = drop(def);
    if (!result && !seen.has(def.singular)) {
      seen.add(def.singular);
      const parent = def.parents?.[0] ? bySingular.get(def.parents[0]) : undefined;
      result = parent ? isDropped(parent, seen) : false;
    }
    dropped.set(def.singular, result);
    return result;
  };

  return defs.filter((d) => !isDropped(d, new Set()));
}
