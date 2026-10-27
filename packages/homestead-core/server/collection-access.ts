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

/**
 * Whether `token`'s caller could write `singular` at all — the same reach the
 * model surfaces use, for a server route that acts on someone's behalf. True
 * when no resolver is installed (unit tests).
 */
export async function canWriteCollection(token: string, singular: string): Promise<boolean> {
  if (!current) return true;
  const access = await current(token);
  return access?.get(singular)?.write === true;
}

/** Whether a bearer token's caller may `verb` one record: `Engine.recordAllows`. */
export type RecordAccessResolver = (
  token: string,
  resource: string,
  path: string,
  verb: 'read' | 'write',
) => Promise<boolean>;

let recordResolver: RecordAccessResolver | null = null;

/** Install the server's record-level resolver. `null` removes it. */
export function setRecordAccessResolver(resolver: RecordAccessResolver | null): void {
  recordResolver = resolver;
}

/**
 * Whether `token`'s caller may `verb` the `resource` record at `path` by its
 * grants — for server code gating what a record *confers*, not the record's
 * own CRUD (the engine decides that). Fails closed: false when no resolver is
 * installed.
 */
export async function canUseRecord(
  token: string,
  resource: string,
  path: string,
  verb: 'read' | 'write',
): Promise<boolean> {
  return recordResolver ? recordResolver(token, resource, path, verb) : false;
}
