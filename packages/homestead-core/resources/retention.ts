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
 * A resource parented directly under `user` is swept per user: the sweep lists
 * every user and walks each one's `users/{id}/<plural>` collection — the same
 * walk a scheduled-notification reconcile does, done once for every such
 * resource.
 *
 * Each run deletes at most {@link RETENTION_SWEEP_CAP} rows per resource (across
 * all users, for a user-parented one), so a large backlog — a resource that just
 * gained a retention window — drains over a few days instead of in one long
 * firing.
 *
 * Server-only in practice (it deletes), but free of server imports: the caller
 * hands in the client, so tests drive it against an in-memory engine.
 */

import {
  HomesteadError,
  type CollectionRef,
  type HomesteadClient,
} from '@rambleraptor/homestead-client';
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

/** True for a resource parented directly under the built-in `user` root. */
function isUserParented(def: ResourceDefinition): boolean {
  const parents = def.parents ?? [];
  return parents.length === 1 && parents[0] === 'user';
}

/**
 * The definitions a sweep acts on: those with a retention window that are
 * top-level or parented directly under `user`.
 */
export function retainedResources(defs: readonly ResourceDefinition[]): ResourceDefinition[] {
  return defs.filter(
    (d) => d.retention && ((d.parents ?? []).length === 0 || isUserParented(d)),
  );
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

/** One collection a resource's rows live in, and how to name its rows in logs. */
interface Scope {
  records: CollectionRef<Record<string, unknown>>;
  /** Path prefix for log lines, e.g. `memos` or `users/u1/scheduled-notifications`. */
  label: string;
}

/** An expired row: where to delete it, and what to call it. */
interface ExpiredRow {
  scope: Scope;
  id: string;
}

/** Where `def`'s rows live: one collection, or one per user. */
async function scopesOf(client: HomesteadClient, def: ResourceDefinition): Promise<Scope[]> {
  if (!isUserParented(def)) {
    return [{ records: client.collection(def.plural), label: def.plural }];
  }
  const users = await client.collection<{ id: string }>('users').listAll();
  return users.map((user) => ({
    records: client.collection('users').record(user.id).collection(def.plural),
    label: `users/${user.id}/${def.plural}`,
  }));
}

/** Collect up to `cap + 1` expired rows (the extra one reports `capped`). */
async function expiredRows(
  client: HomesteadClient,
  def: ResourceDefinition,
  cutoff: string,
  cap: number,
): Promise<ExpiredRow[]> {
  const retention = def.retention!;
  const filter = retentionFilter(retention, cutoff);
  const rows: ExpiredRow[] = [];
  // Collected before any delete: deleting while paging would shift the pages.
  for (const scope of await scopesOf(client, def)) {
    for await (const record of scope.records.list({ filter })) {
      if (!isExpired(record, retention, cutoff)) continue;
      rows.push({ scope, id: String(record.id) });
      if (rows.length > cap) return rows;
    }
  }
  return rows;
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

    let rows: ExpiredRow[];
    try {
      rows = await expiredRows(opts.client, def, cutoff, cap);
    } catch (err) {
      result.failed += 1;
      await log(`${def.plural}: could not list expired rows: ${String(err)}`);
      continue;
    }
    if (rows.length > cap) {
      result.capped = true;
      rows = rows.slice(0, cap);
    }

    for (const { scope, id } of rows) {
      try {
        // force: take the child subtree with it. Reference rules still apply.
        await scope.records.record(id).delete({ force: true });
        result.deleted += 1;
      } catch (err) {
        if (err instanceof HomesteadError && err.code === 409) {
          result.blocked += 1;
          await log(`${scope.label}/${id}: kept — ${err.message}`);
        } else {
          result.failed += 1;
          await log(`${scope.label}/${id}: delete failed — ${String(err)}`);
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
