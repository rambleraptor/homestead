/**
 * /aep-resource-definitions CRUD — port of pkg/meta/handler.go. Definitions
 * persist in `_aep_resource_definitions`; create/update also (un)register the
 * live resource through the Registry.
 */

import { encryptedFieldsError, sweepEncryption } from './encrypted-fields';
import type { Database } from './sqlite';
import { errorResponse, jsonResponse } from './errors';
import { nowRFC3339 } from './ids';
import type { Registry } from './registry';
import type { ResourceDefinition } from './types';

interface DefinitionRow {
  id: string;
  singular: string;
  plural: string;
  description: string;
  examples_json: string;
  schema_json: string;
  parents_json: string;
  enums_json: string;
  file_fields_json: string;
  singleton: number;
  user_settable_create: number;
  superuser_write: number;
  independent_access: number;
  create_time: string;
  update_time: string;
}

const SELECT_COLS =
  'id, singular, plural, description, examples_json, schema_json, parents_json, enums_json, file_fields_json, singleton, user_settable_create, superuser_write, independent_access, create_time, update_time';

function rowToDefinition(row: DefinitionRow): ResourceDefinition {
  const def: ResourceDefinition = {
    id: row.id,
    path: `aep-resource-definitions/${row.id}`,
    singular: row.singular,
    plural: row.plural,
    schema: JSON.parse(row.schema_json),
    create_time: row.create_time,
    update_time: row.update_time,
  };
  if (row.description) def.description = row.description;
  const parents = JSON.parse(row.parents_json || '[]');
  if (Array.isArray(parents) && parents.length > 0) def.parents = parents;
  const examples = JSON.parse(row.examples_json || '{}');
  if (examples && Object.keys(examples).length > 0) def.examples = examples;
  const enums = row.enums_json ? JSON.parse(row.enums_json) : null;
  if (enums && Object.keys(enums).length > 0) def.enums = enums;
  const fileFields = row.file_fields_json ? JSON.parse(row.file_fields_json) : null;
  if (Array.isArray(fileFields) && fileFields.length > 0) def.file_fields = fileFields;
  if (row.singleton !== 0) def.singleton = true;
  if (row.user_settable_create !== 0) def.user_settable_create = true;
  if (row.superuser_write !== 0) def.superuser_write = true;
  if (row.independent_access !== 0) def.independent_access = true;
  return def;
}

export function getDefinitionById(db: Database, id: string): ResourceDefinition | null {
  const row = db
    .query(`SELECT ${SELECT_COLS} FROM _aep_resource_definitions WHERE id = ?`)
    .get(id) as DefinitionRow | null;
  return row ? rowToDefinition(row) : null;
}

export function getDefinitionBySingular(
  db: Database,
  singular: string,
): ResourceDefinition | null {
  const row = db
    .query(`SELECT ${SELECT_COLS} FROM _aep_resource_definitions WHERE singular = ?`)
    .get(singular) as DefinitionRow | null;
  return row ? rowToDefinition(row) : null;
}

export function listDefinitions(
  db: Database,
  limit: number,
  cursor: string,
): ResourceDefinition[] {
  const rows = (
    cursor !== ''
      ? db
          .query(
            `SELECT ${SELECT_COLS} FROM _aep_resource_definitions WHERE id > ? ORDER BY id LIMIT ?`,
          )
          .all(cursor, limit)
      : db
          .query(`SELECT ${SELECT_COLS} FROM _aep_resource_definitions ORDER BY id LIMIT ?`)
          .all(limit)
  ) as DefinitionRow[];
  return rows.map(rowToDefinition);
}

export function loadAllDefinitions(db: Database): ResourceDefinition[] {
  return listDefinitions(db, 10000, '');
}

function insertDefinition(db: Database, def: ResourceDefinition): void {
  db.query(
    'INSERT INTO _aep_resource_definitions (id, singular, plural, description, examples_json, schema_json, parents_json, enums_json, file_fields_json, singleton, user_settable_create, superuser_write, independent_access, create_time, update_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(
    def.id!,
    def.singular,
    def.plural,
    def.description ?? '',
    JSON.stringify(def.examples ?? {}),
    JSON.stringify(def.schema),
    JSON.stringify(def.parents ?? []),
    JSON.stringify(def.enums ?? {}),
    JSON.stringify(def.file_fields ?? []),
    def.singleton ? 1 : 0,
    def.user_settable_create ? 1 : 0,
    def.superuser_write ? 1 : 0,
    def.independent_access ? 1 : 0,
    def.create_time!,
    def.update_time!,
  );
}

