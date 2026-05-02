/**
 * Pure client-side filter evaluation for module filter decls.
 *
 * Each decl is resolved against a dot-path into the record. Semantics per
 * type:
 *   - text:      every whitespace-separated term must match (case-
 *                insensitive substring). Array fields match if any
 *                element contains the term.
 *   - enum:      equality against the resolved value. Array fields use
 *                `.includes(value)`. `multi: true` values combine OR.
 *   - boolean:   strict `===` comparison.
 *   - dateRange: inclusive ISO-string comparison on `start`/`end`.
 *
 * Undefined / empty / type-mismatched values are ignored (no-op clause).
 */

import type { DateRangeValue, ModuleFilterDecl } from './types';

export function getByPath(record: unknown, path: string): unknown {
  if (record == null || typeof record !== 'object') return undefined;
  let cursor: unknown = record;
  for (const segment of path.split('.')) {
    if (cursor == null || typeof cursor !== 'object') return undefined;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}

function matchesText(fieldValue: unknown, value: string): boolean {
  const terms = value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystacks = Array.isArray(fieldValue)
    ? fieldValue.map((v) => (typeof v === 'string' ? v.toLowerCase() : ''))
    : typeof fieldValue === 'string'
      ? [fieldValue.toLowerCase()]
      : [];
  if (haystacks.length === 0) return false;
  return terms.every((term) => haystacks.some((h) => h.includes(term)));
}

function matchesEnumScalar(fieldValue: unknown, value: string): boolean {
  if (Array.isArray(fieldValue)) return fieldValue.includes(value);
  return fieldValue === value;
}

function matchesEnum(
  fieldValue: unknown,
  value: unknown,
  multi: boolean | undefined,
): boolean {
  if (multi) {
    if (!Array.isArray(value) || value.length === 0) return true;
    return (value as unknown[]).some(
      (v) => typeof v === 'string' && matchesEnumScalar(fieldValue, v),
    );
  }
  if (typeof value !== 'string' || value === '') return true;
  return matchesEnumScalar(fieldValue, value);
}

function matchesBoolean(fieldValue: unknown, value: unknown): boolean {
  if (typeof value === 'boolean') return fieldValue === value;
  if (value === 'true') return fieldValue === true;
  if (value === 'false') return fieldValue === false;
  return true;
}

function matchesDateRange(fieldValue: unknown, value: unknown): boolean {
  if (!value || typeof value !== 'object') return true;
  const { start, end } = value as DateRangeValue;
  if (typeof fieldValue !== 'string') {
    return !start && !end;
  }
  if (start && fieldValue < start) return false;
  if (end && fieldValue > end) return false;
  return true;
}

function evaluate(
  decl: ModuleFilterDecl,
  record: unknown,
  value: unknown,
): boolean {
  const fieldValue = getByPath(record, decl.field ?? decl.key);
  switch (decl.type) {
    case 'text':
      if (typeof value !== 'string' || value.trim() === '') return true;
      return matchesText(fieldValue, value);
    case 'enum':
      return matchesEnum(fieldValue, value, decl.multi);
    case 'boolean':
      return matchesBoolean(fieldValue, value);
    case 'dateRange':
      return matchesDateRange(fieldValue, value);
  }
}

export function applyFilters<T>(
  items: T[],
  decls: ModuleFilterDecl[],
  values: Record<string, unknown>,
): T[] {
  if (decls.length === 0) return items;
  return items.filter((item) =>
    decls.every((decl) => {
      const value = values[decl.key];
      if (value === undefined || value === null) return true;
      return evaluate(decl, item, value);
    }),
  );
}

/**
 * Collect unique string values for an enum filter from the loaded items.
 * Array-typed fields are flattened. Used by `<FilterBar>` to drive chip
 * rows without requiring a static `values` list on the decl.
 */
export function deriveEnumOptions<T>(
  items: T[],
  decl: ModuleFilterDecl,
): string[] {
  const path = decl.field ?? decl.key;
  const seen = new Set<string>();
  for (const item of items) {
    const raw = getByPath(item, path);
    if (Array.isArray(raw)) {
      for (const v of raw) {
        if (typeof v === 'string' && v) seen.add(v);
      }
    } else if (typeof raw === 'string' && raw) {
      seen.add(raw);
    }
  }
  return Array.from(seen).sort();
}
