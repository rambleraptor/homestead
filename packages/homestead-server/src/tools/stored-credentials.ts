/**
 * `bun tools/stored-credentials.ts --db <path> --ids a,b`
 *
 * Which of the given credential ids have a stored value, as JSON
 * (`{"stored": ["ai-api-key"]}`). `homestead doctor` runs it to say where the
 * AI key comes from. Only whether a value is there — never the value, and the
 * master key plays no part.
 *
 * Runs as a runtime child of the project's homestead-server for the same
 * reason as `tools/encrypted-fields.ts`: the SQLite driver comes from the
 * version that owns the db, never from the launcher binary.
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Database } from '../engine/sqlite';
import { flagValue } from './flags';

const args = process.argv.slice(2);
const dbArg = flagValue(args, '--db');
const ids = (flagValue(args, '--ids') ?? '').split(',').filter((id) => /^[a-z0-9-]+$/.test(id));
if (!dbArg) {
  console.error('usage: stored-credentials.ts --db <path> --ids <id,id>');
  process.exit(1);
}

const path = resolve(dbArg);
const out = (stored: string[]) => process.stdout.write(`${JSON.stringify({ stored })}\n`);
if (!existsSync(path) || ids.length === 0) {
  out([]);
  process.exit(0);
}

const db = new Database(path);
try {
  const table = db.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'credentials'").get();
  if (!table) {
    out([]);
  } else {
    const rows = db
      .query(
        `SELECT path FROM credentials WHERE path IN (${ids.map(() => '?').join(',')}) ` +
          "AND value IS NOT NULL AND value != ''",
      )
      .all(...ids.map((id) => `credentials/${id}`)) as Array<{ path: string }>;
    out(rows.map((row) => row.path.slice('credentials/'.length)));
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
} finally {
  db.close();
}