function updateDefinitionRow(db: Database, def: ResourceDefinition): void {
  db.query(
    'UPDATE _aep_resource_definitions SET description = ?, examples_json = ?, schema_json = ?, enums_json = ?, file_fields_json = ?, user_settable_create = ?, superuser_write = ?, independent_access = ?, update_time = ? WHERE id = ?',
  ).run(
    def.description ?? '',
    JSON.stringify(def.examples ?? {}),
    JSON.stringify(def.schema),
    JSON.stringify(def.enums ?? {}),
    JSON.stringify(def.file_fields ?? []),
    def.user_settable_create ? 1 : 0,
    def.superuser_write ? 1 : 0,
    def.independent_access ? 1 : 0,
    def.update_time!,
    def.id!,
  );
}

function deleteDefinitionRow(db: Database, id: string): void {
  db.query('DELETE FROM _aep_resource_definitions WHERE id = ?').run(id);
}

/** Topologically sort definitions so parents register before children. */
export function topoSortDefs(defs: ResourceDefinition[]): ResourceDefinition[] {
  const byName = new Map(defs.map((d) => [d.singular, d]));
  const visited = new Set<string>();
  const sorted: ResourceDefinition[] = [];

  function visit(name: string): void {
    if (visited.has(name)) return;
    visited.add(name);
    const d = byName.get(name);
    if (!d) return;
    for (const p of d.parents ?? []) visit(p);
    sorted.push(d);
  }

  for (const d of defs) visit(d.singular);
  return sorted;
}

/**
 * Re-inject `x-aepbase-file-field: true` markers when serializing a
 * definition (the stored schema may have come from a client that declared
 * them; the Go server re-emitted them from the tracked file_fields list).
 */
function withFileFieldMarkers(def: ResourceDefinition): ResourceDefinition {
  if (!def.file_fields || def.file_fields.length === 0) return def;
  const properties = { ...def.schema.properties };
  for (const name of def.file_fields) {
    const prop = properties[name];
    if (prop) properties[name] = { ...prop, 'x-aepbase-file-field': true };
  }
  return { ...def, schema: { ...def.schema, properties } };
}

/** Property names marked x-aepbase-file-field: true in a schema. */
function extractFileFields(def: ResourceDefinition): string[] {
  const names: string[] = [];
  for (const [name, prop] of Object.entries(def.schema?.properties ?? {})) {
    if (prop && prop['x-aepbase-file-field'] === true) names.push(name);
  }
  return names;
}

