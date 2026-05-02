/**
 * Push module-declared resource definitions to aepbase.
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

import type { ResourceDefinition } from './types';
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
  /** Aggregated definitions from modules + built-ins. */
  defs: ResourceDefinition[];
  /** Optional logger; defaults to console. */
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
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
  parents?: string[];
  schema?: unknown;
}

export async function syncResourceDefinitions(
  options: SyncResourcesOptions,
): Promise<SyncResourcesResult> {
  const { aepbaseUrl, token, defs, logger = console } = options;

  assertNoDuplicateSingulars(defs);
  const ordered = topoSort(defs);
  const existingIds = await listExistingIds(aepbaseUrl, token);

  const result: SyncResourcesResult = {
    created: [],
    updated: [],
    unchanged: [],
  };

  for (const def of ordered) {
    try {
      if (!existingIds.has(def.singular)) {
        await createDefinition(aepbaseUrl, token, def);
        result.created.push(def.singular);
        continue;
      }

      const existing = await fetchExisting(aepbaseUrl, token, def.singular);
      if (existing && definitionsMatch(existing, def)) {
        result.unchanged.push(def.singular);
        continue;
      }

      await patchDefinition(aepbaseUrl, token, def);
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
        `[resources] duplicate singular "${def.singular}" — two modules declared the same resource definition`,
      );
    }
    seen.add(def.singular);
  }
}

/**
 * Stable topo sort by `parents`. Preserves the input order when
 * dependencies allow it (so the per-module declaration order is
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
): Promise<void> {
  const res = await fetch(
    `${aepbaseUrl}/${DEFINITIONS_PATH}?id=${def.singular}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(def),
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
): Promise<void> {
  const body = {
    description: def.description,
    user_settable_create: def.user_settable_create,
    parents: def.parents,
    schema: def.schema,
  };
  const res = await fetch(
    `${aepbaseUrl}/${DEFINITIONS_PATH}/${def.singular}`,
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
      `aepbase PATCH /${DEFINITIONS_PATH}/${def.singular} → ${res.status}: ${text}`,
    );
  }
}

function definitionsMatch(
  existing: AepResourceDefinitionResponse,
  desired: ResourceDefinition,
): boolean {
  return (
    jsonEqual(existing.schema, desired.schema) &&
    (existing.description ?? '') === (desired.description ?? '') &&
    (existing.user_settable_create ?? false) ===
      (desired.user_settable_create ?? false) &&
    jsonEqual(existing.parents ?? [], desired.parents ?? [])
  );
}
