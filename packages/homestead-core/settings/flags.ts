/**
 * Module-flag schema helpers.
 *
 * Translates the `{ moduleId: { key: ModuleFlagDef } }` declarations
 * collected by `getAllModuleFlagDefs` into two forms:
 *
 *   1. A flat aepbase record shape — one snake_case field per flag,
 *      namespaced `${moduleId_snake}__${key}` — used when reading or
 *      writing values via the aepbase client.
 *   2. A JSON-schema `properties` object, used by the instrumentation
 *      hook that registers the `module-flags` resource definition with
 *      aepbase at server startup.
 *
 * aepbase rules we have to work around (see CLAUDE.md § aepbase schema):
 *   - Field names must be snake_case.
 *   - Enum / minimum / maximum are stripped on round-trip, so enum
 *     flags become plain strings with the allowed values encoded in
 *     the `description`.
 */

import type { ModuleFlagDef, ModuleFlagValue } from '@/modules/types';

/**
 * Separator between the module id and the flag key in a flattened
 * field name. Double-underscore keeps module-vs-flag boundaries
 * unambiguous even when keys themselves contain underscores.
 */
export const MODULE_FLAG_SEPARATOR = '__';

/**
 * Build the aepbase field name for a `(moduleId, key)` pair.
 *
 *   fieldName('gift-cards', 'show_archived') → 'gift_cards__show_archived'
 */
export function fieldName(moduleId: string, key: string): string {
  return `${moduleId.replace(/-/g, '_')}${MODULE_FLAG_SEPARATOR}${key}`;
}

/**
 * Inverse of `fieldName`. Parses a flat key back into its module id
 * (restored to kebab-case) and flag key. Returns `null` if the key
 * does not carry our separator.
 */
export function parseFieldName(
  flat: string,
): { moduleId: string; key: string } | null {
  const idx = flat.indexOf(MODULE_FLAG_SEPARATOR);
  if (idx <= 0) return null;
  const moduleIdSnake = flat.slice(0, idx);
  const key = flat.slice(idx + MODULE_FLAG_SEPARATOR.length);
  if (!key) return null;
  return { moduleId: moduleIdSnake.replace(/_/g, '-'), key };
}

export type ModuleFlagDefs = Record<string, Record<string, ModuleFlagDef>>;
export type ModuleFlagValues = Record<string, Record<string, ModuleFlagValue>>;

/**
 * Merge declared defaults into a `ModuleFlagValues` tree so every
 * declared flag is guaranteed to have a defined value at the call
 * site.
 */
export function withDefaults(
  defs: ModuleFlagDefs,
  values: ModuleFlagValues,
): ModuleFlagValues {
  const out: ModuleFlagValues = {};
  for (const [moduleId, moduleDefs] of Object.entries(defs)) {
    const moduleValues: Record<string, ModuleFlagValue> = {
      ...(values[moduleId] ?? {}),
    };
    for (const [key, def] of Object.entries(moduleDefs)) {
      if (moduleValues[key] === undefined && def.default !== undefined) {
        moduleValues[key] = def.default;
      }
    }
    out[moduleId] = moduleValues;
  }
  return out;
}

/**
 * Unflatten an aepbase record (flat field bag) into the nested
 * `{ moduleId: { key: value } }` shape. Unknown fields — including
 * aepbase-managed ones like `id`, `path`, `create_time` — are ignored.
 */
export function unflatten(
  record: Record<string, unknown> | null | undefined,
  defs: ModuleFlagDefs,
): ModuleFlagValues {
  const nested: ModuleFlagValues = {};
  if (!record) return withDefaults(defs, nested);

  for (const [flatKey, rawValue] of Object.entries(record)) {
    const parsed = parseFieldName(flatKey);
    if (!parsed) continue;
    const { moduleId, key } = parsed;
    const def = defs[moduleId]?.[key];
    if (!def) continue;

    const coerced = coerceValue(def, rawValue);
    if (coerced === undefined) continue;
    (nested[moduleId] ??= {})[key] = coerced;
  }

  return withDefaults(defs, nested);
}

function coerceValue(
  def: ModuleFlagDef,
  raw: unknown,
): ModuleFlagValue | undefined {
  if (raw === null || raw === undefined) return undefined;
  switch (def.type) {
    case 'string':
      return typeof raw === 'string' ? raw : String(raw);
    case 'enum': {
      const str = typeof raw === 'string' ? raw : String(raw);
      return def.options.includes(str) ? str : undefined;
    }
    case 'number': {
      if (typeof raw === 'number') return raw;
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    case 'boolean':
      if (typeof raw === 'boolean') return raw;
      if (raw === 'true') return true;
      if (raw === 'false') return false;
      return undefined;
  }
}

/**
 * JSON-schema property object for a single flag.
 *
 * aepbase strips JSON-schema `enum`, `minimum`, `maximum`, `default`
 * on round-trip, so the allowed values + declared default both ride
 * inside `description` using marker suffixes:
 *
 *   "Base description. (default: foo) (one of: a, b, c)"
 *
 * Order matters: `default` precedes `options` so the parser can peel
 * them off from the right. See `parseDescription` in
 * `modules/superuser/hooks/useModuleFlagsDefinition.ts`.
 */
function propertyFor(def: ModuleFlagDef): Record<string, unknown> {
  const base = def.description ?? def.label;
  const parts: string[] = [];
  if (def.default !== undefined) {
    parts.push(`default: ${String(def.default)}`);
  }
  const description =
    def.type === 'enum'
      ? decorate(base, [...parts, `one of: ${def.options.join(', ')}`])
      : decorate(base, parts);
  const jsonType = def.type === 'enum' ? 'string' : def.type;
  return { type: jsonType, description };
}

function decorate(base: string, parts: string[]): string {
  if (parts.length === 0) return base;
  const suffix = parts.map((p) => `(${p})`).join(' ');
  return base ? `${base} ${suffix}` : suffix;
}

/**
 * Build the JSON schema for the `module-flags` resource: one flattened
 * property per declared flag, sorted alphabetically so diffs are
 * stable across runs of the syncer.
 */
export function buildResourceSchema(defs: ModuleFlagDefs): {
  type: 'object';
  properties: Record<string, Record<string, unknown>>;
} {
  const properties: Record<string, Record<string, unknown>> = {};
  const entries: Array<[string, ModuleFlagDef]> = [];
  for (const [moduleId, moduleDefs] of Object.entries(defs)) {
    for (const [key, def] of Object.entries(moduleDefs)) {
      entries.push([fieldName(moduleId, key), def]);
    }
  }
  entries.sort(([a], [b]) => a.localeCompare(b));
  for (const [flat, def] of entries) {
    properties[flat] = propertyFor(def);
  }
  return { type: 'object', properties };
}
