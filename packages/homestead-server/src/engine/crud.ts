/**
 * Dynamic resource CRUD — port of pkg/resource/handler.go, with the Go
 * server's behavioral quirks preserved (delete → 204, merge semantics,
 * singleton implicit creation, download-URL echo). Create returns 201 Created
 * (AEP-133), as does an apply/PUT that creates a new resource; an apply that
 * updates an existing one returns 200. (The Go server returned 200 on create;
 * this diverges deliberately to follow current AEP guidance.)
 *
 * One deliberate improvement over Go: multipart bodies may carry non-file
 * fields as plain string parts (coerced to their schema types), which is
 * what the SPA client actually sends. The Go server only read a
 * `resource`/`body` JSON part and silently dropped scalar parts — breaking
 * any create-with-image. Both layouts are accepted here.
 */

import { errorResponse, HttpError, isUniqueConstraintError, jsonResponse } from './errors';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import {
  deleteAllFileFields,
  fileFieldExists,
  fileKeyId,
  fileLooksEncrypted,
  filePath,
  openFileStream,
  writeFileField,
} from './files';
import {
  decryptBytes,
  DecryptError,
  encryptionEnabled,
  FILE_MARKER_ENCRYPTED,
  FILE_MARKER_PLAINTEXT,
  MissingMasterKeyError,
} from './crypto';
import { generateId, nowRFC3339 } from './ids';
import type { RegisteredResource, Registry } from './registry';
import {
  checkReferenceRestrict,
  collectReferrers,
  findReferrers,
  isReferenceTo,
  type ReferenceTarget,
} from './references';
import {
  deleteResource,
  getResource,
  insertResource,
  listResources,
  updateResource,
} from './store';
import type { Schema, StoredResource, User } from './types';
import { STANDARD_FIELDS, TYPE_SUPERUSER } from './types';
import { applyDynamicDefaults } from './defaults';
import {
  applyDefaults,
  stripReadOnlyFields,
  immutableFieldsIn,
  immutableFieldsError,
  validateConstraints,
  validateEnums,
  validateRequiredWithFiles,
  validateTypes,
} from './validate';

/** A resolved dynamic-resource route. */
export interface RouteMatch {
  resource: RegisteredResource;
  /** All ancestor ids keyed by param name (e.g. {user_id: "u1"}). */
  parentIds: Record<string, string>;
  /** Addressed resource id ("" for collection/singleton requests). */
  id: string;
  /** Custom-method verb after ":" ("" when none). */
  verb: string;
  kind: 'collection' | 'resource' | 'singleton';
}

/**
 * User scoping: children of the built-in user resource are only visible to
 * their owner (superusers see everything). Throws 403 on violation.
 */
export function checkUserScope(match: RouteMatch, caller: User | null): void {
  if (!caller) return; // no auth context (unit tests); auth middleware enforces presence
  if (caller.type === TYPE_SUPERUSER) return;
  const userId = match.parentIds.user_id;
  if (userId && userId !== caller.id) {
    throw new HttpError(403, 'you do not have access to this resource');
  }
}

/**
 * Superuser-only writes: resources flagged `superuser_write` (e.g.
 * `account-tag`, which gates app access) may only be created, updated, or
 * deleted by superusers. Reads are unaffected — a user-parented resource
 * stays readable by its owner via {@link checkUserScope}. Call only on
 * mutating requests (create/update/apply/delete). Throws 403 on violation.
 */
export function checkSuperuserWrite(match: RouteMatch, caller: User | null): void {
  if (!caller) return; // no auth context (unit tests); auth middleware enforces presence
  if (caller.type === TYPE_SUPERUSER) return;
  if (match.resource.superuserWrite) {
    throw new HttpError(403, 'only superusers can modify this resource');
  }
}

/** Direct-parent FK columns only (grandparent ids live in the path). */
function directParentIds(
  reg: Registry,
  r: RegisteredResource,
  allParentIds: Record<string, string>,
): Record<string, string> {
  void reg;
  const direct: Record<string, string> = {};
  for (const parentSingular of r.parents) {
    const param = `${parentSingular.replaceAll('-', '_')}_id`;
    if (param in allParentIds) direct[param] = allParentIds[param]!;
  }
  return direct;
}

