/**
 * Which resources a model-facing tool surface offers (see
 * `ResourceDefinition.modelTools`).
 *
 * Applied where the definition list enters each surface — the chat handler and
 * the `/api/mcp` route — so every tool built from that list (CRUD tools, custom
 * methods, the generic catalog, document search, reference hints) agrees on
 * what exists. Not a permission check; see the field's doc.
 */

import type { ResourceDefinition } from './types';

/** A model-facing tool surface. */
export type ModelSurface = 'chat' | 'mcp';

/**
 * `defs` minus the resources hidden from `surface`, and minus their
 * descendants: a child whose parent is hidden can't be addressed (its tool
 * would need a parent id the model has no way to find), so it goes too.
 */
export function visibleToModel(
  defs: readonly ResourceDefinition[],
  surface: ModelSurface,
): ResourceDefinition[] {
  const bySingular = new Map(defs.map((d) => [d.singular, d]));
  const hidden = new Map<string, boolean>();

  const isHidden = (def: ResourceDefinition, seen: Set<string>): boolean => {
    const known = hidden.get(def.singular);
    if (known !== undefined) return known;
    let result = def.modelTools?.[surface] === false;
    if (!result && !seen.has(def.singular)) {
      seen.add(def.singular);
      const parent = def.parents?.[0] ? bySingular.get(def.parents[0]) : undefined;
      result = parent ? isHidden(parent, seen) : false;
    }
    hidden.set(def.singular, result);
    return result;
  };

  return defs.filter((d) => !isHidden(d, new Set()));
}
