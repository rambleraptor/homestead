import type { PendingLink, Store } from './store';

/** The slice of Cloudflare's D1 binding this uses. */
export interface D1Like {
  prepare(sql: string): D1Statement;
  batch(statements: D1Statement[]): Promise<unknown>;
}

interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  run(): Promise<{ meta?: { changes?: number } }>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
}

interface LinkRow {
  id: string;
  seq: number;
  url: string;
  received_at: number;
}

/** The drop box's storage on D1 (schema: `../migrations`). */
export function d1Store(db: D1Like): Store {
  return {
    async hasBox(box) {
      return (await db.prepare('SELECT 1 AS found FROM boxes WHERE id = ?').bind(box).first()) !== null;
    },
    async putBox(box, now) {
      await db.prepare('INSERT OR IGNORE INTO boxes (id, created_at) VALUES (?, ?)').bind(box, now).run();
    },
    async deleteBox(box) {
      // Both, explicitly: D1 enforces foreign keys, but a box's links must go
      // even where that is ever switched off.
      await db.batch([
        db.prepare('DELETE FROM links WHERE box = ?').bind(box),
        db.prepare('DELETE FROM boxes WHERE id = ?').bind(box),
      ]);
    },
    async listLinks(box, limit) {
      const { results } = await db
        .prepare('SELECT id, seq, url, received_at FROM links WHERE box = ? ORDER BY seq LIMIT ?')
        .bind(box, limit)
        .all<LinkRow>();
      return results.map(
        (row): PendingLink => ({
          id: row.id,
          seq: row.seq,
          url: row.url,
          received_at: new Date(row.received_at).toISOString(),
        }),
      );
    },
    async countLinks(box) {
      const row = await db.prepare('SELECT count(*) AS n FROM links WHERE box = ?').bind(box).first<{ n: number }>();
      return row?.n ?? 0;
    },
    async addLink(box, link, now) {
      await db
        .prepare('INSERT INTO links (id, box, url, received_at) VALUES (?, ?, ?, ?)')
        .bind(link.id, box, link.url, now)
        .run();
    },
    async ackLinks(box, throughSeq) {
      const result = await db.prepare('DELETE FROM links WHERE box = ? AND seq <= ?').bind(box, throughSeq).run();
      return result.meta?.changes ?? 0;
    },
    async purgeBefore(before) {
      const result = await db.prepare('DELETE FROM links WHERE received_at < ?').bind(before).run();
      return result.meta?.changes ?? 0;
    },
  };
}
