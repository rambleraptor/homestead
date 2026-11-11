/**
 * The resource-sync outbox — where a change waits until its sync has mirrored
 * it.
 *
 * The dispatcher (`./sync.ts`) writes one row per (sync, change) right after
 * the change commits, and deletes it once the sync's handler succeeds. A run
 * that fails is rescheduled (`next_attempt_at`) on a growing backoff and tried
 * again — by this process or, after a restart, the next one — until it
 * succeeds or runs out of deliveries and is parked as `dead`. Dead rows are kept
 * for a while so an operator can see what never made it out, then pruned.
 *
 * Like the migrations ledger it is a plain SQLite table in the engine's
 * database, not an aepbase resource: it's server bookkeeping, never served over
 * the API. Record snapshots can hold decrypted values of `encrypted` fields, so
 * when a master key is configured each row's payload is stored encrypted with
 * it — the outbox never leaves plaintext on disk that the record itself
 * doesn't.
 */

import type { Database } from './engine/sqlite';
import { nowRFC3339 } from './engine/ids';
import { decryptText, encryptionEnabled, encryptText } from './engine/crypto';
import type { SyncEvent } from '@rambleraptor/homestead-core/apps/sync';

export const OUTBOX_TABLE = '_homestead_sync_outbox';

/** Key id the payload encryption is bound to (see `crypto.ts`). */
const PAYLOAD_KEY_ID = OUTBOX_TABLE;

/** A change waiting for (or given up on by) one sync. */
export interface OutboxEntry {
  /** Insertion order; also the order changes to one record are delivered in. */
  seq: number;
  syncId: string;
  resource: string;
  recordId: string;
  event: SyncEvent;
  record: Record<string, unknown> | null;
  previous: Record<string, unknown> | null;
  actor: string | null;
  origin: string | null;
  /** Deliveries already attempted (0 until the first run finishes). */
  deliveries: number;
  /** Epoch ms the next delivery is due at. */
  nextAttemptAt: number;
}

/** A row whose payload couldn't be read back (e.g. the master key changed). */
export interface UnreadableEntry {
  seq: number;
  syncId: string;
  error: string;
}

export interface NewOutboxEntry {
  syncId: string;
  resource: string;
  recordId: string;
  event: SyncEvent;
  record: Record<string, unknown> | null;
  previous: Record<string, unknown> | null;
  actor: string | null;
  origin: string | null;
}

interface Row {
  seq: number;
  sync_id: string;
  resource: string;
  record_id: string;
  event: string;
  payload: string;
  actor: string | null;
  origin: string | null;
  deliveries: number;
  next_attempt_at: number;
}

/** Create the outbox table if this database doesn't have it yet. */
export function ensureOutboxTable(db: Database): void {
  db.run(
    `CREATE TABLE IF NOT EXISTS ${OUTBOX_TABLE} (
       seq             INTEGER PRIMARY KEY AUTOINCREMENT,
       sync_id         TEXT NOT NULL,
       resource        TEXT NOT NULL,
       record_id       TEXT NOT NULL,
       event           TEXT NOT NULL,
       payload         TEXT NOT NULL,
       actor           TEXT,
       origin          TEXT,
       state           TEXT NOT NULL DEFAULT 'pending',
       deliveries      INTEGER NOT NULL DEFAULT 0,
       next_attempt_at INTEGER NOT NULL,
       last_error      TEXT,
       create_time     TEXT NOT NULL,
       update_time     TEXT NOT NULL
     )`,
  );
  db.run(
    `CREATE INDEX IF NOT EXISTS ${OUTBOX_TABLE}_due
       ON ${OUTBOX_TABLE} (state, next_attempt_at)`,
  );
  db.run(
    `CREATE INDEX IF NOT EXISTS ${OUTBOX_TABLE}_key
       ON ${OUTBOX_TABLE} (sync_id, resource, record_id, state, seq)`,
  );
}

function sealPayload(record: unknown, previous: unknown): string {
  const json = JSON.stringify({ record, previous });
  return encryptionEnabled() ? encryptText(json, PAYLOAD_KEY_ID) : json;
}

function openPayload(stored: string): {
  record: Record<string, unknown> | null;
  previous: Record<string, unknown> | null;
} {
  // `decryptText` passes a plaintext payload through unchanged, so rows written
  // before a master key was configured still read.
  const parsed = JSON.parse(decryptText(stored, PAYLOAD_KEY_ID)) as {
    record?: Record<string, unknown> | null;
    previous?: Record<string, unknown> | null;
  };
  return { record: parsed.record ?? null, previous: parsed.previous ?? null };
}

/** Durable queue operations over {@link OUTBOX_TABLE}. */
export class SyncOutbox {
  constructor(private readonly db: Database) {
    ensureOutboxTable(db);
  }