/** AEP path like "publishers/pub1/books/book1" from pattern + ids. */
export function buildResourcePath(
  r: RegisteredResource,
  parentIds: Record<string, string>,
  id: string,
): string {
  const parts: string[] = [];
  const elems = r.patternElems;
  for (let i = 0; i + 2 < elems.length; i += 2) {
    const collection = elems[i]!;
    const param = elems[i + 1]!.slice(1, -1);
    parts.push(collection, parentIds[param] ?? '');
  }
  parts.push(elems[elems.length - 2]!, id);
  return parts.join('/');
}

function buildSingletonPath(
  reg: Registry,
  r: RegisteredResource,
  parentIds: Record<string, string>,
): string {
  const parts: string[] = [];
  if (r.parents.length > 0) {
    const parent = reg.get(r.parents[0]!);
    if (parent) {
      const elems = parent.patternElems;
      for (let i = 0; i < elems.length; i += 2) {
        const param = elems[i + 1]!.slice(1, -1);
        parts.push(elems[i]!, parentIds[param] ?? '');
      }
    }
  }
  parts.push(r.singular);
  return parts.join('/');
}

/** Singleton row id: the direct parent's id (one singleton per parent). */
function singletonId(r: RegisteredResource, parentIds: Record<string, string>): string {
  if (r.parents.length > 0) {
    const param = `${r.parents[0]!.replaceAll('-', '_')}_id`;
    if (parentIds[param]) return parentIds[param]!;
  }
  return r.singular;
}

function fileFieldDownloadUrl(serverUrl: string, resourcePath: string, field: string): string {
  return `${serverUrl.replace(/\/+$/, '')}/${resourcePath}:download?field=${field}`;
}

/**
 * Response map for a stored resource: standard fields + schema fields that
 * are present, with file fields rewritten to download URLs (omitted when
 * there is no on-disk content).
 */
function storedToMap(
  reg: Registry,
  r: RegisteredResource,
  s: StoredResource,
): Record<string, unknown> {
  const m: Record<string, unknown> = {
    id: s.id,
    path: s.path,
    create_time: s.create_time,
    update_time: s.update_time,
  };
  for (const propName of Object.keys(r.schema.properties ?? {})) {
    if (propName in s.fields) m[propName] = s.fields[propName];
  }
  for (const name of r.fileFields) {
    if (!fileFieldExists(reg.filesDir, s.path, name)) {
      delete m[name];
      continue;
    }
    m[name] = fileFieldDownloadUrl(reg.serverUrl, s.path, name);
    // Surface the authoritative at-rest encryption marker as a read-only
    // `<field>_encrypted` boolean. The marker lives only in the DB column (which
    // we just overwrote with the download URL), so this derived flag is the only
    // way a client can tell an encrypted file from legacy plaintext.
    m[`${name}_encrypted`] = s.fields[name] === FILE_MARKER_ENCRYPTED;
  }
  return m;
}

/** Singletons have no "id" field in responses. */
function singletonToMap(r: RegisteredResource, s: StoredResource): Record<string, unknown> {
  const m: Record<string, unknown> = {
    path: s.path,
    create_time: s.create_time,
    update_time: s.update_time,
  };
  for (const propName of Object.keys(r.schema.properties ?? {})) {
    if (propName in s.fields) m[propName] = s.fields[propName];
  }
  return m;
}

/** Coerce a multipart string part to its schema-declared type. */
function coerceFormValue(value: string, schema: Schema, name: string): unknown {
  switch (schema.properties?.[name]?.type) {
    case 'integer':
    case 'number': {
      const n = Number(value);
      return Number.isNaN(n) ? value : n;
    }
    case 'boolean':
      if (value === 'true') return true;
      if (value === 'false') return false;
      return value;
    case 'object':
    case 'array':
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    default:
      return value;
  }
}

