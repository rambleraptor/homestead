/**
 * Encrypted fields: values stored as ciphertext, so a stolen disk, database or
 * backup doesn't give them away. Anyone allowed to read the record still reads
 * the value — this is privacy at rest, not access control.
 *
 * Two kinds of column are encrypted, with one envelope (`./crypto`, keyed per
 * value on `<record path>/<field>`):
 *
 *  - **declared** — a field authored `encrypted: true`, which the translator
 *    marks `x-aepbase-encrypted`. Writing a value with no master key is refused:
 *    the field says its data must not sit on disk in plaintext.
 *  - **extracted text** — a file field's `<field>_text` companion
 *    (`x-aepbase-file-text-field`). Derived, written by the server itself, so
 *    without a key it stays plaintext rather than failing the upload.
 *
 * A **secret** field (`x-aepbase-secret`, see `./secret-fields`) is a declared
 * encrypted field that is also never read back.
 *
 * Either way the column can't be filtered or sorted (that would compare
 * ciphertext), and plaintext already in it — a field newly marked, or an
 * instance that gained a master key — is encrypted by {@link sweepEncryption}.
 */

import type { Database } from './sqlite';
import type { Schema, SchemaProperty } from './types';
import { sanitizeTableName } from './db';
import { encryptionEnabled, encryptText, TEXT_PREFIX } from './crypto';
import type { RegisteredResource } from './registry';

export const ENCRYPTED_MARKER = 'x-aepbase-encrypted';
/** `true`, or `{ hint: n }` to show the last n characters on read. */
export const SECRET_MARKER = 'x-aepbase-secret';
const FILE_TEXT_MARKER = 'x-aepbase-file-text-field';

/** The longest hint a secret may show. */
const MAX_SECRET_HINT = 8;

/** The types a declared encrypted field may have. Objects and arrays are stored as JSON. */
const ENCRYPTABLE_TYPES = new Set(['string', 'object', 'array']);

/** Whether a property is a secret (`./secret-fields`). */
export function isSecretProperty(prop: SchemaProperty | undefined): boolean {
  const marker = prop?.[SECRET_MARKER];
  return marker === true || (typeof marker === 'object' && marker !== null);
}

/** Whether a field is a secret. */
export function isSecretField(schema: Schema, name: string): boolean {
  return isSecretProperty(schema.properties?.[name]);
}

/** Whether a property is authored `encrypted: true`, or is a secret (always encrypted). */
function declaresEncryption(prop: SchemaProperty | undefined): boolean {
  return prop?.[ENCRYPTED_MARKER] === true || isSecretProperty(prop);
}

/** Whether a field is authored `encrypted: true` (secrets included). */
export function isDeclaredEncrypted(schema: Schema, name: string): boolean {
  return declaresEncryption(schema.properties?.[name]);
}

/** Whether a field's column holds ciphertext (declared, or extracted text). */
export function isEncryptedField(schema: Schema, name: string): boolean {
  const prop = schema.properties?.[name];
  return declaresEncryption(prop) || prop?.[FILE_TEXT_MARKER] === true;
}

/** Stable key id for one value: the record and the field. */
export function encryptionKeyId(path: string, field: string): string {
  return `${path}/${field}`;
}

/** Whether a property holds a file field or a reference anywhere inside it. */
function holdsFileOrReference(prop: SchemaProperty): boolean {
  if (prop['x-aepbase-file-field'] === true || prop['x-aepbase-reference'] !== undefined) return true;
  if (prop.items && holdsFileOrReference(prop.items)) return true;
  for (const child of Object.values(prop.properties ?? {})) if (holdsFileOrReference(child)) return true;
  for (const variant of prop.oneOf ?? []) if (holdsFileOrReference(variant)) return true;
  return false;
}

/**
 * Why a schema's encrypted markers can't be honored, or null when they can. A
 * declared field must be top-level, a string, object or array, and hold no file
 * or reference — the engine needs those in plaintext (to store files, and to
 * act on `onDelete`).
 */
