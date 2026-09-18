/**
 * Referential integrity for resource references.
 *
 * A string field annotated `reference: { resource, onDelete }` in an app's
 * schema is translated to an `x-aepbase-reference` marker on its wire property
 * (see `homestead-core/resources/translate.ts`). This module reads those
 * markers off the live registry to answer "who points at this record?" when a
 * record is deleted, and applies the declared `onDelete` behavior:
 *
 *   - `restrict`  → block the delete (checked up front, before any mutation)
 *   - `set-null`  → clear the pointer on each referring record (array: drop the
 *                   element)
 *   - `cascade`   → delete each referring record (and its subtree)
 *
 * Enforcement is opt-in: only markers that carry an `onDelete` are acted on, so
 * a bare reference (e.g. every `created_by`) never blocks or rewrites anything.
 */

import type { RegisteredResource, Registry } from './registry';
import type { SchemaProperty, StoredResource } from './types';
import { listResources } from './store';

export type OnDelete = 'restrict' | 'set-null' | 'cascade';

/** A field on some resource that references the resource being deleted. */
export interface Referrer {
  resource: RegisteredResource;
  field: string;
  /** True when the reference lives on an array's items (a to-many link). */
  isArray: boolean;
  onDelete: OnDelete;
}

/** The reference marker on a property, if it declares a valid one. */
function referenceMarker(
  prop: SchemaProperty | undefined,
): { resource: string; onDelete?: OnDelete } | null {
  const marker = prop?.['x-aepbase-reference'];
  if (!marker || typeof marker !== 'object') return null;
  const { resource, onDelete } = marker as { resource?: unknown; onDelete?: unknown };
  if (typeof resource !== 'string' || !resource) return null;
  return {
    resource,
    onDelete: typeof onDelete === 'string' ? (onDelete as OnDelete) : undefined,
  };
}

/**
 * Every field, across all registered resources, that references
 * `targetSingular` *and* declares an `onDelete`. Bare references (no onDelete)
 * are excluded — they're not enforced.
 */
export function findReferrers(reg: Registry, targetSingular: string): Referrer[] {
  const out: Referrer[] = [];
  for (const r of reg.all()) {
    if (r.builtin) continue;
    for (const [field, prop] of Object.entries(r.schema.properties ?? {})) {
      const scalar = referenceMarker(prop);
      if (scalar?.resource === targetSingular && scalar.onDelete) {
        out.push({ resource: r, field, isArray: false, onDelete: scalar.onDelete });
        continue;
      }
      if (prop.type === 'array') {
        const item = referenceMarker(prop.items);
        if (item?.resource === targetSingular && item.onDelete) {
          out.push({ resource: r, field, isArray: true, onDelete: item.onDelete });
        }
      }
    }
  }
  return out;
}

/**
 * The record a reference can name. A stored reference value is either the bare
 * id or the full resource path (`projects/abc`) — the SPA writes paths for some
 * fields, the chat/MCP tools write bare ids — so both forms must match.
 */
export interface ReferenceTarget {
  id: string;
  path: string;
}

/** Does a single stored reference value name `target`? */
export function isReferenceTo(value: unknown, target: ReferenceTarget): boolean {
  return value === target.id || value === target.path;
}

/** Does a stored field value reference `target`? */
function valueReferences(value: unknown, target: ReferenceTarget, isArray: boolean): boolean {
  return isArray
    ? Array.isArray(value) && value.some((v) => isReferenceTo(v, target))
    : isReferenceTo(value, target);
}

/**
 * All rows of `ref.resource` whose reference field points at `target`. Scans the
 * whole collection (household-scale data, and reference columns aren't
 * indexed for array membership) — cheap in practice and only runs when a
 * referrer actually exists.
 */
export function collectReferrers(
  reg: Registry,
  ref: Referrer,
  target: ReferenceTarget,
): StoredResource[] {
  const matches: StoredResource[] = [];
  let token = '';
  for (;;) {
    const { results, nextPageToken } = listResources(
      reg.db,
      ref.resource.plural,
      {},
      ref.resource.schema,
      1000,
      token,
      0,
      '',
    );
    for (const row of results) {
      if (valueReferences(row.fields[ref.field], target, ref.isArray)) matches.push(row);
    }
    if (nextPageToken === '') break;
    token = nextPageToken;
  }
  return matches;
}

/**
 * If deleting `target` (a `singular` record) would strand a `restrict` reference, return a
 * human-readable reason (→ 409); otherwise null. Read-only: run before opening
 * the delete transaction, mirroring the existing child-row restrict check.
 */
export function checkReferenceRestrict(
  reg: Registry,
  singular: string,
  target: ReferenceTarget,
): string | null {
  for (const ref of findReferrers(reg, singular)) {
    if (ref.onDelete !== 'restrict') continue;
    const matches = collectReferrers(reg, ref, target);
    if (matches.length > 0) {
      return (
        `cannot delete: ${matches.length} ${ref.resource.plural} ` +
        `record(s) reference it via "${ref.field}"; remove or reassign them first`
      );
    }
  }
  return null;
}