interface ParsedBody {
  fields: Record<string, unknown>;
  uploaded: Set<string>;
}

/**
 * Parse a JSON or multipart/form-data body. Multipart accepts a
 * `resource`/`body` JSON part and/or individual scalar parts; file parts
 * matching declared file fields are streamed to disk.
 */
async function readCreateOrApplyBody(
  req: Request,
  r: RegisteredResource,
  reg: Registry,
  resourcePath: string,
): Promise<ParsedBody> {
  const mediaType = (req.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();

  if (mediaType !== 'multipart/form-data') {
    const body = await req.text();
    let fields: Record<string, unknown> = {};
    if (body.length > 0) {
      try {
        fields = JSON.parse(body);
      } catch {
        throw new HttpError(400, 'invalid JSON');
      }
      if (typeof fields !== 'object' || fields === null || Array.isArray(fields)) {
        throw new HttpError(400, 'invalid JSON');
      }
    }
    return { fields, uploaded: new Set() };
  }

  if (r.fileFields.size === 0) {
    throw new HttpError(400, 'resource does not accept multipart uploads');
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch (err) {
    throw new HttpError(400, `invalid multipart body: ${err instanceof Error ? err.message : err}`);
  }

  const fields: Record<string, unknown> = {};
  const uploaded = new Set<string>();
  for (const [name, value] of form.entries()) {
    if (typeof value === 'string') {
      if (name === 'resource' || name === 'body') {
        if (value.length === 0) continue;
        try {
          Object.assign(fields, JSON.parse(value));
        } catch (err) {
          throw new HttpError(
            400,
            `invalid JSON in "${name}" part: ${err instanceof Error ? err.message : err}`,
          );
        }
        continue;
      }
      // Scalar part: coerce to the schema type (SPA clients send these).
      fields[name] = coerceFormValue(value, r.schema, name);
      continue;
    }
    // File part matching a declared file field — write to disk.
    if (r.fileFields.has(name)) {
      try {
        await writeFileField(reg.filesDir, resourcePath, name, value);
      } catch (err) {
        throw new HttpError(
          400,
          `storing file field "${name}": ${err instanceof Error ? err.message : err}`,
        );
      }
      uploaded.add(name);
    }
    // Unknown file parts are skipped to avoid accidental writes.
  }
  return { fields, uploaded };
}

/**
 * Shared payload preparation for create/update/apply: strips standard +
 * readOnly fields, records uploads as sentinels, rejects JSON values for
 * file fields, validates types and enums. Mutates and returns `fields`.
 */
function preparePayload(
  r: RegisteredResource,
  fields: Record<string, unknown>,
  uploaded: Set<string>,
): Record<string, unknown> {
  for (const std of STANDARD_FIELDS) delete fields[std];
  stripReadOnlyFields(r.schema, fields);

  // Authoritative encryption flag for each uploaded file, gated on the same
  // encryptionEnabled() check writeFileField uses this request, so marker and
  // on-disk format always agree.
  const marker = encryptionEnabled() ? FILE_MARKER_ENCRYPTED : FILE_MARKER_PLAINTEXT;
  for (const name of uploaded) {
    fields[name] = marker;
  }
  for (const name of r.fileFields) {
    if (uploaded.has(name)) continue;
    if (name in fields && fields[name] !== null && fields[name] !== undefined) {
      throw new HttpError(
        400,
        `file field "${name}" must be uploaded as a multipart file part, not a JSON value`,
      );
    }
    delete fields[name];
  }

  const typeErr = validateTypes(r.schema, fields, r.fileFields);
  if (typeErr) throw new HttpError(400, typeErr);
  const enumErr = validateEnums(r.enums, fields);
  if (enumErr) throw new HttpError(400, enumErr);
  const constraintErr = validateConstraints(r.schema, fields, r.fileFields);
  if (constraintErr) throw new HttpError(400, constraintErr);
  return fields;
}

/**
 * Recursively apply an RFC 7396 JSON Merge Patch of `patch` onto `target`.
 * A `null` member removes the corresponding key; nested objects merge
 * recursively; arrays and scalars replace wholesale. AEP-134 mandates this
 * for the HTTP `PATCH` surface (the proto-only `update_mask`/`*` FieldMask has
 * no place here), so `object`-typed fields get a deep merge rather than being
 * clobbered whole.
 */
function mergePatch(target: unknown, patch: unknown): unknown {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) {
    return patch; // scalars, arrays, and null replace/clear wholesale
  }
  const base =
    target !== null && typeof target === 'object' && !Array.isArray(target)
      ? (target as Record<string, unknown>)
      : {};
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    if (value === null) delete out[key];
    else out[key] = mergePatch(out[key], value);
  }
  return out;
}

