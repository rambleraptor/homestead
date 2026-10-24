/**
 * Push app-declared resource definitions to aepbase.
 *
 * Called once at Next.js boot from `frontend/src/instrumentation.ts`,
 * and from the e2e bootstrap before any test runs. Idempotent: each
 * resource is created if missing, patched if its schema or metadata
 * has drifted, and skipped otherwise.
 *
 * aepbase's `/aep-resource-definitions` endpoint is single-resource
 * (no bulk apply), so the runner walks the list one at a time after
 * topologically sorting by `parents` — children must come after their
 * parent, which aepbase enforces.
 */

import type { ResourceDefinition, ResourceSchema } from './types';
import {
  toWireSchema,
  validateReferenceTargets,
  validateResourceDefinition,
} from './translate';
import { jsonEqual } from './equal';

const DEFINITIONS_PATH = 'aep-resource-definitions';

/**
 * `'user'` is a built-in resource provided by aepbase's EnableUsers.
 * Treated as already-present for parent dependency resolution.
 */
const BUILTIN_PARENTS: ReadonlySet<string> = new Set(['user']);

export interface SyncResourcesOptions {
  /** Base URL of the aepbase instance (no trailing slash). */
  aepbaseUrl: string;
  /** Admin bearer token. */
  token: string;
  /** Aggregated definitions from apps + built-ins. */
  defs: ResourceDefinition[];
  /** Optional logger; defaults to console. */
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
  /**
   * Populated-column drops the engine should permit, keyed by resource
   * `singular` → the set of field names authorized to drop. Sourced from
   * migrations that declare `drops`. A resource absent here (or a field not in
   * its set) can only drop columns that hold no data. See the drop guard in
   * `homestead-server/src/engine/registry.ts`.
   */
  authorizedDrops?: ReadonlyMap<string, ReadonlySet<string>>;
}

export interface SyncResourcesResult {
  created: string[];
  updated: string[];
  unchanged: string[];
}

interface AepResourceDefinitionResponse {
  singular?: string;
  plural?: string;
  description?: string;
  user_settable_create?: boolean;
  superuser_write?: boolean;
  independent_access?: boolean;
  parents?: string[];
  schema?: unknown;
}

export async function syncResourceDefinitions(
  options: SyncResourcesOptions,
): Promise<SyncResourcesResult> {
  const { aepbaseUrl, token, defs, logger = console, authorizedDrops } = options;

  assertNoDuplicateSingulars(defs);
  for (const def of defs) validateResourceDefinition(def);
  validateReferenceTargets(defs);
  const ordered = topoSort(defs);
  const existingIds = await listExistingIds(aepbaseUrl, token);

  const result: SyncResourcesResult = {
    created: [],
    updated: [],
    unchanged: [],
  };

  for (const def of ordered) {
    try {
      const schema = toWireSchema(def.fields, def.singular);
      if (!existingIds.has(def.singular)) {
        await createDefinition(aepbaseUrl, token, def, schema);
        result.created.push(def.singular);
        continue;
      }

      const existing = await fetchExisting(aepbaseUrl, token, def.singular);
      if (existing && definitionsMatch(existing, def, schema)) {
        result.unchanged.push(def.singular);
        continue;
      }

      await patchDefinition(aepbaseUrl, token, def, schema, authorizedDrops?.get(def.singular));
      result.updated.push(def.singular);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `[resources] failed to sync "${def.singular}": ${message}`,
      );
    }
  }

  if (result.created.length || result.updated.length) {
    logger.info(
      `[resources] sync complete: ${result.created.length} created, ${result.updated.length} updated, ${result.unchanged.length} unchanged`,
    );
  }
  return result;
}

function assertNoDuplicateSingulars(defs: ResourceDefinition[]): void {
  const seen = new Set<string>();
  for (const def of defs) {
    if (seen.has(def.singular)) {
      throw new Error(
        `[resources] duplicate singular "${def.singular}" — two apps declared the same resource definition`,
      );
    }
    seen.add(def.singular);
  }
}

/**
 * Stable topo sort by `parents`. Preserves the input order when
 * dependencies allow it (so the per-app declaration order is
 * preserved as a tie-breaker). Throws on cycles or unknown parents.
 */
