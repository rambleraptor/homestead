/**
 * `include`: a GET of a record, or a list, that brings the records it's linked
 * to (`./links`) along — `GET /people?filter=…&include=households` returns each
 * person with their households beside them, under `$included`:
 *
 *     { "id": "abc", "name": "Jake", …,
 *       "$included": { "households": { "results": [ … ], "more": false } } }
 *
 * A link to one record (an outbound reference field, `parent`) gives that
 * record or null; every other link a list, cut at {@link PER_LINK} with `more`.
 *
 * Every included record is decided the way a GET of it would be (`canRead`,
 * the engine's own read check): one the caller can't read is left out, exactly
 * as if it didn't exist. They're serialized like any read — secrets as
 * descriptors, files as download URLs.
 *
 * Bounded so a request can't fan out: one hop (no `households.members.…`), at
 * most {@link MAX_LINKS} links, and reference links are read in one batch per
 * link per page rather than per record. Child collections are read per record.
 */

import { listResources, getResource } from './store';
import { storedToMap } from './crud';
import { isReferenceTo } from './references';
import { linksOf, type Link } from './links';
import type { RegisteredResource, Registry } from './registry';
import type { StoredResource } from './types';

/** Links one request may include. */
export const MAX_LINKS = 3;
/** Records one link brings per record. */
export const PER_LINK = 25;
/** Values in one batched query; more are split across several. */
const BATCH = 100;
/** Rows read per page while scanning for referrers. */
const SCAN_PAGE = 1000;

type Row = Record<string, unknown>;
type CanRead = (resource: RegisteredResource, path: string) => boolean;

/** The links `raw` names on `r`, or why it can't be included. */
export function parseInclude(reg: Registry, r: RegisteredResource, raw: string): Link[] | { error: string } {
  const names = [...new Set(raw.split(',').map((n) => n.trim()).filter(Boolean))];
  if (names.length === 0) return [];
  const available = linksOf(reg, r);
  const valid = [...available.keys()].sort();
  const unknown = names.filter((n) => !available.has(n));
  if (unknown.length > 0) {
    return {
      error:
        `${r.plural} has no link named ${unknown.map((n) => `"${n}"`).join(', ')}. ` +
        (valid.length > 0 ? `It links to: ${valid.join(', ')}.` : 'It has no links.'),
    };
  }
  if (names.length > MAX_LINKS) {
    return { error: `include at most ${MAX_LINKS} links at a time (got ${names.length})` };
  }
  return names.map((n) => available.get(n)!);
}

const quote = (value: string) => JSON.stringify(value);

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Every row of `r` matching `filter`, page after page. */
function scan(reg: Registry, r: RegisteredResource, filter: string): StoredResource[] {
  const rows: StoredResource[] = [];
  let token = '';
  for (;;) {
    const page = listResources(reg.db, r.plural, {}, r.schema, SCAN_PAGE, token, 0, filter);
    rows.push(...page.results);
    if (!page.nextPageToken) return rows;
    token = page.nextPageToken;
  }
}

/** The values a reference field holds on a record, as a list. */
function referenceValues(record: Row, field: string): string[] {
  const value = record[field];
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string' && v !== '');
  return typeof value === 'string' && value !== '' ? [value] : [];
}

/** The path a stored reference value names: as stored, or the target's path for a bare id. */
function pathOf(value: string, to: RegisteredResource): string | null {
  if (value.includes('/')) return value;
  // A bare id names a record only in a top-level collection.
  return to.parents.length === 0 ? `${to.plural}/${value}` : null;
}

/** A list of included records, cut at {@link PER_LINK}. */
function listOf(records: Row[]): { results: Row[]; more: boolean } {
  return { results: records.slice(0, PER_LINK), more: records.length > PER_LINK };
}