  /** Queue a change for a sync, due now. Returns its `seq`. */
  add(entry: NewOutboxEntry, now: number): number {
    const time = nowRFC3339();
    const result = this.db
      .query(
        `INSERT INTO ${OUTBOX_TABLE}
           (sync_id, resource, record_id, event, payload, actor, origin,
            next_attempt_at, create_time, update_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        entry.syncId,
        entry.resource,
        entry.recordId,
        entry.event,
        sealPayload(entry.record, entry.previous),
        entry.actor,
        entry.origin,
        now,
        time,
        time,
      );
    return Number(result.lastInsertRowid);
  }

  /**
   * Pending changes that are due and at the head of their record's queue — no
   * earlier pending change to the same record for the same sync — oldest first,
   * leaving out the record keys in `busy` (already being delivered). A change
   * that isn't due yet holds back every later change to its record, so a
   * record's changes always reach the sync in the order they were made.
   */
  due(
    now: number,
    busy: ReadonlySet<string>,
    limit: number,
  ): { entries: OutboxEntry[]; unreadable: UnreadableEntry[] } {
    const rows = this.db
      .query(
        `SELECT o.seq, o.sync_id, o.resource, o.record_id, o.event, o.payload,
                o.actor, o.origin, o.deliveries, o.next_attempt_at
           FROM ${OUTBOX_TABLE} o
          WHERE o.state = 'pending'
            AND o.next_attempt_at <= ?
            AND NOT EXISTS (
                  SELECT 1 FROM ${OUTBOX_TABLE} p
                   WHERE p.state = 'pending'
                     AND p.sync_id = o.sync_id
                     AND p.resource = o.resource
                     AND p.record_id = o.record_id
                     AND p.seq < o.seq)
          ORDER BY o.seq
          LIMIT ?`,
      )
      // A busy key's in-flight head is the only row of it that can match, so
      // over-fetching by `busy.size` still yields `limit` deliverable rows.
      .all(now, limit + busy.size) as Row[];

    const entries: OutboxEntry[] = [];
    const unreadable: UnreadableEntry[] = [];
    for (const row of rows) {
      if (entries.length >= limit) break;
      if (busy.has(outboxKey(row.sync_id, row.resource, row.record_id))) continue;
      let payload: ReturnType<typeof openPayload>;
      try {
        payload = openPayload(row.payload);
      } catch (error) {
        unreadable.push({
          seq: row.seq,
          syncId: row.sync_id,
          error: error instanceof Error ? error.message : String(error),
        });
        continue;
      }
      entries.push({
        seq: row.seq,
        syncId: row.sync_id,
        resource: row.resource,
        recordId: row.record_id,
        event: row.event as SyncEvent,
        record: payload.record,
        previous: payload.previous,
        actor: row.actor,
        origin: row.origin,
        deliveries: row.deliveries,
        nextAttemptAt: row.next_attempt_at,
      });
    }
    return { entries, unreadable };
  }

  /**
   * When the next delivery falls due: the earliest `next_attempt_at` among the
   * changes at the head of their record's queue, leaving out the record keys in
   * `busy` (their delivery wakes the drainer when it settles). A change held
   * behind an earlier one doesn't count — it can't go before that one does.
   * Null when nothing is waiting.
   */
  nextDueAt(busy: ReadonlySet<string>): number | null {
    const heads = this.db
      .query(
        `SELECT o.sync_id, o.resource, o.record_id, o.next_attempt_at
           FROM ${OUTBOX_TABLE} o
          WHERE o.state = 'pending'
            AND NOT EXISTS (
                  SELECT 1 FROM ${OUTBOX_TABLE} p
                   WHERE p.state = 'pending'
                     AND p.sync_id = o.sync_id
                     AND p.resource = o.resource
                     AND p.record_id = o.record_id
                     AND p.seq < o.seq)
          ORDER BY o.next_attempt_at`,
      )
      .all() as Pick<Row, 'sync_id' | 'resource' | 'record_id' | 'next_attempt_at'>[];
    for (const head of heads) {
      if (!busy.has(outboxKey(head.sync_id, head.resource, head.record_id))) {
        return head.next_attempt_at;
      }
    }
    return null;
  }

  /** The change was delivered: forget it. */
  succeeded(seq: number): void {
    this.db.query(`DELETE FROM ${OUTBOX_TABLE} WHERE seq = ?`).run(seq);
  }

  /** A delivery failed; try again at `nextAttemptAt`. */
  retryLater(seq: number, deliveries: number, error: string, nextAttemptAt: number): void {
    this.db
      .query(
        `UPDATE ${OUTBOX_TABLE}
            SET deliveries = ?, last_error = ?, next_attempt_at = ?, update_time = ?
          WHERE seq = ?`,
      )
      .run(deliveries, error, nextAttemptAt, nowRFC3339(), seq);
  }

  /**
   * Give up on a change: park it as `dead`. It stops holding back later
   * changes to the same record, which carry newer state anyway.
   */
  dead(seq: number, deliveries: number, error: string): void {
    this.db
      .query(
        `UPDATE ${OUTBOX_TABLE}
            SET state = 'dead', deliveries = ?, last_error = ?, update_time = ?
          WHERE seq = ?`,
      )
      .run(deliveries, error, nowRFC3339(), seq);
  }

  /** Delete dead changes last touched before `before` (RFC 3339). */
  pruneDead(before: string): number {
    const result = this.db
      .query(`DELETE FROM ${OUTBOX_TABLE} WHERE state = 'dead' AND update_time < ?`)
      .run(before);
    return Number(result.changes);
  }
}

/** The key a record's changes are serialized on, per sync. */
export function outboxKey(syncId: string, resource: string, recordId: string): string {
  return `${syncId}\u0000${resource}\u0000${recordId}`;
}
