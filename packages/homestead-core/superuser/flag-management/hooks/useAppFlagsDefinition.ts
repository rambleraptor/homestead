/**
 * Fetch the `app-flag` resource definition from aepbase and parse
 * its JSON schema back into a `AppFlagDefs` tree that the Flag
 * Management UI can render.
 *
 * aepbase is the source of truth for which flags exist — this hook
 * does NOT fall back to the client-side app registry. If the
 * resource definition hasn't been registered yet the hook returns an
 * empty tree and the UI surfaces an empty state.
 */

import { useQuery } from '@tanstack/react-query';
import { aepbase, AepbaseError } from '@rambleraptor/homestead-core/api/aepbase';
import {
  APP_FLAG_SEPARATOR,
  isAudienceField,
  parseFieldName,
  type AppFlagDefs,
} from '@rambleraptor/homestead-core/settings/flags';
import type { AppFlagDef } from '@rambleraptor/homestead-core/apps/types';

export const APP_FLAGS_DEFINITION_QUERY_KEY = [
  'app-flags-definition',
] as const;

interface ResourceDefinition {
  schema?: {
    properties?: Record<string, { type?: string; description?: string }>;
  };
}

export interface UseAppFlagsDefinitionResult {
  defs: AppFlagDefs;
  isLoading: boolean;
  isMissing: boolean;
  error: Error | null;
}

export function useAppFlagsDefinition(): UseAppFlagsDefinitionResult {
  const query = useQuery({
    queryKey: APP_FLAGS_DEFINITION_QUERY_KEY,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<AppFlagDefs | null> => {
      try {
        const def = await aepbase.get<ResourceDefinition>(
          'aep-resource-definitions',
          'app-flag',
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

function parseSchema(def: ResourceDefinition): AppFlagDefs {
  const properties = def.schema?.properties ?? {};
  const out: AppFlagDefs = {};
  for (const [flat, prop] of Object.entries(properties)) {
    // A flag's audience rides in a sibling field; it isn't a flag of its own.
    if (isAudienceField(flat)) continue;
    const parsed = parseFieldName(flat);
    if (!parsed) continue;
    const flagDef = toFlagDef(parsed.key, prop);
    if (!flagDef) continue;
    (out[parsed.appId] ??= {})[parsed.key] = flagDef;
  }
  return out;
}

const ENUM_MARKER_RE = /\s*\(one of:\s*([^)]+)\)\s*$/;
const DEFAULT_MARKER_RE = /\s*\(default:\s*([^)]*)\)\s*$/;

function toFlagDef(
  key: string,
  prop: { type?: string; description?: string },
): AppFlagDef | null {
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

export { APP_FLAG_SEPARATOR };
