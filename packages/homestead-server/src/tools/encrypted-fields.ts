/**
 * `bun tools/encrypted-fields.ts --db <path>`
 *
 * Lists the declared encrypted fields in a homestead database, as JSON
 * (`{"fields": ["gift-card.pin", …]}`). `homestead doctor` runs it to warn
 * that an instance without a master key can't save them.
 *
 * Runs as a runtime child of the project's homestead-server for the same
 * reason as `tools/snapshot.ts`: the SQLite driver and the definition format
 * come from the version that owns the db, never from the launcher binary.
 * Read-only; the master key plays no part.
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Database } from '../engine/sqlite';
import { declaredEncryptedFields } from '../engine/key-check';
import { flagValue } from './flags';

const dbArg = flagValue(process.argv.slice(2), '--db');
if (!dbArg) {
  console.error('usage: encrypted-fields.ts --db <path>');
  process.exit(1);
}

const path = resolve(dbArg);
if (!existsSync(path)) {
  // A fresh instance has no database yet, and so no encrypted fields.
  process.stdout.write(`${JSON.stringify({ fields: [] })}\n`);
  process.exit(0);
}

const db = new Database(path);
try {
  process.stdout.write(`${JSON.stringify({ fields: declaredEncryptedFields(db) })}\n`);
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
} finally {
  db.close();
}