function topoSort(defs: ResourceDefinition[]): ResourceDefinition[] {
  const known = new Set(defs.map((d) => d.singular));
  const remaining = [...defs];
  const out: ResourceDefinition[] = [];
  const placed = new Set<string>(BUILTIN_PARENTS);

  while (remaining.length) {
    const idx = remaining.findIndex((def) =>
      (def.parents ?? []).every((p) => placed.has(p)),
    );
    if (idx === -1) {
      const stuck = remaining.map((d) => d.singular).join(', ');
      const missing = remaining
        .flatMap((d) => d.parents ?? [])
        .filter((p) => !placed.has(p) && !known.has(p));
      if (missing.length) {
        throw new Error(
          `[resources] unknown parent(s): ${[...new Set(missing)].join(', ')}`,
        );
      }
      throw new Error(`[resources] cycle detected among: ${stuck}`);
    }
    const [def] = remaining.splice(idx, 1);
    out.push(def);
    placed.add(def.singular);
  }
  return out;
}

async function listExistingIds(
  aepbaseUrl: string,
  token: string,
): Promise<Set<string>> {
  const res = await fetch(
    `${aepbaseUrl}/${DEFINITIONS_PATH}?max_page_size=200`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `aepbase GET /${DEFINITIONS_PATH} → ${res.status}: ${text}`,
    );
  }
  const body = (await res.json()) as { results?: Array<{ id: string }> };
  return new Set((body.results ?? []).map((r) => r.id));
}

async function fetchExisting(
  aepbaseUrl: string,
  token: string,
  singular: string,
): Promise<AepResourceDefinitionResponse | null> {
  const res = await fetch(
    `${aepbaseUrl}/${DEFINITIONS_PATH}/${singular}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `aepbase GET /${DEFINITIONS_PATH}/${singular} → ${res.status}: ${text}`,
    );
  }
  return (await res.json()) as AepResourceDefinitionResponse;
}

async function createDefinition(
  aepbaseUrl: string,
  token: string,
  def: ResourceDefinition,
  schema: ResourceSchema,
): Promise<void> {
  const res = await fetch(
    `${aepbaseUrl}/${DEFINITIONS_PATH}?id=${def.singular}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      // Only the wire fields aepbase understands — never the server-only
      // `customMethods` / `bulkImport` (whose lazy `load` thunks
      // JSON.stringify drops, but whose surrounding metadata would otherwise
      // leak through), and the translated JSON schema, never the authored
      // `fields`.
      body: JSON.stringify(wireDefinition(def, schema)),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `aepbase POST /${DEFINITIONS_PATH}?id=${def.singular} → ${res.status}: ${text}`,
    );
  }
}

async function patchDefinition(
  aepbaseUrl: string,
  token: string,
  def: ResourceDefinition,
  schema: ResourceSchema,
  authorizedDrops?: ReadonlySet<string>,
): Promise<void> {
  const body = {
    description: def.description,
    user_settable_create: def.user_settable_create,
    superuser_write: def.superuser_write,
    // Sent explicitly (not left undefined) so dropping the opt-out from a
    // definition turns inheritance back on instead of leaving it stale.
    independent_access: def.independent_access ?? false,
    parents: def.parents,
    schema,
  };
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/merge-patch+json',
  };
  // Authorize dropping the named (populated) columns; the engine refuses
  // otherwise. Omitted when nothing is authorized, so the default stays safe.
  if (authorizedDrops && authorizedDrops.size > 0) {
    headers['X-Homestead-Authorized-Drops'] = [...authorizedDrops].join(',');
  }
  const res = await fetch(
    `${aepbaseUrl}/${DEFINITIONS_PATH}/${def.singular}`,
    {
      method: 'PATCH',
      headers,
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `aepbase PATCH /${DEFINITIONS_PATH}/${def.singular} → ${res.status}: ${text}`,
    );
  }
}

/** Project a definition down to the fields aepbase's endpoint accepts. */
function wireDefinition(
  def: ResourceDefinition,
  schema: ResourceSchema,
): Record<string, unknown> {
  return {
    singular: def.singular,
    plural: def.plural,
    description: def.description,
    user_settable_create: def.user_settable_create,
    superuser_write: def.superuser_write,
    independent_access: def.independent_access ?? false,
    parents: def.parents,
    schema,
  };
}

function definitionsMatch(
  existing: AepResourceDefinitionResponse,
  desired: ResourceDefinition,
  schema: ResourceSchema,
): boolean {
  return (
    jsonEqual(existing.schema, schema) &&
    (existing.description ?? '') === (desired.description ?? '') &&
    (existing.user_settable_create ?? false) ===
      (desired.user_settable_create ?? false) &&
    (existing.superuser_write ?? false) === (desired.superuser_write ?? false) &&
    (existing.independent_access ?? false) === (desired.independent_access ?? false) &&
    jsonEqual(existing.parents ?? [], desired.parents ?? [])
  );
}
