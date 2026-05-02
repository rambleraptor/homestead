/**
 * Push the aggregated module-flags schema to aepbase.
 *
 * Called from `src/instrumentation.ts` when the Next.js server boots.
 * Idempotent: on repeat runs it PATCHes the existing resource
 * definition when the schema has drifted.
 *
 * aepbase's `/aep-resource-definitions` endpoint mirrors the shape used
 * by the terraform provider (singular/plural/schema/parents). See
 * `aepbase/terraform/*.tf` for equivalent HCL examples.
 */

import { buildResourceSchema, type ModuleFlagDefs } from '@/modules/settings/flags';

const RESOURCE_SINGULAR = 'module-flag';
const RESOURCE_PLURAL = 'module-flags';
const DEFINITIONS_PATH = 'aep-resource-definitions';

interface AepResourceDefinition {
  singular?: string;
  plural?: string;
  description?: string;
  user_settable_create?: boolean;
  parents?: string[];
  schema?: unknown;
}

export interface SyncOptions {
  /** Base URL of the aepbase instance (no trailing slash). */
  aepbaseUrl: string;
  /** Admin bearer token with permission to manage resource definitions. */
  token: string;
  /** Defs from `getAllModuleFlagDefs()`. */
  defs: ModuleFlagDefs;
  /** Optional logger; defaults to console. */
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
}

export interface SyncResult {
  action: 'created' | 'updated' | 'noop';
}

export async function syncModuleFlagsSchema(
  options: SyncOptions,
): Promise<SyncResult> {
  const { aepbaseUrl, token, defs, logger = console } = options;
  const schema = buildResourceSchema(defs);

  const desired: AepResourceDefinition = {
    singular: RESOURCE_SINGULAR,
    plural: RESOURCE_PLURAL,
    description:
      'Household-wide module flags. Managed by the Next.js server via ' +
      'getAllModuleFlagDefs() — do not edit through terraform.',
    user_settable_create: true,
    schema,
  };

  const existing = await fetchExisting(aepbaseUrl, token);

  if (!existing) {
    await createDefinition(aepbaseUrl, token, desired);
    logger.info(
      `[module-flags] created resource definition with ${Object.keys(schema.properties).length} field(s)`,
    );
    return { action: 'created' };
  }

  if (schemasEqual(existing.schema, schema)) {
    return { action: 'noop' };
  }

  await patchDefinition(aepbaseUrl, token, { schema });
  logger.info(
    `[module-flags] updated resource definition to ${Object.keys(schema.properties).length} field(s)`,
  );
  return { action: 'updated' };
}

async function fetchExisting(
  aepbaseUrl: string,
  token: string,
): Promise<AepResourceDefinition | null> {
  const res = await fetch(
    `${aepbaseUrl}/${DEFINITIONS_PATH}/${RESOURCE_SINGULAR}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `aepbase GET /${DEFINITIONS_PATH}/${RESOURCE_SINGULAR} → ${res.status}: ${text}`,
    );
  }
  return (await res.json()) as AepResourceDefinition;
}

async function createDefinition(
  aepbaseUrl: string,
  token: string,
  body: AepResourceDefinition,
): Promise<void> {
  const res = await fetch(
    `${aepbaseUrl}/${DEFINITIONS_PATH}?id=${RESOURCE_SINGULAR}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `aepbase POST /${DEFINITIONS_PATH} → ${res.status}: ${text}`,
    );
  }
}

async function patchDefinition(
  aepbaseUrl: string,
  token: string,
  body: Partial<AepResourceDefinition>,
): Promise<void> {
  const res = await fetch(
    `${aepbaseUrl}/${DEFINITIONS_PATH}/${RESOURCE_SINGULAR}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/merge-patch+json',
      },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `aepbase PATCH /${DEFINITIONS_PATH}/${RESOURCE_SINGULAR} → ${res.status}: ${text}`,
    );
  }
}

function schemasEqual(a: unknown, b: unknown): boolean {
  // Structural comparison via canonical JSON — our schemas are tiny and
  // field order is already stable (alphabetical) from buildResourceSchema.
  return canonicalStringify(a) === canonicalStringify(b);
}

function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalStringify).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(
    ([a], [b]) => a.localeCompare(b),
  );
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalStringify(v)}`).join(',')}}`;
}
