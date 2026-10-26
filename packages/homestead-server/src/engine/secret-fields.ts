/**
 * Secret fields: encrypted fields nobody reads back. A field authored
 * `secret: true` (wire `x-aepbase-secret`) is stored like any encrypted field
 * (`./encrypted-fields`), and on top of that:
 *
 *  - **Reads get a descriptor, never the value.** Every response is shaped by
 *    `storedToMap`/`singletonToMap`, and they swap each secret for
 *    `{ $secret: true, set, set_time?, hint? }` — so GET, list, the change feed
 *    (which carries a record as a GET returns it) and everything built on the
 *    API see the same. `hint` (the last few characters) only when the field
 *    opts in with `{ hint: n }`, and only for values long enough that it
 *    doesn't give most of them away.
 *  - **Writes:** a value sets it, `null` or `""` clears it, and a descriptor —
 *    what a read returned, sent back by a form saving the whole record — leaves
 *    it alone. Leaving the field out leaves it alone too, on apply as on update.
 *  - **Server code reads it in-process** through {@link readSecretValue}
 *    (`Engine.readSecret`); there is no route for it.
 *
 * In the engine a secret stays as stored — ciphertext, or legacy plaintext on
 * an instance without a key — rather than being decrypted with the row, so a
 * stray path that serialized a stored record would leak nothing readable. A
 * value is kept in an envelope, `{"$secret":1,"v":<value>,"t":<set time>}`,
 * which is what gets encrypted; a value written before the field was a secret
 * has no envelope and reads without a `set_time`.
 */

import type { Database } from './sqlite';
import { sanitizeTableName } from './db';
import { decryptText, isEncryptedText } from './crypto';
import { encryptionKeyId, isSecretField, SECRET_MARKER } from './encrypted-fields';
import type { Schema, SchemaProperty } from './types';

/** The key marking a descriptor, in a response and in a write that keeps the value. */
export const DESCRIPTOR_KEY = '$secret';

/** What a read returns in a secret's place. */
export interface SecretDescriptor {
  $secret: true;
  set: boolean;
  /** When the value was last set, if known. */
  set_time?: string;
  /** The value's last few characters, when the field opts in. */
  hint?: string;
}

interface Envelope {
  $secret: 1;
  v: unknown;
  t: string;
}

/** A hint shows at most a third of the value. */
const HINT_SHARE = 3;

/** The secret fields of a schema. */
export function secretFieldNames(schema: Schema): string[] {
  return Object.keys(schema.properties ?? {}).filter((name) => isSecretField(schema, name));
}

function isDescriptor(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.prototype.hasOwnProperty.call(value, DESCRIPTOR_KEY)
  );
}

/**
 * The first half of a write's secret handling, before validation: a descriptor
 * means "unchanged" (dropped from the write), and `""` means "clear" (null).
 */
export function keepUnchangedSecrets(schema: Schema, fields: Record<string, unknown>): void {
  for (const name of secretFieldNames(schema)) {
    if (!(name in fields)) continue;
    if (isDescriptor(fields[name])) delete fields[name];
    else if (fields[name] === '') fields[name] = null;
  }
}

/**
 * The second half, after validation: wrap each value the write sets in its
 * envelope, stamped `now`. The store encrypts it like any encrypted field.
 */
export function sealSecretWrites(schema: Schema, fields: Record<string, unknown>, now: string): void {
  for (const name of secretFieldNames(schema)) {
    const value = fields[name];
    if (value === null || value === undefined) continue;
    const envelope: Envelope = { $secret: 1, v: value, t: now };
    fields[name] = JSON.stringify(envelope);
  }
}

/** A stored secret's plaintext, or `locked` when it is ciphertext and can't be decrypted. */
function plaintextOf(stored: string, path: string, name: string): string | 'locked' {
  if (!isEncryptedText(stored)) return stored;
  try {
    return decryptText(stored, encryptionKeyId(path, name));
  } catch {
    return 'locked';
  }
}

/** Unwrap a secret's plaintext: the value and when it was set (absent before the envelope). */
function unwrap(plaintext: string, prop: SchemaProperty | undefined): { value: unknown; setTime?: string } {
  try {
    const parsed = JSON.parse(plaintext) as Partial<Envelope> | null;
    if (parsed && typeof parsed === 'object' && parsed.$secret === 1 && 'v' in parsed) {
      return { value: parsed.v, setTime: typeof parsed.t === 'string' ? parsed.t : undefined };
    }
  } catch {
    // Not an envelope: a value written before the field was a secret.
  }
  if (prop?.type === 'object' || prop?.type === 'array') {
    try {
      return { value: JSON.parse(plaintext) };
    } catch {
      return { value: plaintext };
    }
  }
  return { value: plaintext };
}

function isUnset(stored: unknown): boolean {
  return stored === null || stored === undefined || stored === '';
}

function hintLength(prop: SchemaProperty | undefined): number {
  const marker = prop?.[SECRET_MARKER] as { hint?: number } | true | undefined;
  return typeof marker === 'object' && typeof marker.hint === 'number' ? marker.hint : 0;
}

/** The descriptor a read returns for a secret's stored value. */
export function secretDescriptor(
  schema: Schema,
  name: string,
  path: string,
  stored: unknown,
): SecretDescriptor {
  if (isUnset(stored)) return { $secret: true, set: false };
  const descriptor: SecretDescriptor = { $secret: true, set: true };
  const plaintext = plaintextOf(String(stored), path, name);
  if (plaintext === 'locked') return descriptor;
  const prop = schema.properties?.[name];
  const { value, setTime } = unwrap(plaintext, prop);
  if (setTime) descriptor.set_time = setTime;
  const hint = hintLength(prop);
  if (hint > 0 && typeof value === 'string' && value.length >= hint * HINT_SHARE) {
    descriptor.hint = `…${value.slice(-hint)}`;
  }
  return descriptor;
}

/** Swap every secret in a response map for its descriptor. */
export function describeSecrets(
  schema: Schema,
  path: string,
  stored: Record<string, unknown>,
  out: Record<string, unknown>,
): void {
  for (const name of secretFieldNames(schema)) {
    out[name] = secretDescriptor(schema, name, path, stored[name]);
  }
}

/**
 * A secret's value, for server code that uses it — null when unset. Throws
 * when it is encrypted and can't be decrypted (no key, or the wrong one).
 */
export function readSecretValue(schema: Schema, name: string, path: string, stored: unknown): unknown {
  if (isUnset(stored)) return null;
  const plaintext = plaintextOf(String(stored), path, name);
  if (plaintext === 'locked') {
    throw new Error(`secret "${name}" on ${path} can't be decrypted with this instance's master key`);
  }
  return unwrap(plaintext, schema.properties?.[name]).value;
}

/**
 * Why a definition change would make a secret readable, or null. A field that
 * stops being secret while it still holds values would hand those values to
 * every reader, so it's refused until they're cleared (or the field dropped,
 * which the populated-column guard governs).
 */
export function revealedSecretsError(
  db: Database,
  plural: string,
  before: Schema,
  after: Schema,
): string | null {
  const table = sanitizeTableName(plural);
  for (const name of secretFieldNames(before)) {
    if (!after.properties?.[name] || isSecretField(after, name)) continue;
    const held = db
      .query(`SELECT 1 FROM ${table} WHERE ${name} IS NOT NULL AND ${name} != '' LIMIT 1`)
      .get();
    if (held) {
      return (
        `field "${name}" holds secrets, and making it readable would reveal them. ` +
        'Clear its values first (set them to null), or remove the field.'
      );
    }
  }
  return null;
}