/** Records an outbound reference names, read in batches. */
function followOut(reg: Registry, link: Link, records: Row[], canRead: CanRead): Map<Row, unknown> {
  const to = link.to;
  const paths = new Set<string>();
  for (const record of records) {
    for (const value of referenceValues(record, link.field!)) {
      const path = pathOf(value, to);
      if (path) paths.add(path);
    }
  }
  const found = new Map<string, Row>();
  const topLevel = [...paths].filter((p) => p.startsWith(`${to.plural}/`) && p.split('/').length === 2);
  for (const batch of chunks(topLevel, BATCH)) {
    const ids = batch.map((p) => quote(p.slice(to.plural.length + 1)));
    for (const row of scan(reg, to, `id in [${ids.join(', ')}]`)) {
      if (canRead(to, row.path)) found.set(row.path, storedToMap(reg, to, row));
    }
  }
  for (const path of paths) {
    if (found.has(path) || topLevel.includes(path)) continue;
    const row = getResource(reg.db, to.plural, path, to.schema);
    if (row && canRead(to, row.path)) found.set(row.path, storedToMap(reg, to, row));
  }

  const out = new Map<Row, unknown>();
  for (const record of records) {
    const linked = referenceValues(record, link.field!)
      .map((v) => pathOf(v, to))
      .filter((p): p is string => p !== null && found.has(p))
      .map((p) => found.get(p)!);
    out.set(record, link.many ? listOf(linked) : (linked[0] ?? null));
  }
  return out;
}

/** Records whose reference field names one of `records`, read in batches. */
function followIn(reg: Registry, link: Link, records: Row[], canRead: CanRead): Map<Row, unknown> {
  const from = link.to;
  const field = link.field!;
  // A reference may be stored as the bare id or as the path.
  const forms = records.flatMap((r) => [String(r.id), String(r.path)]);
  const referrers = new Map<string, StoredResource>();
  for (const batch of chunks(forms, BATCH)) {
    const filter = link.arrayField
      ? batch.map((v) => `${quote(v)} in ${field}`).join(' || ')
      : `${field} in [${batch.map(quote).join(', ')}]`;
    for (const row of scan(reg, from, filter)) referrers.set(row.path, row);
  }
  const readable = [...referrers.values()].filter((row) => canRead(from, row.path));

  const out = new Map<Row, unknown>();
  for (const record of records) {
    const target = { id: String(record.id), path: String(record.path) };
    const linked = readable
      .filter((row) => {
        const value = row.fields[field];
        return Array.isArray(value) ? value.some((v) => isReferenceTo(v, target)) : isReferenceTo(value, target);
      })
      .map((row) => storedToMap(reg, from, row));
    out.set(record, listOf(linked));
  }
  return out;
}

/** Each record's children in the linked collection: one read per record. */
function followChildren(
  reg: Registry,
  parent: RegisteredResource,
  link: Link,
  records: Row[],
  canRead: CanRead,
): Map<Row, unknown> {
  const child = link.to;
  const column = `${parent.singular.replaceAll('-', '_')}_id`;
  const out = new Map<Row, unknown>();
  for (const record of records) {
    const { results } = listResources(reg.db, child.plural, { [column]: String(record.id) }, child.schema, PER_LINK + 1, '', 0, '');
    const linked = results
      .filter((row) => row.path.startsWith(`${String(record.path)}/`) && canRead(child, row.path))
      .map((row) => storedToMap(reg, child, row));
    out.set(record, listOf(linked));
  }
  return out;
}

/** Each record's parent. */
function followParent(reg: Registry, link: Link, records: Row[], canRead: CanRead): Map<Row, unknown> {
  const parent = link.to;
  const out = new Map<Row, unknown>();
  for (const record of records) {
    const parentPath = String(record.path).split('/').slice(0, -2).join('/');
    const row = parentPath ? getResource(reg.db, parent.plural, parentPath, parent.schema) : null;
    out.set(record, row && canRead(parent, row.path) ? storedToMap(reg, parent, row) : null);
  }
  return out;
}

/** Put each link's records on each of `records`, under `$included`. */
export function addIncluded(
  reg: Registry,
  r: RegisteredResource,
  records: Row[],
  links: Link[],
  canRead: CanRead,
): void {
  if (records.length === 0 || links.length === 0) return;
  for (const record of records) record.$included = {};
  for (const link of links) {
    const linked =
      link.kind === 'reference-out'
        ? followOut(reg, link, records, canRead)
        : link.kind === 'reference-in'
          ? followIn(reg, link, records, canRead)
          : link.kind === 'child'
            ? followChildren(reg, r, link, records, canRead)
            : followParent(reg, link, records, canRead);
    for (const record of records) (record.$included as Row)[link.name] = linked.get(record);
  }
}