/**
 * Apply a prepared patch onto a resource's fields following RFC 7396. Top-level
 * scalars/arrays and explicit `null`s replace or clear the field (matching the
 * column store); a patch value for an `object`-typed field is deep-merged onto
 * the existing value so partial nested updates and null-key removal work.
 * Mutates `existing` in place.
 */
function applyMergePatch(
  schema: Schema,
  existing: Record<string, unknown>,
  patch: Record<string, unknown>,
): void {
  for (const [name, value] of Object.entries(patch)) {
    const isObjectField = schema.properties?.[name]?.type === 'object';
    if (isObjectField && value !== null && typeof value === 'object' && !Array.isArray(value)) {
      existing[name] = mergePatch(existing[name], value);
    } else {
      existing[name] = value; // scalars, arrays, and null (clear) replace wholesale
    }
  }
}

// --- handlers ---

export async function handleCreate(
  reg: Registry,
  match: RouteMatch,
  req: Request,
  caller: User | null = null,
): Promise<Response> {
  const r = match.resource;
  const url = new URL(req.url);
  const id = url.searchParams.get('id') || generateId();
  const path = buildResourcePath(r, match.parentIds, id);

  const { fields, uploaded } = await readCreateOrApplyBody(req, r, reg, path);
  preparePayload(r, fields, uploaded);
  applyDefaults(r.schema, fields);
  applyDynamicDefaults(reg, r.schema, fields);

  const requiredErr = validateRequiredWithFiles(r.schema, fields, r.fileFields, uploaded);
  if (requiredErr) throw new HttpError(400, requiredErr);

  const now = nowRFC3339();
  const stored: StoredResource = {
    id,
    path,
    create_time: now,
    update_time: now,
    fields,
  };

  try {
    insertResource(reg.db, r.plural, stored, directParentIds(reg, r, match.parentIds), r.schema, ownerFor(caller));
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return errorResponse(409, `resource "${path}" already exists`);
    }
    return errorResponse(500, `failed to create resource: ${err instanceof Error ? err.message : err}`);
  }

  const created = storedToMap(reg, r, stored);
  // Post-commit mirror (fire-and-forget; never blocks or fails the write).
  reg.syncDispatcher?.dispatch({
    event: 'create',
    resource: r.singular,
    recordId: id,
    record: created,
    previous: null,
  });
  return jsonResponse(created, 201);
}

/**
 * The owner to stamp on a newly created record: the authenticated caller's id,
 * or null when there's no auth context (unit tests, system-issued writes).
 * Phase 0 only records it — nothing reads `_owner` yet.
 */
function ownerFor(caller: User | null): string | null {
  return caller ? caller.id : null;
}

export function handleGet(reg: Registry, match: RouteMatch): Response {
  const r = match.resource;
  const path = buildResourcePath(r, match.parentIds, match.id);
  const stored = getResource(reg.db, r.plural, path, r.schema);
  if (!stored) return errorResponse(404, `resource "${path}" not found`);
  return jsonResponse(storedToMap(reg, r, stored));
}

