/**
 * The link graph: for each resource, every other resource it's connected to,
 * in both directions — derived from what the registry already knows, so no
 * app maintains it:
 *
 *  - **reference fields** (`x-aepbase-reference`, from an app's
 *    `reference: { resource }`): an outbound link named after the field
 *    (a household's `members`), and an inbound link on the target named after
 *    the referring collection (a person's `households`), or `<plural>.<field>`
 *    when one resource points at it from more than one field;
 *  - **parent/child**: a child collection is an inbound link on its parent
 *    (a gift card's `transactions`), and `parent` an outbound one.
 *
 * Inbound links to the built-in `user` are left out — every `created_by`
 * points there. Read off the live registry each time it's asked, so a
 * definition applied a moment ago is already in it.
 *
 * Internal: what's public is a link's name, which `include` takes
 * (`./include`) and the OpenAPI document lists.
 */

import { referenceMarker } from './references';
import type { RegisteredResource, Registry } from './registry';

export interface Link {
  /** What `include` names it by. */
  name: string;
  /** The resource the link leads to. */
  to: RegisteredResource;
  /**
   * - `reference-out`: this record's field holds the other's id;
   * - `reference-in`: the other record's field holds this one's id;
   * - `child`: the other is in this record's child collection;
   * - `parent`: the other is this record's parent.
   */
  kind: 'reference-out' | 'reference-in' | 'child' | 'parent';
  /** The reference field (on this record for `-out`, on the other for `-in`). */
  field?: string;
  /** Whether the field is an array of references. */
  arrayField?: boolean;
  /** Whether the link can lead to more than one record. */
  many: boolean;
}

/** A field's reference target, on the field or on an array's items. */
function referenceOf(
  r: RegisteredResource,
  field: string,
): { target: string; array: boolean } | null {
  const prop = r.schema.properties?.[field];
  const scalar = referenceMarker(prop);
  if (scalar) return { target: scalar.resource, array: false };
  if (prop?.type === 'array') {
    const item = referenceMarker(prop.items);
    if (item) return { target: item.resource, array: true };
  }
  return null;
}

/** Every link from `r`, by name. */
export function linksOf(reg: Registry, r: RegisteredResource): Map<string, Link> {
  const out = new Map<string, Link>();

  for (const field of Object.keys(r.schema.properties ?? {})) {
    const ref = referenceOf(r, field);
    const to = ref ? reg.get(ref.target) : undefined;
    // Users live in their own store, and an account is read through /users.
    if (!ref || !to || to.builtin) continue;
    out.set(field, { name: field, to, kind: 'reference-out', field, arrayField: ref.array, many: ref.array });
  }

  const parent = r.parents[0] ? reg.get(r.parents[0]) : undefined;
  if (parent && !parent.builtin && !out.has('parent')) out.set('parent', { name: 'parent', to: parent, kind: 'parent', many: false });

  if (r.builtin) return out;

  const inbound: Link[] = [];
  for (const other of reg.dynamic()) {
    if (other.parents.includes(r.singular)) {
      inbound.push({ name: other.plural, to: other, kind: 'child', many: true });
    }
    for (const field of Object.keys(other.schema.properties ?? {})) {
      const ref = referenceOf(other, field);
      if (ref?.target !== r.singular) continue;
      inbound.push({ name: other.plural, to: other, kind: 'reference-in', field, arrayField: ref.array, many: true });
    }
  }
  // A collection that links here more than once is told apart by its field.
  const counts = new Map<string, number>();
  for (const link of inbound) counts.set(link.name, (counts.get(link.name) ?? 0) + 1);
  for (const link of inbound) {
    const name = (counts.get(link.name) ?? 0) > 1 && link.field ? `${link.name}.${link.field}` : link.name;
    if (!out.has(name)) out.set(name, { ...link, name });
  }
  return out;
}
