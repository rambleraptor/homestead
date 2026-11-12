/**
 * Per-record visibility, client side: what a resource declared with
 * `access: { model: 'per-record' }` calls its two kinds of row.
 *
 * Presentation only. Who can reach a row is the engine's decision (the
 * household role's filtered grant plus `_owner`); this just reads the
 * declaration so a form can offer the choice and a row can state it.
 *
 * See `packages/homestead-site/docs/design/record-visibility.md`.
 */

import { getAllResourceDefs } from '../apps/registry';

export interface RecordVisibility {
  /** The discriminator field's name on the record. */
  field: string;
  /** The value meaning "the whole household". */
  sharedValue: string;
  /** The value meaning "only its owner". */
  privateValue: string;
  /** What a create gets when it leaves the field out. */
  defaultValue: string;
}

/** A resource's per-record visibility, or `null` when it doesn't declare one. */
export function recordVisibility(singular: string): RecordVisibility | null {
  const def = getAllResourceDefs().find((candidate) => candidate.singular === singular);
  const access = def?.access;
  if (!def || access?.model !== 'per-record') return null;
  const declared = def.fields[access.field]?.default;
  return {
    field: access.field,
    sharedValue: access.sharedValue,
    privateValue: access.privateValue,
    defaultValue: declared === access.sharedValue ? access.sharedValue : access.privateValue,
  };
}

/** Whether `record` is one only its owner sees. False for a resource with no such choice. */
export function isPrivateRecord(singular: string, record: Record<string, unknown>): boolean {
  const visibility = recordVisibility(singular);
  if (!visibility) return false;
  return (record[visibility.field] ?? visibility.defaultValue) === visibility.privateValue;
}