function mergeStringSets(a: string[], b: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of [...a, ...b]) {
    if (!seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

function stringSlicesEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

// --- HTTP handlers ---

export async function handleMetaCreate(reg: Registry, req: Request): Promise<Response> {
  let def: ResourceDefinition;
  try {
    def = (await req.json()) as ResourceDefinition;
  } catch (err) {
    return errorResponse(400, `invalid JSON: ${err instanceof Error ? err.message : err}`);
  }

  // Auto-detect file fields from x-aepbase-file-field markers in the schema.
  const detected = extractFileFields(def);
  if (detected.length > 0) {
    def.file_fields = mergeStringSets(def.file_fields ?? [], detected);
  }

  if (!def.singular || !def.plural) {
    return errorResponse(400, 'singular and plural are required');
  }
  if (def.plural.startsWith('_')) {
    return errorResponse(400, 'plural must not start with underscore');
  }
  if (def.singleton && (def.parents ?? []).length === 0) {
    return errorResponse(400, 'singleton resources must have at least one parent');
  }
  const encryptedErr = encryptedFieldsError(def.schema ?? { properties: {} });
  if (encryptedErr) return errorResponse(400, encryptedErr);

  const url = new URL(req.url);
  const id = url.searchParams.get('id') || def.singular;
  def.id = id;
  def.path = `aep-resource-definitions/${id}`;
  const now = nowRFC3339();
  def.create_time = now;
  def.update_time = now;

  for (const parentSingular of def.parents ?? []) {
    if (!reg.has(parentSingular) && !getDefinitionBySingular(reg.db, parentSingular)) {
      return errorResponse(400, `parent resource "${parentSingular}" not found`);
    }
  }

  if (getDefinitionById(reg.db, id)) {
    return errorResponse(409, `definition with id "${id}" already exists`);
  }

  try {
    insertDefinition(reg.db, def);
  } catch (err) {
    return errorResponse(500, `saving definition: ${err instanceof Error ? err.message : err}`);
  }

  try {
    reg.addResource(def);
  } catch (err) {
    deleteDefinitionRow(reg.db, id);
    return errorResponse(
      500,
      `registering resource: ${err instanceof Error ? err.message : err}`,
    );
  }

  return jsonResponse(withFileFieldMarkers(def));
}

export function handleMetaGet(reg: Registry, id: string): Response {
  const def = getDefinitionById(reg.db, id);
  if (!def) return errorResponse(404, `definition "${id}" not found`);
  return jsonResponse(withFileFieldMarkers(def));
}

export function handleMetaList(reg: Registry, req: Request): Response {
  const url = new URL(req.url);
  let pageSize = 50;
  const ps = url.searchParams.get('max_page_size');
  if (ps) {
    const n = parseInt(ps, 10);
    if (!Number.isNaN(n) && n > 0) pageSize = Math.min(n, 1000);
  }

  let cursor = '';
  const pageToken = url.searchParams.get('page_token');
  if (pageToken) {
    try {
      cursor = Buffer.from(pageToken, 'base64').toString('utf8');
    } catch {
      // ignored, matching the Go server
    }
  }

  let defs = listDefinitions(reg.db, pageSize + 1, cursor);
  let nextPageToken = '';
  if (defs.length > pageSize) {
    nextPageToken = Buffer.from(defs[pageSize - 1]!.id!, 'utf8').toString('base64');
    defs = defs.slice(0, pageSize);
  }

  const resp: Record<string, unknown> = { results: defs.map(withFileFieldMarkers) };
  if (nextPageToken !== '') resp.next_page_token = nextPageToken;
  return jsonResponse(resp);
}

export async function handleMetaUpdate(
  reg: Registry,
  req: Request,
  id: string,
): Promise<Response> {
  const existing = getDefinitionById(reg.db, id);
  if (!existing) return errorResponse(404, `definition "${id}" not found`);

  let patch: Partial<ResourceDefinition>;
  try {
    patch = (await req.json()) as Partial<ResourceDefinition>;
  } catch (err) {
    return errorResponse(400, `invalid JSON: ${err instanceof Error ? err.message : err}`);
  }

  if (patch.parents && !stringSlicesEqual(patch.parents, existing.parents ?? [])) {
    return errorResponse(400, 'changing parents is not supported');
  }
  if (patch.singular && patch.singular !== existing.singular) {
    return errorResponse(400, 'changing singular name is not supported');
  }
  if (patch.plural && patch.plural !== existing.plural) {
    return errorResponse(400, 'changing plural name is not supported');
  }

  const oldDef: ResourceDefinition = {
    ...existing,
    schema: existing.schema,
  };

  if (patch.description) existing.description = patch.description;
  if (patch.examples) {
    existing.examples = { ...existing.examples, ...patch.examples };
  }
  if (patch.schema?.properties) {
    const encryptedErr = encryptedFieldsError(patch.schema);
    if (encryptedErr) return errorResponse(400, encryptedErr);
    existing.schema = patch.schema;
  }
  if (patch.enums) {
    existing.enums = patch.enums;
  }
  if (patch.user_settable_create !== undefined) {
    existing.user_settable_create = patch.user_settable_create;
  }
  if (patch.superuser_write !== undefined) {
    existing.superuser_write = patch.superuser_write;
  }
  if (patch.independent_access !== undefined) {
    existing.independent_access = patch.independent_access;
  }
  const detected = patch.schema ? extractFileFields({ schema: patch.schema } as ResourceDefinition) : [];
  if (detected.length > 0 || patch.file_fields) {
    existing.file_fields = mergeStringSets(patch.file_fields ?? [], detected);
  }

  existing.update_time = nowRFC3339();

  // Columns the caller has authorized dropping even when populated. The schema
  // sync sets this from migrations that declare a matching `drops`; a bare
  // PATCH omits it, so a populated column is refused by default (see
  // updateResourceSchema).
  const authorizedDrops = new Set(
    (req.headers.get('x-homestead-authorized-drops') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );

  try {
    reg.updateResourceSchema(existing, oldDef, authorizedDrops);
  } catch (err) {
    return errorResponse(400, err instanceof Error ? err.message : String(err));
  }

  try {
    updateDefinitionRow(reg.db, existing);
  } catch (err) {
    return errorResponse(500, `saving definition: ${err instanceof Error ? err.message : err}`);
  }

  // A field newly marked encrypted still holds plaintext: encrypt it now.
  const registered = reg.get(existing.singular);
  if (registered) sweepEncryption(reg.db, registered);

  return jsonResponse(withFileFieldMarkers(existing));
}

export function handleMetaDelete(reg: Registry, id: string): Response {
  const existing = getDefinitionById(reg.db, id);
  if (!existing) return errorResponse(404, `definition "${id}" not found`);

  try {
    reg.removeResource(existing.singular);
  } catch (err) {
    return errorResponse(400, err instanceof Error ? err.message : String(err));
  }

  try {
    deleteDefinitionRow(reg.db, id);
  } catch (err) {
    return errorResponse(
      500,
      `deleting definition: ${err instanceof Error ? err.message : err}`,
    );
  }

  return new Response(null, { status: 204 });
}
