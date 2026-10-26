/**
 * Which encrypted fields this instance can't write. A declared encrypted
 * field (secrets included) refuses a write that sets it when there's no master
 * key (`./encrypted-fields`), so an instance without one — encryption at rest
 * is opt-in at `homestead init` — loses the ability to save those values. The
 * boot-time schema sync logs it, and `homestead doctor` reports it (through
 * `tools/encrypted-fields.ts`), naming the fields, before anyone finds out
 * from a failed save.
 */

import type { Database } from './sqlite';
import { encryptionEnabled } from './crypto';
import { isDeclaredEncrypted } from './encrypted-fields';
import { listDefinitions } from './meta';

/** Far more definitions than any instance has: one read lists them all. */
const ALL = 100_000;

/** Every declared encrypted field, as `<resource singular>.<field>`, sorted. */
export function declaredEncryptedFields(db: Database): string[] {
  const out: string[] = [];
  for (const def of listDefinitions(db, ALL, '')) {
    for (const name of Object.keys(def.schema?.properties ?? {})) {
      if (isDeclaredEncrypted(def.schema, name)) out.push(`${def.singular}.${name}`);
    }
  }
  return out.sort();
}

/** The declared encrypted fields no write can set, because there's no master key. */
export function fieldsNeedingMasterKey(db: Database): string[] {
  return encryptionEnabled() ? [] : declaredEncryptedFields(db);
}

/** The operator-facing warning for {@link fieldsNeedingMasterKey}'s result. */
export function missingMasterKeyWarning(fields: readonly string[]): string {
  return (
    `no master key, so ${fields.length} encrypted field(s) can't be saved: ${fields.join(', ')}. ` +
    'Run `homestead key generate` (or set HOMESTEAD_MASTER_KEY) and restart.'
  );
}