export function encryptedFieldsError(schema: Schema): string | null {
  for (const [name, prop] of Object.entries(schema.properties ?? {})) {
    if (!declaresEncryption(prop)) {
      for (const nested of [prop.items, ...Object.values(prop.properties ?? {})]) {
        if (declaresEncryption(nested)) {
          return `field "${name}" nests an encrypted or secret field; only top-level fields can be`;
        }
      }
      continue;
    }
    const secret = prop[SECRET_MARKER];
    if (secret !== undefined && secret !== true) {
      const hint = (secret as { hint?: unknown } | null)?.hint;
      const keys = secret !== null && typeof secret === 'object' ? Object.keys(secret) : [];
      if (
        keys.some((k) => k !== 'hint') ||
        !Number.isInteger(hint) ||
        (hint as number) < 1 ||
        (hint as number) > MAX_SECRET_HINT
      ) {
        return `field "${name}" has an invalid secret marker; use true or { hint: 1–${MAX_SECRET_HINT} }`;
      }
    }
    if (!ENCRYPTABLE_TYPES.has(String(prop.type))) {
      return `field "${name}" is ${prop.type}; only string, object and array fields can be encrypted`;
    }
    if (prop.enum) return `field "${name}" declares enum values and can't also be encrypted`;
    if (holdsFileOrReference(prop)) {
      return `field "${name}" holds a file or a reference, which can't be encrypted`;
    }
  }
  return null;
}

/** The declared encrypted fields a write sets to a value (not null, not empty). */
export function encryptedWrites(schema: Schema, fields: Record<string, unknown>): string[] {
  return Object.keys(fields).filter((name) => {
    if (!isDeclaredEncrypted(schema, name)) return false;
    const value = fields[name];
    return value !== null && value !== undefined && value !== '';
  });
}

/**
 * The 400 for a write to declared encrypted fields with no master key — the
 * value would otherwise land on disk in plaintext. A precondition the operator
 * meets, not something the caller can fix by changing the request.
 */
export function missingKeyError(names: readonly string[]): string {
  const which = names.length === 1 ? `field "${names[0]}" is` : `fields ${names.map((n) => `"${n}"`).join(', ')} are`;
  return (
    `${which} encrypted at rest, and this Homestead has no master key to encrypt with. ` +
    'Generate one with `homestead key generate` (or set HOMESTEAD_MASTER_KEY), restart, and try again.'
  );
}

/** Throw-free check a write path runs: the names that need a key it doesn't have. */
export function writesNeedingKey(schema: Schema, fields: Record<string, unknown>): string[] {
  return encryptionEnabled() ? [] : encryptedWrites(schema, fields);
}

/**
 * Encrypt the plaintext still sitting in `resource`'s encrypted columns. A
 * no-op without a master key. Leaves `update_time` alone — the value didn't
 * change, only how it's stored. Returns how many values it encrypted.
 */
export function sweepEncryption(db: Database, resource: RegisteredResource): number {
  if (!encryptionEnabled()) return 0;
  const columns = Object.keys(resource.schema.properties ?? {}).filter((name) =>
    isEncryptedField(resource.schema, name),
  );
  if (columns.length === 0) return 0;
  const table = sanitizeTableName(resource.plural);
  let count = 0;
  for (const column of columns) {
    const rows = db
      .query(
        `SELECT path, ${column} AS value FROM ${table} ` +
          `WHERE ${column} IS NOT NULL AND ${column} != '' AND substr(${column}, 1, ?) != ?`,
      )
      .all(TEXT_PREFIX.length, TEXT_PREFIX) as Array<{ path: string; value: unknown }>;
    const update = db.query(`UPDATE ${table} SET ${column} = ? WHERE path = ?`);
    for (const row of rows) {
      update.run(encryptText(String(row.value), encryptionKeyId(row.path, column)), row.path);
      count++;
    }
  }
  return count;
}
