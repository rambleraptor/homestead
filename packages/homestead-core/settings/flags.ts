/**
 * App-flag schema helpers.
 *
 * Translates the `{ appId: { key: AppFlagDef } }` declarations
 * collected by `getAllAppFlagDefs` into two forms:
 *
 *   1. A flat aepbase record shape — one snake_case field per flag,
 *      namespaced `${appId_snake}__${key}` — used when reading or
 *      writing values via the aepbase client.
 *   2. A JSON-schema `properties` object, used by the instrumentation
 *      hook that registers the `app-flags` resource definition with
 *      aepbase at server startup.
 *
 * aepbase rules we have to work around (see CLAUDE.md § aepbase schema):
 *   - Field names must be snake_case.
 *   - Enum / minimum / maximum are stripped on round-trip, so enum
 *     flags become plain strings with the allowed values encoded in
 *     the `description`.
 */

import type { AppFlagDef, AppFlagValue } from '@rambleraptor/homestead-core/apps/types';

/**
 * Separator between the app id and the flag key in a flattened
 * field name. Double-underscore keeps app-vs-flag boundaries
 * unambiguous even when keys themselves contain underscores.
 */
export const APP_FLAG_SEPARATOR = '__';

/**
 * Build the aepbase field name for a `(appId, key)` pair.
 *
 *   fieldName('gift-cards', 'show_archived') → 'gift_cards__show_archived'
 */
export function fieldName(appId: string, key: string): string {
  return `${appId.replace(/-/g, '_')}${APP_FLAG_SEPARATOR}${key}`;
}

/**
 * Inverse of `fieldName`. Parses a flat key back into its app id
 * (restored to kebab-case) and flag key. Returns `null` if the key
 * does not carry our separator.
 */
export function parseFieldName(
  flat: string,
): { appId: string; key: string } | null {
  const idx = flat.indexOf(APP_FLAG_SEPARATOR);
  if (idx <= 0) return null;
  const appIdSnake = flat.slice(0, idx);
  const key = flat.slice(idx + APP_FLAG_SEPARATOR.length);
  if (!key) return null;
  return { appId: appIdSnake.replace(/_/g, '-'), key };
}

export type AppFlagDefs = Record<string, Record<string, AppFlagDef>>;
export type AppFlagValues = Record<string, Record<string, AppFlagValue>>;

// ───────────────────────────── audiences ─────────────────────────────

/**
 * Who a flag's stored value applies to: `'everyone'`, or the members of the
 * named groups (an empty list: nobody). Anyone outside the audience reads the
 * flag's declared default, as if nothing had been set — so a feature can be
 * rolled out to a "Beta" group before the household.
 */
export type FlagAudience = 'everyone' | string[];

/** Suffix of the sibling field that holds a flag's audience. */
export const AUDIENCE_SUFFIX = '__audience';

/**
 * The field holding a flag's audience, beside the flag's own:
 *
 *   audienceFieldName('gift-cards', 'show_archived') → 'gift_cards__show_archived__audience'
 *
 * `parseFieldName` splits on the first separator, so this reads back as the
 * key `show_archived__audience` — which no flag declares, so the value
 * readers skip it and {@link unflattenAudiences} picks it up instead.
 */
export function audienceFieldName(appId: string, key: string): string {
  return `${fieldName(appId, key)}${AUDIENCE_SUFFIX}`;
}

/** Whether a flat field (or parsed key) names an audience rather than a flag. */
export function isAudienceField(flatOrKey: string): boolean {
  return flatOrKey.endsWith(AUDIENCE_SUFFIX);
}

/** The stored form: empty for everyone, else a JSON list of group names. */
export function encodeAudience(audience: FlagAudience): string {
  return audience === 'everyone' ? '' : JSON.stringify(audience);
}

/** Inverse of {@link encodeAudience}; anything unreadable is everyone. */
export function decodeAudience(raw: unknown): FlagAudience {
  if (typeof raw !== 'string' || raw === '') return 'everyone';
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((g): g is string => typeof g === 'string') : 'everyone';
  } catch {
    return 'everyone';
  }
}

