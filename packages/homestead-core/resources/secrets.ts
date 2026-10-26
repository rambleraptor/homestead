/**
 * What a read returns for a `secret: true` field: a description of the value,
 * never the value (see `FieldDef.secret`). Sending it back in a write leaves
 * the value alone.
 */
export interface SecretDescriptor {
  $secret: true;
  /** Whether a value is stored. */
  set: boolean;
  /** When it was last set, if known (RFC 3339). */
  set_time?: string;
  /** Its last few characters (`…3f9a`), when the field opts in. */
  hint?: string;
}

/** Whether `value` is a secret's descriptor. */
export function isSecretDescriptor(value: unknown): value is SecretDescriptor {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).$secret === true
  );
}
