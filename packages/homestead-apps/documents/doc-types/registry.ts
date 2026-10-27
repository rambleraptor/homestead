/**
 * Doc-type accessors.
 *
 * Doc types are the static, built-in set (`BUILTIN_DOC_TYPES`) — there is no
 * runtime discovery or install step, so these are plain lookups over that
 * array. Kept as functions (rather than exposing the array directly) so callers
 * share one access path and the backing store can change without touching them.
 */

import { UNKNOWN_DOC_TYPE, UNKNOWN_FIELDS, type DocField, type DocType } from './docType';
import { BUILTIN_DOC_TYPES } from './builtins';

/** Every known doc type. */
export function getDocTypes(): DocType[] {
  return BUILTIN_DOC_TYPES;
}

/** Look up one doc type by its discriminator value. */
export function getDocType(id: string): DocType | undefined {
  return BUILTIN_DOC_TYPES.find((t) => t.id === id);
}

/**
 * The fields a metadata variant declares: a known type's own, the free-form
 * facts for `unknown`, or undefined for an id that's since been removed.
 */
export function getDocTypeFields(id: string): Record<string, DocField> | undefined {
  if (id === UNKNOWN_DOC_TYPE) return UNKNOWN_FIELDS;
  return getDocType(id)?.fields;
}
