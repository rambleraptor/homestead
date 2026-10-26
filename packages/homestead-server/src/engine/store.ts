/**
 * Row storage for dynamic resources — port of pkg/resource/store.go.
 * Pagination contract: cursor = base64(last id), `ORDER BY id`, fetch
 * skip + pageSize + 1 to detect the next page. When an `order_by` is
 * supplied the result set is no longer id-ordered, so keyset pagination on
 * `id` can't apply — that path falls back to offset pagination whose token
 * carries the running offset instead (see `listResources`).
 */

import type { Database } from './sqlite';
import type { Schema, StoredResource } from './types';
import { STANDARD_FIELDS } from './types';
import { OWNER_COLUMN, sanitizeTableName } from './db';
import { compileFilter } from './filter';
import { compileOrderBy } from './order';
import { decryptText, encryptionEnabled, encryptText, isEncryptedText } from './crypto';
import { encryptionKeyId, isEncryptedField, isSecretField } from './encrypted-fields';

type SqlValue = string | number | bigint | boolean | null | Uint8Array;

function schemaPropertyNames(schema: Schema): string[] {
  return Object.keys(schema.properties ?? {})
    .filter((n) => !STANDARD_FIELDS.has(n))
    .sort();
}

/**
 * Encrypt a value bound for an encrypted column (`./encrypted-fields`) when a
 * master key is configured; an object or array is encrypted as its JSON. No-op
 * for other fields, empty values, already-encrypted values, and with no key —
 * a write that needed one was refused before it got here, so what passes
 * through is extracted text or a stored value the write didn't touch.
 */
function encryptForStore(val: unknown, schema: Schema, name: string, path: string): unknown {
  if (!encryptionEnabled() || !isEncryptedField(schema, name)) return val;
  if (val === null || val === undefined || val === '') return val;
  const text = typeof val === 'string' ? val : JSON.stringify(val);
  return isEncryptedText(text) ? text : encryptText(text, encryptionKeyId(path, name));
}

/**
 * Decrypt an encrypted column's raw value on read, before it is parsed back to
 * its type. Legacy plaintext passes through; a missing/wrong key throws (fails
 * closed) rather than leaking ciphertext.
 */
function decryptForStore(val: unknown, schema: Schema, name: string, path: string): unknown {
  if (isEncryptedField(schema, name) && typeof val === 'string' && isEncryptedText(val)) {
    return decryptText(val, encryptionKeyId(path, name));
  }
  return val;
}

/**
 * Prepare a field value for SQLite binding: object/array fields are
 * JSON-stringified (coerceFieldValue reverses this on read).
 */
function bindFieldValue(val: unknown, schema: Schema, name: string): SqlValue {
  if (val === null || val === undefined) return null;
  const propType = schema.properties?.[name]?.type;
  if (propType === 'object' || propType === 'array') {
    if (typeof val === 'string') return val;
    return JSON.stringify(val);
  }
  if (typeof val === 'boolean') return val ? 1 : 0;
  return val as SqlValue;
}

/** Convert SQLite-stored values back to their schema types. */
function coerceFieldValue(val: unknown, schema: Schema, name: string): unknown {
  const propType = schema.properties?.[name]?.type;
  switch (propType) {
    case 'boolean':
      if (typeof val === 'number' || typeof val === 'bigint') return Number(val) !== 0;
      break;
    case 'object':
    case 'array':
      if (typeof val === 'string' && val !== '') {
        try {
          return JSON.parse(val);
        } catch {
          return val;
        }
      }
      break;
  }
  return val;
}

function rowToStored(
  row: Record<string, unknown>,
  schema: Schema,
): StoredResource {
  const fields: Record<string, unknown> = {};
  const path = String(row.path);
  for (const name of schemaPropertyNames(schema)) {
    // A secret stays as stored; only `./secret-fields` opens it.
    fields[name] = isSecretField(schema, name)
      ? row[name]
      : coerceFieldValue(decryptForStore(row[name], schema, name, path), schema, name);
  }
  return {
    id: String(row.id),
    path: String(row.path),
    create_time: String(row.create_time),
    update_time: String(row.update_time),
    fields,
  };
}

export function insertResource(
  db: Database,
  plural: string,
  r: StoredResource,
  parentIds: Record<string, string>,
  schema: Schema,
  owner: string | null = null,
): void {
  const tableName = sanitizeTableName(plural);
  const colNames = ['id', 'path', 'create_time', 'update_time', OWNER_COLUMN];
  const values: SqlValue[] = [r.id, r.path, r.create_time, r.update_time, owner];

  for (const [parentParam, parentId] of Object.entries(parentIds)) {
    colNames.push(sanitizeTableName(parentParam));
    values.push(parentId);
  }
  for (const propName of schemaPropertyNames(schema)) {
    colNames.push(propName);
    const value = encryptForStore(r.fields[propName], schema, propName, r.path);
    values.push(bindFieldValue(value, schema, propName));
  }

  const placeholders = colNames.map(() => '?').join(', ');
  db.query(
    `INSERT INTO ${tableName} (${colNames.join(', ')}) VALUES (${placeholders})`,
  ).run(...values);
}

export function getResource(
  db: Database,
  plural: string,
  path: string,
  schema: Schema,
): StoredResource | null {
  const tableName = sanitizeTableName(plural);
  const selectCols = ['id', 'path', 'create_time', 'update_time', ...schemaPropertyNames(schema)];
  const row = db
    .query(`SELECT ${selectCols.join(', ')} FROM ${tableName} WHERE path = ?`)
    .get(path) as Record<string, unknown> | null;
  return row ? rowToStored(row, schema) : null;
}

