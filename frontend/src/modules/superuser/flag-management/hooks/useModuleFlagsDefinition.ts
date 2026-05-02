/**
 * Fetch the `module-flag` resource definition from aepbase and parse
 * its JSON schema back into a `ModuleFlagDefs` tree that the Flag
 * Management UI can render.
 *
 * aepbase is the source of truth for which flags exist — this hook
 * does NOT fall back to the client-side module registry. If the
 * resource definition hasn't been registered yet the hook returns an
 * empty tree and the UI surfaces an empty state.
 */

import { useQuery } from '@tanstack/react-query';
import { aepbase, AepbaseError } from '@rambleraptor/homestead-core/api/aepbase';
import {
  MODULE_FLAG_SEPARATOR,
  parseFieldName,
  type ModuleFlagDefs,
} from '@/modules/settings/flags';
import type { ModuleFlagDef } from '@/modules/types';

export const MODULE_FLAGS_DEFINITION_QUERY_KEY = [
  'module-flags-definition',
] as const;

interface ResourceDefinition {
  schema?: {
    properties?: Record<string, { type?: string; description?: string }>;
  };
}

export interface UseModuleFlagsDefinitionResult {
  defs: ModuleFlagDefs;
  isLoading: boolean;
  isMissing: boolean;
  error: Error | null;
}

export function useModuleFlagsDefinition(): UseModuleFlagsDefinitionResult {
  const query = useQuery({
    queryKey: MODULE_FLAGS_DEFINITION_QUERY_KEY,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<ModuleFlagDefs | null> => {
      try {
        const def = await aepbase.get<ResourceDefinition>(
          'aep-resource-definitions',
          'module-flag',
        );
        return parseSchema(def);
      } catch (error) {
        if (error instanceof AepbaseError && error.code === 404) return null;
        throw error;
      }
    },
  });

  return {
    defs: query.data ?? {},
    isLoading: query.isLoading,
    isMissing: query.data === null,
    error: (query.error as Error | null) ?? null,
  };
}

function parseSchema(def: ResourceDefinition): ModuleFlagDefs {
  const properties = def.schema?.properties ?? {};
  const out: ModuleFlagDefs = {};
  for (const [flat, prop] of Object.entries(properties)) {
    const parsed = parseFieldName(flat);
    if (!parsed) continue;
    const flagDef = toFlagDef(parsed.key, prop);
    if (!flagDef) continue;
    (out[parsed.moduleId] ??= {})[parsed.key] = flagDef;
  }
  return out;
}

const ENUM_MARKER_RE = /\s*\(one of:\s*([^)]+)\)\s*$/;
const DEFAULT_MARKER_RE = /\s*\(default:\s*([^)]*)\)\s*$/;

function toFlagDef(
  key: string,
  prop: { type?: string; description?: string },
): ModuleFlagDef | null {
  const label = humanize(key);
  let remaining = prop.description ?? '';

  const enumMatch = remaining.match(ENUM_MARKER_RE);
  const options = enumMatch
    ? enumMatch[1].split(',').map((s) => s.trim()).filter(Boolean)
    : undefined;
  if (enumMatch) remaining = remaining.replace(ENUM_MARKER_RE, '');

  const defaultMatch = remaining.match(DEFAULT_MARKER_RE);
  const rawDefault = defaultMatch ? defaultMatch[1].trim() : undefined;
  if (defaultMatch) remaining = remaining.replace(DEFAULT_MARKER_RE, '');

  const description = remaining;

  if (options) {
    return { type: 'enum', label, description, options, default: rawDefault };
  }
  if (prop.type === 'string') {
    return { type: 'string', label, description, default: rawDefault };
  }
  if (prop.type === 'number') {
    const n = rawDefault === undefined ? undefined : Number(rawDefault);
    return {
      type: 'number',
      label,
      description,
      default: n !== undefined && Number.isFinite(n) ? n : undefined,
    };
  }
  if (prop.type === 'boolean') {
    return {
      type: 'boolean',
      label,
      description,
      default:
        rawDefault === 'true' ? true : rawDefault === 'false' ? false : undefined,
    };
  }
  return null;
}

function humanize(key: string): string {
  const spaced = key.replace(/_/g, ' ').trim();
  if (!spaced) return key;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export { MODULE_FLAG_SEPARATOR };