export function handleList(
  reg: Registry,
  match: RouteMatch,
  req: Request,
  visibility: { sql: string; params: (string | number)[] } | null = null,
): Response {
  const r = match.resource;
  const url = new URL(req.url);

  let pageSize = 50;
  const ps = url.searchParams.get('max_page_size');
  if (ps) {
    const n = parseInt(ps, 10);
    // AEP-158: a negative page size is an INVALID_ARGUMENT (400), not silently
    // ignored. A zero/absent value falls back to the default page size.
    if (!Number.isNaN(n) && n < 0) {
      return errorResponse(400, 'max_page_size must not be negative');
    }
    if (!Number.isNaN(n) && n > 0) pageSize = Math.min(n, 1000);
  }
  const pageToken = url.searchParams.get('page_token') ?? '';

  let skip = 0;
  const s = url.searchParams.get('skip');
  if (s) {
    const n = parseInt(s, 10);
    if (!Number.isNaN(n) && n > 0) skip = n;
  }
  const filter = url.searchParams.get('filter') ?? '';
  const orderBy = url.searchParams.get('order_by') ?? '';

  let results: StoredResource[];
  let nextPageToken: string;
  try {
    ({ results, nextPageToken } = listResources(
      reg.db,
      r.plural,
      directParentIds(reg, r, match.parentIds),
      r.schema,
      pageSize,
      pageToken,
      skip,
      filter,
      orderBy,
      visibility,
    ));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('invalid filter') || msg.includes('invalid order_by')) {
      return errorResponse(400, msg);
    }
    return errorResponse(500, `database error: ${msg}`);
  }

  const resp: Record<string, unknown> = {
    results: results.map((sr) => storedToMap(reg, r, sr)),
  };
  if (nextPageToken !== '') resp.next_page_token = nextPageToken;
  return jsonResponse(resp);
}

export async function handleUpdate(
  reg: Registry,
  match: RouteMatch,
  req: Request,
): Promise<Response> {
  const r = match.resource;
  const path = buildResourcePath(r, match.parentIds, match.id);

  const existing = getResource(reg.db, r.plural, path, r.schema);
  if (!existing) return errorResponse(404, `resource "${path}" not found`);

  // Snapshot the pre-state for the sync's `previous`, before the patch mutates
  // `existing.fields`. Only materialized when a dispatcher is wired.
  const preState = reg.syncDispatcher ? storedToMap(reg, r, existing) : null;

  const { fields: patch, uploaded } = await readCreateOrApplyBody(req, r, reg, path);
  preparePayload(r, patch, uploaded);

  // Create-only fields are refused, not dropped: a caller told "no" can correct
  // itself, one whose key vanished silently cannot. See `immutableFieldsIn`.
  const frozen = immutableFieldsIn(r.schema, patch);
  if (frozen.length) return errorResponse(400, immutableFieldsError(frozen));

  // RFC 7396 merge patch onto existing fields (AEP-134 HTTP semantics).
  applyMergePatch(r.schema, existing.fields, patch);
  const now = nowRFC3339();
  existing.update_time = now;

  updateResource(reg.db, r.plural, path, existing.fields, now, r.schema);
  const updated = storedToMap(reg, r, existing);
  // Post-commit mirror (fire-and-forget).
  reg.syncDispatcher?.dispatch({
    event: 'update',
    resource: r.singular,
    recordId: match.id,
    record: updated,
    previous: preState,
  });
  return jsonResponse(updated);
}

