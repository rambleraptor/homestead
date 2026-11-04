/**
 * Which app owns a resource, and where a record sits: the lookups every host
 * of a record card needs (a tool call in a reply, and later a toast, the
 * inbox, a reference field). Runtime-free apart from the registry.
 */

import type { AppConfig, RecordCardType } from '../apps/types';
import { getAllResourceDefsWithApp, getAppRegistry } from '../apps/registry';
import type { ResourceDefinition } from '../resources/types';
import { USERS } from '../resources/builtins';
import { resourceToolName } from '../chat/tool-names';

export interface RecordOwner {
  app: AppConfig;
  def: ResourceDefinition;
}

interface OwnerMaps {
  bySingular: Map<string, RecordOwner>;
  byPlural: Map<string, RecordOwner>;
  byTool: Map<string, RecordOwner>;
}

// Rebuilt when the registry is replaced (tests do); otherwise computed once.
const cache = new WeakMap<object, OwnerMaps>();

function maps(): OwnerMaps {
  const registry = getAppRegistry();
  const cached = cache.get(registry);
  if (cached) return cached;
  const bySingular = new Map<string, RecordOwner>();
  const byPlural = new Map<string, RecordOwner>();
  const byTool = new Map<string, RecordOwner>();
  for (const { app, def } of getAllResourceDefsWithApp()) {
    bySingular.set(def.singular, { app, def });
    byPlural.set(def.plural, { app, def });
    byTool.set(resourceToolName(def), { app, def });
  }
  const out = { bySingular, byPlural, byTool };
  cache.set(registry, out);
  return out;
}

/** The app and definition behind a resource singular (`todo`). */
export function ownerOf(singular: string): RecordOwner | undefined {
  return maps().bySingular.get(singular);
}

/** The app and definition behind a collection (`todos`), as records name their source. */
export function ownerOfCollection(plural: string): RecordOwner | undefined {
  return maps().byPlural.get(plural);
}

/** The app and definition behind a per-resource chat tool (`gift_cards`). */
export function ownerOfTool(toolName: string): RecordOwner | undefined {
  return maps().byTool.get(toolName);
}

/** Whether any resource is nested under this one (deleting it takes its children with it). */
export function hasChildren(singular: string): boolean {
  for (const { def } of maps().bySingular.values()) {
    if (def.parents?.includes(singular)) return true;
  }
  return false;
}

/** The app's record card for the resource, if it declares one. */
export function recordCardOf(owner: RecordOwner): RecordCardType | undefined {
  return owner.app.records?.[owner.def.singular];
}

/** `users/u1/personal-todos/t1` → `['users', 'u1']`; undefined for a top-level or malformed path. */
export function parentFromPath(path: unknown): string[] | undefined {
  if (typeof path !== 'string') return undefined;
  const segments = path.split('/').filter(Boolean);
  if (segments.length < 4 || segments.length % 2 !== 0) return undefined;
  return segments.slice(0, -2);
}

/**
 * The parent chain of the record a tool call touched: read off the record's
 * own `path` when the result carries one, else built from the call's ancestor
 * ids (`user_id`, `credit_card_id`…), walking the definition's parents up to
 * the root. Undefined for a top-level resource, or when an id is missing.
 */
export function recordParent(
  def: ResourceDefinition,
  input: Record<string, unknown>,
  result: unknown,
): string[] | undefined {
  if (!def.parents?.length) return undefined;
  const fromPath = parentFromPath((result as { path?: unknown } | null)?.path);
  if (fromPath) return fromPath;
  const chain: string[] = [];
  let current: Pick<ResourceDefinition, 'parents'> | undefined = def;
  while (current?.parents?.length) {
    const parent: string = current.parents[0]!;
    const id = input[`${parent.replace(/-/g, '_')}_id`];
    if (typeof id !== 'string' || !id) return undefined;
    const parentDef = parent === 'user' ? undefined : ownerOf(parent)?.def;
    const plural = parent === 'user' ? USERS : parentDef?.plural;
    if (!plural) return undefined;
    chain.unshift(plural, id.split('/').pop()!);
    current = parentDef;
  }
  return chain;
}
