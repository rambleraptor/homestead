/**
 * Injection seam for what a caller can reach, so the model-facing tool surfaces
 * (the AI chat, `/api/mcp`) offer only the collections a caller can use.
 *
 * The engine decides it (`Engine.collectionAccess`), and core can't import the
 * engine (the dependency direction is server → core), so the server hands down
 * a resolver at boot — exactly like `setVectorStore`. With none installed (unit
 * tests) the surfaces aren't narrowed; the engine still decides every call.
 */

import {
  reachableBy,
  type CollectionAccess,
} from '../resources/model-tools';
import type { ResourceDefinition } from '../resources/types';

/** Resolve a bearer token to its access per collection singular, or null. */
export type CollectionAccessResolver = (
  token: string,
) => Promise<ReadonlyMap<string, CollectionAccess> | null>;

let current: CollectionAccessResolver | null = null;

/** Install the server's resolver. `null` turns narrowing off. */
export function setCollectionAccessResolver(resolver: CollectionAccessResolver | null): void {
  current = resolver;
}

/** What a model-facing surface should offer one caller. */
export interface ModelResources {
  /** The definitions to build tools from: only what the caller can read. */
  defs: ResourceDefinition[];
  /** Whether to offer writes on one of them. */
  writable: (def: ResourceDefinition) => boolean;
}

/**
 * `defs` narrowed to what `token`'s caller can reach. Unnarrowed when no
 * resolver is installed or the token doesn't resolve (then every call it makes
 * is refused anyway).
 */
export async function modelResourcesFor(
  defs: ResourceDefinition[],
  token: string,
): Promise<ModelResources> {
  const access = current ? await current(token) : null;
  if (!access) return { defs, writable: () => true };
  return {
    defs: reachableBy(defs, access),
    writable: (def) => access.get(def.singular)?.write === true,
  };
}