export async function handleApply(
  reg: Registry,
  match: RouteMatch,
  req: Request,
  caller: User | null = null,
): Promise<Response> {
  const r = match.resource;
  const path = buildResourcePath(r, match.parentIds, match.id);

  const { fields, uploaded } = await readCreateOrApplyBody(req, r, reg, path);
  preparePayload(r, fields, uploaded);

  const now = nowRFC3339();
  const existing = getResource(reg.db, r.plural, path, r.schema);

  if (existing) {
    // AEP-137: Apply must reject a request that omits a required field (400),
    // and must not modify fields the request leaves out — so validate required
    // against the request itself (before any defaults) and merge the request
    // onto the stored fields rather than replacing them wholesale.
    const requiredErr = validateRequiredWithFiles(r.schema, fields, r.fileFields, uploaded);
    if (requiredErr) throw new HttpError(400, requiredErr);

    // Only on the update branch: an apply onto a path with no record is a
    // create, and create is the one write that may set an immutable field.
    const frozen = immutableFieldsIn(r.schema, fields);
    if (frozen.length) throw new HttpError(400, immutableFieldsError(frozen));

    // Snapshot the pre-state before the merge mutates `existing.fields`.
    const preState = reg.syncDispatcher ? storedToMap(reg, r, existing) : null;
    applyMergePatch(r.schema, existing.fields, fields);
    existing.update_time = now;
    updateResource(reg.db, r.plural, path, existing.fields, now, r.schema);
    const updated = storedToMap(reg, r, existing);
    // Post-commit mirror (fire-and-forget) — an apply onto an existing record
    // is an update.
    reg.syncDispatcher?.dispatch({
      event: 'update',
      resource: r.singular,
      recordId: match.id,
      record: updated,
      previous: preState,
    });
    return jsonResponse(updated);
  }

  // Apply that creates a new resource: fill defaults, then validate required.
  applyDefaults(r.schema, fields);
  applyDynamicDefaults(reg, r.schema, fields);
  const requiredErr = validateRequiredWithFiles(r.schema, fields, r.fileFields, uploaded);
  if (requiredErr) throw new HttpError(400, requiredErr);

  const stored: StoredResource = {
    id: match.id,
    path,
    create_time: now,
    update_time: now,
    fields,
  };
  insertResource(reg.db, r.plural, stored, directParentIds(reg, r, match.parentIds), r.schema, ownerFor(caller));
  const created = storedToMap(reg, r, stored);
  // Post-commit mirror (fire-and-forget) — an apply that creates is a create.
  reg.syncDispatcher?.dispatch({
    event: 'create',
    resource: r.singular,
    recordId: match.id,
    record: created,
    previous: null,
  });
  return jsonResponse(created, 201);
}

/** The FK column naming a child row's direct parent (e.g. `credit_card_id`). */
function parentFkColumn(parentSingular: string): string {
  return `${parentSingular.replaceAll('-', '_')}_id`;
}

/** True if the resource has at least one direct child row of any child type. */
function hasChildRows(reg: Registry, r: RegisteredResource, id: string): boolean {
  const fkCol = parentFkColumn(r.singular);
  for (const child of reg.children(r.singular)) {
    const { results } = listResources(
      reg.db,
      child.plural,
      { [fkCol]: id },
      child.schema,
      1,
      '',
      0,
      '',
    );
    if (results.length > 0) return true;
  }
  return false;
}

/**
 * Recursively delete a resource row and its entire descendant subtree. DB
 * rows are removed here (call inside a transaction); paths of rows that
 * declare file fields are collected into `filePaths` for best-effort on-disk
 * cleanup after the transaction commits.
 */
function deleteSubtree(
  reg: Registry,
  r: RegisteredResource,
  path: string,
  id: string,
  filePaths: string[],
): void {
  const fkCol = parentFkColumn(r.singular);
  for (const child of reg.children(r.singular)) {
    let token = '';
    for (;;) {
      const { results, nextPageToken } = listResources(
        reg.db,
        child.plural,
        { [fkCol]: id },
        child.schema,
        1000,
        token,
        0,
        '',
      );
      for (const row of results) {
        deleteSubtree(reg, child, row.path, row.id, filePaths);
      }
      if (nextPageToken === '') break;
      token = nextPageToken;
    }
  }
  deleteResource(reg.db, r.plural, path);
  if (r.fileFields.size > 0) filePaths.push(path);
}

/**
 * Apply the `set-null` and `cascade` reference behaviors for a record being
 * deleted (`restrict` is handled up front by {@link checkReferenceRestrict}).
 * Runs inside the delete transaction so referrer rewrites and the delete commit
 * together. Cascade recurses so a chain of cascades resolves; `restrict` is
 * skipped here (its matches were already proven empty before the transaction).
 */