/** Whether someone in `groupNames` is in `audience`. */
export function inAudience(audience: FlagAudience, groupNames: readonly string[]): boolean {
  return audience === 'everyone' || audience.some((g) => groupNames.includes(g));
}

export type AppFlagAudiences = Record<string, Record<string, FlagAudience>>;

/** Every declared flag's audience from the singleton record (everyone when unset). */
export function unflattenAudiences(
  record: Record<string, unknown> | null | undefined,
  defs: AppFlagDefs,
): AppFlagAudiences {
  const out: AppFlagAudiences = {};
  for (const [appId, appDefs] of Object.entries(defs)) {
    out[appId] = {};
    for (const key of Object.keys(appDefs)) {
      out[appId][key] = decodeAudience(record?.[audienceFieldName(appId, key)]);
    }
  }
  return out;
}

/**
 * Merge declared defaults into a `AppFlagValues` tree so every
 * declared flag is guaranteed to have a defined value at the call
 * site.
 */
export function withDefaults(
  defs: AppFlagDefs,
  values: AppFlagValues,
): AppFlagValues {
  const out: AppFlagValues = {};
  for (const [appId, appDefs] of Object.entries(defs)) {
    const appValues: Record<string, AppFlagValue> = {
      ...(values[appId] ?? {}),
    };
    for (const [key, def] of Object.entries(appDefs)) {
      if (appValues[key] === undefined && def.default !== undefined) {
        appValues[key] = def.default;
      }
    }
    out[appId] = appValues;
  }
  return out;
}

/**
 * Unflatten an aepbase record (flat field bag) into the nested
 * `{ appId: { key: value } }` shape. Unknown fields — including
 * aepbase-managed ones like `id`, `path`, `create_time` — are ignored.
 */
export function unflatten(
  record: Record<string, unknown> | null | undefined,
  defs: AppFlagDefs,
): AppFlagValues {
  const nested: AppFlagValues = {};
  if (!record) return withDefaults(defs, nested);

  for (const [flatKey, rawValue] of Object.entries(record)) {
    const parsed = parseFieldName(flatKey);
    if (!parsed) continue;
    const { appId, key } = parsed;
    const def = defs[appId]?.[key];
    if (!def) continue;

    const coerced = coerceValue(def, rawValue);
    if (coerced === undefined) continue;
    (nested[appId] ??= {})[key] = coerced;
  }

  return withDefaults(defs, nested);
}

function coerceValue(
  def: AppFlagDef,
  raw: unknown,
): AppFlagValue | undefined {
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
 * `apps/superuser/hooks/useAppFlagsDefinition.ts`.
 */
function propertyFor(def: AppFlagDef): Record<string, unknown> {
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
 * Build the JSON schema for the `app-flags` resource: one flattened
 * property per declared flag, plus its audience field, sorted
 * alphabetically so diffs are stable across runs of the syncer.
 */
export function buildResourceSchema(defs: AppFlagDefs): {
  type: 'object';
  properties: Record<string, Record<string, unknown>>;
} {
  const properties: Record<string, Record<string, unknown>> = {};
  const entries: Array<[string, Record<string, unknown>]> = [];
  for (const [appId, appDefs] of Object.entries(defs)) {
    for (const [key, def] of Object.entries(appDefs)) {
      entries.push([fieldName(appId, key), propertyFor(def)]);
      entries.push([
        audienceFieldName(appId, key),
        {
          type: 'string',
          description:
            `Who "${def.label}" applies to: empty for everyone, else a JSON list of ` +
            'group names (an empty list: nobody). Others read the default.',
        },
      ]);
    }
  }
  entries.sort(([a], [b]) => a.localeCompare(b));
  for (const [flat, property] of entries) {
    properties[flat] = property;
  }
  return { type: 'object', properties };
}
