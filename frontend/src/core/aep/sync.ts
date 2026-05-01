/**
 * Generic resource-definition syncer for aepbase.
 *
 * Idempotently pushes one or more `AepResourceDefinition`s to aepbase's
 * `/aep-resource-definitions` meta-API:
 *
 *   - GET  /aep-resource-definitions/{singular}            (probe)
 *   - POST /aep-resource-definitions?id={singular}         (create)
 *   - PATCH /aep-resource-definitions/{singular}           (update schema)
 *
 * Drift detection is structural via canonical JSON; only the `schema`
 * field is diffed/PATCHed (mirrors the existing module-flags syncer
 * and aepbase's per-field constraints — `parents` cannot change after
 * creation, and changing field types is rejected).
 *
 * Used by:
 *   - `frontend/scripts/apply-schema.ts` (the `terraform apply` analogue)
 *   - `frontend/src/core/module-flags/sync.ts` (boot-time module-flags sync)
 *   - `tests/e2e/config/apply-schema.ts` (Playwright global setup)
 */

import type { AepResourceDefinition } from './types';

const DEFINITIONS_PATH = 'aep-resource-definitions';

export type SyncAction = 'created' | 'updated' | 'noop';

export interface SyncResult {
  singular: string;
  action: SyncAction;
}

export interface SyncFailure {
  singular: string;
  error: Error;
}

export interface SyncBatchResult {
  results: SyncResult[];
  failures: SyncFailure[];
}

export interface SyncOptions {
  aepbaseUrl: string;
  token: string;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
}

export async function syncResourceDefinition(
  opts: SyncOptions & { def: AepResourceDefinition },
): Promise<SyncResult> {
  const { aepbaseUrl, token, def, logger = console } = opts;
  const existing = await fetchExisting(aepbaseUrl, token, def.singular);

  if (!existing) {
    await createDefinition(aepbaseUrl, token, def);
    logger.info(`[aep] created ${def.singular}`);
    return { singular: def.singular, action: 'created' };
  }

  if (canonicalStringify(existing.schema) === canonicalStringify(def.schema)) {
    return { singular: def.singular, action: 'noop' };
  }

  await patchDefinition(aepbaseUrl, token, def.singular, {
    schema: def.schema,
  });
  logger.info(`[aep] updated ${def.singular}`);
  return { singular: def.singular, action: 'updated' };
}

/**
 * Sync many definitions in dependency order: parents must exist before
 * children. Failures on individual resources are collected; the batch
 * continues so a single bad definition doesn't block the rest.
 */
export async function syncAllResourceDefinitions(
  opts: SyncOptions & { defs: readonly AepResourceDefinition[] },
): Promise<SyncBatchResult> {
  const ordered = topologicalSort(opts.defs);
  const results: SyncResult[] = [];
  const failures: SyncFailure[] = [];

  for (const def of ordered) {
    try {
      results.push(
        await syncResourceDefinition({
          aepbaseUrl: opts.aepbaseUrl,
          token: opts.token,
          logger: opts.logger,
          def,
        }),
      );
    } catch (error) {
      failures.push({
        singular: def.singular,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  return { results, failures };
}

/**
 * Order resources so each definition's `parents` come earlier in the
 * list. The built-in `user` parent is always available.
 */
function topologicalSort(
  defs: readonly AepResourceDefinition[],
): AepResourceDefinition[] {
  const bySingular = new Map<string, AepResourceDefinition>();
  for (const d of defs) bySingular.set(d.singular, d);

  const sorted: AepResourceDefinition[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (def: AepResourceDefinition): void => {
    if (visited.has(def.singular)) return;
    if (visiting.has(def.singular)) {
      throw new Error(
        `Cyclic resource-definition parents involving "${def.singular}"`,
      );
    }
    visiting.add(def.singular);
    for (const parent of def.parents ?? []) {
      const parentDef = bySingular.get(parent);
      if (parentDef) visit(parentDef);
      // Unknown parents (e.g. built-in `user`) are assumed to exist.
    }
    visiting.delete(def.singular);
    visited.add(def.singular);
    sorted.push(def);
  };

  for (const d of defs) visit(d);
  return sorted;
}

async function fetchExisting(
  aepbaseUrl: string,
  token: string,
  singular: string,
): Promise<AepResourceDefinition | null> {
  const res = await fetch(`${aepbaseUrl}/${DEFINITIONS_PATH}/${singular}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(
      `aepbase GET /${DEFINITIONS_PATH}/${singular} → ${res.status}: ${await res.text()}`,
    );
  }
  return (await res.json()) as AepResourceDefinition;
}

async function createDefinition(
  aepbaseUrl: string,
  token: string,
  def: AepResourceDefinition,
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
    throw new Error(
      `aepbase POST /${DEFINITIONS_PATH}?id=${def.singular} → ${res.status}: ${await res.text()}`,
    );
  }
}

async function patchDefinition(
  aepbaseUrl: string,
  token: string,
  singular: string,
  body: Partial<AepResourceDefinition>,
): Promise<void> {
  const res = await fetch(`${aepbaseUrl}/${DEFINITIONS_PATH}/${singular}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/merge-patch+json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(
      `aepbase PATCH /${DEFINITIONS_PATH}/${singular} → ${res.status}: ${await res.text()}`,
    );
  }
}

/**
 * Stable JSON serialization with sorted object keys, used for
 * structural equality of two schemas regardless of key order.
 */
export function canonicalStringify(value: unknown): string {
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