function applyReferenceCleanup(
  reg: Registry,
  singular: string,
  target: ReferenceTarget,
  filePaths: string[],
): void {
  const now = nowRFC3339();
  for (const ref of findReferrers(reg, singular)) {
    if (ref.onDelete === 'restrict') continue;
    for (const row of collectReferrers(reg, ref, target)) {
      if (ref.onDelete === 'set-null') {
        row.fields[ref.field] = ref.isArray
          ? (row.fields[ref.field] as unknown[]).filter((v) => !isReferenceTo(v, target))
          : null;
        updateResource(reg.db, ref.resource.plural, row.path, row.fields, now, ref.resource.schema);
      } else if (ref.onDelete === 'cascade') {
        // Resolve references pointing at the row we're about to delete, then
        // remove it and its child subtree.
        applyReferenceCleanup(reg, ref.resource.singular, { id: row.id, path: row.path }, filePaths);
        deleteSubtree(reg, ref.resource, row.path, row.id, filePaths);
      }
    }
  }
}

/**
 * AEP-135 delete. A `?force=true` query param cascades: the resource and its
 * entire child subtree are removed. Without it, deleting a resource that
 * still has children fails with FAILED_PRECONDITION (409) rather than
 * orphaning them.
 *
 * Independently of `force`, deleting a record that other records reference with
 * `onDelete: restrict` fails with 409; `set-null`/`cascade` referrers are
 * resolved inside the transaction (see {@link applyReferenceCleanup}).
 */
export function handleDelete(reg: Registry, match: RouteMatch, req: Request): Response {
  const r = match.resource;
  const path = buildResourcePath(r, match.parentIds, match.id);

  const existing = getResource(reg.db, r.plural, path, r.schema);
  if (!existing) return errorResponse(404, `resource "${path}" not found`);

  const force = new URL(req.url).searchParams.get('force') === 'true';
  if (!force && hasChildRows(reg, r, match.id)) {
    return errorResponse(
      409,
      `resource "${path}" has child resources; pass force=true to delete it and its children`,
    );
  }

  const target = { id: match.id, path };
  const restrictErr = checkReferenceRestrict(reg, r.singular, target);
  if (restrictErr) return errorResponse(409, `resource "${path}": ${restrictErr}`);

  // Snapshot the record before it (and its subtree) is removed, for the sync's
  // `previous`. Only materialized when a dispatcher is wired.
  const preState = reg.syncDispatcher ? storedToMap(reg, r, existing) : null;

  const filePaths: string[] = [];
  reg.db.transaction(() => {
    applyReferenceCleanup(reg, r.singular, target, filePaths);
    deleteSubtree(reg, r, path, match.id, filePaths);
  })();

  for (const fp of filePaths) {
    try {
      deleteAllFileFields(reg.filesDir, fp);
    } catch {
      // best-effort cleanup
    }
  }
  // Post-commit mirror (fire-and-forget) — `record` is null on delete.
  reg.syncDispatcher?.dispatch({
    event: 'delete',
    resource: r.singular,
    recordId: match.id,
    record: null,
    previous: preState,
  });
  return new Response(null, { status: 204 });
}

export function handleSingletonGet(reg: Registry, match: RouteMatch): Response {
  const r = match.resource;
  const path = buildSingletonPath(reg, r, match.parentIds);

  let stored = getResource(reg.db, r.plural, path, r.schema);
  if (!stored) {
    // Implicit creation: a singleton always exists.
    const now = nowRFC3339();
    stored = {
      id: singletonId(r, match.parentIds),
      path,
      create_time: now,
      update_time: now,
      fields: {},
    };
    // No owner: a singleton is one household-wide row, so per-user ownership
    // (access model 'owner') doesn't apply to it — `_owner` stays null. If a
    // singleton ever opts into owner-model access, this is the gap to close
    // (thread `caller` through and pass `ownerFor(caller)` like handleCreate).
    insertResource(reg.db, r.plural, stored, directParentIds(reg, r, match.parentIds), r.schema);
  }
  return jsonResponse(singletonToMap(r, stored));
}