export function listResources(
  db: Database,
  plural: string,
  parentIds: Record<string, string>,
  schema: Schema,
  pageSize: number,
  pageToken: string,
  skip: number,
  filter: string,
  orderBy = '',
  visibility: { sql: string; params: (string | number)[] } | null = null,
): { results: StoredResource[]; nextPageToken: string } {
  const tableName = sanitizeTableName(plural);
  const selectCols = ['id', 'path', 'create_time', 'update_time', ...schemaPropertyNames(schema)];

  const whereClauses: string[] = [];
  const args: SqlValue[] = [];

  for (const [parentParam, parentId] of Object.entries(parentIds)) {
    whereClauses.push(`${sanitizeTableName(parentParam)} = ?`);
    args.push(parentId);
  }

  if (filter !== '') {
    // Throws Error("invalid filter: ...") which the handler maps to 400.
    const compiled = compileFilter(filter, schema);
    whereClauses.push(compiled.sql);
    args.push(...compiled.params);
  }

  // Permission visibility predicate (design §4.1). AND-ed like the user filter,
  // so a caller only ever sees the intersection of what they filtered for and
  // what they're allowed to read.
  if (visibility) {
    whereClauses.push(`(${visibility.sql})`);
    args.push(...visibility.params);
  }

  // Throws Error("invalid order_by: ...") which the handler maps to 400.
  const orderCols = orderBy.trim() === '' ? '' : compileOrderBy(orderBy, schema);

  // Ordered lists can't be paginated by an `id > cursor` keyset — the id
  // sequence no longer matches result order. Offset pagination is order-
  // agnostic, so the ordered path uses it (with `id` appended as a stable
  // tiebreaker); the default path keeps the original keyset scheme untouched.
  if (orderCols !== '') {
    return listOrdered(db, tableName, selectCols, whereClauses, args, schema, pageSize, pageToken, skip, orderCols);
  }

  if (pageToken !== '') {
    let cursor = '';
    try {
      cursor = Buffer.from(pageToken, 'base64').toString('utf8');
    } catch {
      // invalid tokens are ignored, matching the Go server
    }
    if (cursor !== '') {
      whereClauses.push('id > ?');
      args.push(cursor);
    }
  }

  const where = whereClauses.length > 0 ? ` WHERE ${whereClauses.join(' AND ')}` : '';
  const fetchCount = skip + pageSize + 1;
  const rows = db
    .query(`SELECT ${selectCols.join(', ')} FROM ${tableName}${where} ORDER BY id LIMIT ?`)
    .all(...args, fetchCount) as Record<string, unknown>[];

  let results = rows.map((row) => rowToStored(row, schema));

  if (skip > 0 && skip < results.length) {
    results = results.slice(skip);
  } else if (skip >= results.length && skip > 0) {
    return { results: [], nextPageToken: '' };
  }

  let nextPageToken = '';
  if (results.length > pageSize) {
    const lastId = results[pageSize - 1]!.id;
    nextPageToken = Buffer.from(lastId, 'utf8').toString('base64');
    results = results.slice(0, pageSize);
  }

  return { results, nextPageToken };
}

/**
 * Offset-paginated list for the `order_by` path. The page token base64-encodes
 * the running offset; the first page's offset is `skip`. `id` is appended to
 * the ORDER BY so ties resolve deterministically and pages don't overlap.
 */
function listOrdered(
  db: Database,
  tableName: string,
  selectCols: string[],
  whereClauses: string[],
  args: SqlValue[],
  schema: Schema,
  pageSize: number,
  pageToken: string,
  skip: number,
  orderCols: string,
): { results: StoredResource[]; nextPageToken: string } {
  let offset = skip;
  if (pageToken !== '') {
    try {
      const n = parseInt(Buffer.from(pageToken, 'base64').toString('utf8'), 10);
      if (!Number.isNaN(n) && n >= 0) offset = n;
    } catch {
      // invalid tokens are ignored, matching the keyset path
    }
  }

  // Append `id` as a final tiebreaker unless the caller already ordered by it.
  const orderSql = /(^|,\s*)id(\s|$)/i.test(orderCols) ? orderCols : `${orderCols}, id`;
  const where = whereClauses.length > 0 ? ` WHERE ${whereClauses.join(' AND ')}` : '';
  const rows = db
    .query(
      `SELECT ${selectCols.join(', ')} FROM ${tableName}${where} ORDER BY ${orderSql} LIMIT ? OFFSET ?`,
    )
    .all(...args, pageSize + 1, offset) as Record<string, unknown>[];

  let results = rows.map((row) => rowToStored(row, schema));

  let nextPageToken = '';
  if (results.length > pageSize) {
    results = results.slice(0, pageSize);
    nextPageToken = Buffer.from(String(offset + pageSize), 'utf8').toString('base64');
  }

  return { results, nextPageToken };
}

export function updateResource(
  db: Database,
  plural: string,
  path: string,
  fields: Record<string, unknown>,
  updateTime: string,
  schema: Schema,
): void {
  const tableName = sanitizeTableName(plural);
  const setClauses = ['update_time = ?'];
  const args: SqlValue[] = [updateTime];

  for (const propName of schemaPropertyNames(schema)) {
    if (propName in fields) {
      setClauses.push(`${propName} = ?`);
      const value = encryptForStore(fields[propName], schema, propName, path);
      args.push(bindFieldValue(value, schema, propName));
    }
  }

  args.push(path);
  db.query(`UPDATE ${tableName} SET ${setClauses.join(', ')} WHERE path = ?`).run(...args);
}

export function deleteResource(db: Database, plural: string, path: string): boolean {
  const result = db
    .query(`DELETE FROM ${sanitizeTableName(plural)} WHERE path = ?`)
    .run(path);
  return result.changes > 0;
}
