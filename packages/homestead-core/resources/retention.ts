/**
 * Retention: delete a resource's rows once they pass an age.
 *
 * A resource declares `retention: { days, field?, where? }` (see
 * `ResourceRetention`).
 * Once a day the `resource-retention` cron (on the always-installed Operations
 * app) calls {@link sweepRetention}, which for each such resource lists the
 * expired rows with a server-side time filter and deletes each one — with its
 * child subtree — through the ordinary API. Going through the API rather than
 * the database means everything a delete normally does still happens: a
 * `restrict` reference blocks it (the row is skipped and logged, never forced),
 * `set-null` / `cascade` referrers are updated, and the change feed tells open
 * tabs.
 *
 * Each run deletes at most {@link RETENTION_SWEEP_CAP} rows per resource, so a
 * large backlog (a resource that just gained a retention window) drains over a
 * few days instead of in one long firing.
 *
 * Server-only in practice (it deletes), but free of server imports: the caller
 * hands in the client, so tests drive it against an in-memory engine.
 */

import { HomesteadError, type HomesteadClient } from '@rambleraptor/homestead-client';
import type { ResourceDefinition, ResourceRetention } from './types';

/** Most rows one run deletes from one resource. */
export const RETENTION_SWEEP_CAP = 500;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The cutoff instant for `days` before `firedAt`, in the engine's timestamp
 * format (second-precision UTC RFC 3339) so it compares as text against
 * `create_time` / `update_time`.
 */
export function retentionCutoff(firedAt: string, days: number): string {
  const ms = new Date(firedAt).getTime() - days * DAY_MS;
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Engine-managed timestamps: set on every row, so they never need a fallback. */
const ENGINE_TIMESTAMPS = new Set(['create_time', 'update_time']);

/**
 * The server-side filter selecting candidate rows. On an engine timestamp it is
 * exact. On a declared field it is a superset — `field < cutoff || update_time
 * < cutoff` — because a row whose field is unset falls back to `update_time`,
 * and the filter grammar can't say "is unset"; {@link isExpired} makes the
 * exact call on each candidate. A `where` narrows either form.
 */
export function retentionFilter(retention: ResourceRetention, cutoff: string): string {
  const quoted = JSON.stringify(cutoff);
  const field = retention.field ?? 'update_time';
  const age = ENGINE_TIMESTAMPS.has(field)
    ? `${field} < ${quoted}`
    : `${field} < ${quoted} || update_time < ${quoted}`;
  return retention.where ? `(${retention.where}) && (${age})` : age;
}

/**
 * Whether one row is past its window: its field when set, else `update_time`.
 * (`where` is the server's call — the filter already applied it.)
 */
export function isExpired(
  record: Record<string, unknown>,
  retention: ResourceRetention,
  cutoff: string,
): boolean {
  const own = retention.field ? record[retention.field] : undefined;
  const stamp = typeof own === 'string' && own !== '' ? own : record.update_time;
  if (typeof stamp !== 'string') return false;
  const at = new Date(stamp).getTime();
  return Number.isFinite(at) && at < new Date(cutoff).getTime();
}

/** The definitions a sweep acts on: top-level, with a retention window. */
export function retainedResources(defs: readonly ResourceDefinition[]): ResourceDefinition[] {
  return defs.filter((d) => d.retention && (d.parents ?? []).length === 0);
}

/** What one sweep did to one resource. */
export interface RetentionResult {
  resource: string;
  cutoff: string;
  deleted: number;
  /** Rows a `restrict` reference (or child-row rule) kept alive. */
  blocked: number;
  /** Rows whose delete failed for any other reason. */
  failed: number;
  /** True when the cap stopped the run with more rows still expired. */
  capped: boolean;
}

export interface SweepOptions {
  client: HomesteadClient;
  defs: readonly ResourceDefinition[];
  /** RFC 3339 time the sweep is anchored to (the cron's `firedAt`). */
  firedAt: string;
  log?: (message: string) => Promise<void> | void;
  cap?: number;
}

/** Collect up to `cap + 1` expired ids (the extra one reports `capped`). */
async function expiredIds(
  client: HomesteadClient,
  def: ResourceDefinition,
  cutoff: string,
  cap: number,
): Promise<string[]> {
  const retention = def.retention!;
  const ids: string[] = [];
  // Collected before any delete: deleting while paging would shift the pages.
  for await (const record of client
    .collection<Record<string, unknown>>(def.plural)
    .list({ filter: retentionFilter(retention, cutoff) })) {
    if (!isExpired(record, retention, cutoff)) continue;
    ids.push(String(record.id));
    if (ids.length > cap) break;
  }
  return ids;
}

/**
 * Delete every expired row of every resource that declares a retention window,
 * up to the cap per resource. Never throws for one bad row or one bad resource:
 * the result reports what happened so the cron's operation records it.
 */
export async function sweepRetention(opts: SweepOptions): Promise<RetentionResult[]> {
  const cap = opts.cap ?? RETENTION_SWEEP_CAP;
  const log = async (message: string) => {
    await opts.log?.(message);
  };
  const results: RetentionResult[] = [];

  for (const def of retainedResources(opts.defs)) {
    const retention = def.retention!;
    const cutoff = retentionCutoff(opts.firedAt, retention.days);
    const result: RetentionResult = {
      resource: def.plural,
      cutoff,
      deleted: 0,
      blocked: 0,
      failed: 0,
      capped: false,
    };
    results.push(result);

    let ids: string[];
    try {
      ids = await expiredIds(opts.client, def, cutoff, cap);
    } catch (err) {
      result.failed += 1;
      await log(`${def.plural}: could not list expired rows: ${String(err)}`);
      continue;
    }
    if (ids.length > cap) {
      result.capped = true;
      ids = ids.slice(0, cap);
    }

    const records = opts.client.collection(def.plural);
    for (const id of ids) {
      try {
        // force: take the child subtree with it. Reference rules still apply.
        await records.record(id).delete({ force: true });
        result.deleted += 1;
      } catch (err) {
        if (err instanceof HomesteadError && err.code === 409) {
          result.blocked += 1;
          await log(`${def.plural}/${id}: kept — ${err.message}`);
        } else {
          result.failed += 1;
          await log(`${def.plural}/${id}: delete failed — ${String(err)}`);
        }
      }
    }

    await log(
      `${def.plural}: deleted ${result.deleted} older than ${retention.days} days` +
        (result.blocked ? `, ${result.blocked} kept by references` : '') +
        (result.failed ? `, ${result.failed} failed` : '') +
        (result.capped ? ' (capped — more remain for the next run)' : ''),
    );
  }

  return results;
}