export async function handleSingletonUpdate(
  reg: Registry,
  match: RouteMatch,
  req: Request,
): Promise<Response> {
  const r = match.resource;
  const path = buildSingletonPath(reg, r, match.parentIds);

  let patch: Record<string, unknown>;
  try {
    patch = await req.json();
  } catch {
    return errorResponse(400, 'invalid JSON');
  }

  for (const std of STANDARD_FIELDS) delete patch[std];
  stripReadOnlyFields(r.schema, patch);

  const typeErr = validateTypes(r.schema, patch);
  if (typeErr) return errorResponse(400, typeErr);
  const enumErr = validateEnums(r.enums, patch);
  if (enumErr) return errorResponse(400, enumErr);

  const existing = getResource(reg.db, r.plural, path, r.schema);
  const now = nowRFC3339();

  if (!existing) {
    const fields: Record<string, unknown> = {};
    applyMergePatch(r.schema, fields, patch);
    const stored: StoredResource = {
      id: singletonId(r, match.parentIds),
      path,
      create_time: now,
      update_time: now,
      fields,
    };
    // Ownerless by design — see handleSingletonGet: a singleton is household-
    // wide, so owner-model access doesn't apply and `_owner` stays null.
    insertResource(reg.db, r.plural, stored, directParentIds(reg, r, match.parentIds), r.schema);
    return jsonResponse(singletonToMap(r, stored));
  }

  const preState = reg.syncDispatcher ? singletonToMap(r, existing) : null;
  applyMergePatch(r.schema, existing.fields, patch);
  existing.update_time = now;
  updateResource(reg.db, r.plural, path, existing.fields, now, r.schema);
  const updated = singletonToMap(r, existing);
  // Post-commit mirror (fire-and-forget). A singleton has no `id` field; key it
  // by its stable single-row id.
  reg.syncDispatcher?.dispatch({
    event: 'update',
    resource: r.singular,
    recordId: singletonId(r, match.parentIds),
    record: updated,
    previous: preState,
  });
  return jsonResponse(updated);
}

/** The auto-registered `POST /{plural}/{id}:download` for file-field resources. */
export async function handleDownload(
  reg: Registry,
  match: RouteMatch,
  req: Request,
): Promise<Response> {
  const r = match.resource;
  let payload: { field?: string };
  try {
    payload = await req.json();
  } catch (err) {
    return errorResponse(400, `invalid JSON: ${err instanceof Error ? err.message : err}`);
  }
  const field = payload.field;
  if (!field) return errorResponse(400, 'field is required');
  if (!r.fileFields.has(field)) {
    return errorResponse(400, `field "${field}" is not a file field`);
  }

  const path = buildResourcePath(r, match.parentIds, match.id);
  const stored = getResource(reg.db, r.plural, path, r.schema);
  if (!stored) return errorResponse(404, `resource "${path}" not found`);

  let diskPath: string;
  try {
    diskPath = filePath(reg.filesDir, path, field);
  } catch (err) {
    return errorResponse(400, err instanceof Error ? err.message : String(err));
  }
  if (!existsSync(diskPath)) {
    return errorResponse(404, `file field "${field}" has no content`);
  }

  const headers = {
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': `inline; filename="${field}"`,
  };

  // The DB marker is authoritative: encrypted content is buffered + decrypted
  // (GCM needs the whole buffer to verify), plaintext is streamed as before.
  if (stored.fields[field] === FILE_MARKER_ENCRYPTED) {
    try {
      const plaintext = decryptBytes(await readFile(diskPath), fileKeyId(path, field));
      return new Response(new Uint8Array(plaintext), { headers });
    } catch (err) {
      if (err instanceof MissingMasterKeyError || err instanceof DecryptError) {
        return errorResponse(500, `cannot decrypt file field "${field}": ${err.message}`);
      }
      throw err;
    }
  }

  // Legacy plaintext. Guard against a marker/format mismatch leaking ciphertext.
  if (await fileLooksEncrypted(diskPath)) {
    return errorResponse(500, `file field "${field}" is encrypted but not marked; refusing to serve`);
  }
  return new Response(openFileStream(diskPath), { headers });
}
