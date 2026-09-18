/**
 * Read a resource definition's declared references in one place, so the chat
 * tool builder and the semantic-search tool don't each re-derive the
 * "reference lives on the field, or on an array's items" rule.
 */

import type { ResourceDefinition } from './types';

/** A single reference field on a resource, flattened for consumers. */
export interface FieldReference {
  /** The declaring field name. */
  field: string;
  /** Kebab-case singular of the referenced resource. */
  resource: string;
  /** True when the field is an array of references (annotation on `items`). */
  isArray: boolean;
}

/**
 * Every reference declared on a definition's top-level fields — both scalar
 * string references and to-many array-item references. Nested object/variant
 * references are not surfaced here (no consumer needs them yet).
 */
export function referenceFields(def: ResourceDefinition): FieldReference[] {
  const out: FieldReference[] = [];
  for (const [field, def_] of Object.entries(def.fields)) {
    if (def_.reference) {
      out.push({ field, resource: def_.reference.resource, isArray: false });
    } else if (def_.type === 'array' && def_.items?.reference) {
      out.push({ field, resource: def_.items.reference.resource, isArray: true });
    }
  }
  return out;
}

/**
 * The bare record id a stored reference value names. Reference values are
 * stored in two shapes — the bare id (`abc`) or the target's resource path
 * (`projects/abc`); the SPA writes paths for some fields while the chat/MCP
 * tools write bare ids — so anything that fetches a reference's target goes
 * through here rather than assuming one shape.
 */
export function referenceId(value: string, plural: string): string {
  const prefix = `${plural}/`;
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}
