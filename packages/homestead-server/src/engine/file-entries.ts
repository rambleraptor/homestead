/**
 * Files below a record's top level — in a list (`attachments[]`), inside an
 * object (`profile.avatar`), or both (`pages[].scan`).
 *
 * A top-level file field is the original form: one file per field, stored at
 * `{record}/{field}`, its column holding only a marker. Below the top level a
 * field name no longer names one file, so each file gets an id, its bytes live
 * at `{record}/_files/{id}`, and its place in the record's JSON holds a
 * {@link FileEntry} describing it. The schema says where files may sit (a
 * `binary` property marked `x-aepbase-file-field`); this module walks a value
 * alongside its schema to find them.
 *
 * On a write, each file position carries a placeholder:
 *   - `{ "$upload": "<part>" }` — a new file, the multipart part of that name;
 *   - `{ "$file": "<id>" }`     — keep a file this record already holds;
 *   - `null`                    — no file.
 * Anything else is refused, so a client can never write an entry (and so never
 * point a record at bytes it doesn't own). On a read, each entry becomes a
 * {@link FileDescriptor} with a download URL. See
 * `docs/design/nested-files.md`.
 */

import { randomBytes } from 'node:crypto';
import { resolveMediaType } from '@rambleraptor/homestead-core/resources/media-type';
import { HttpError } from './errors';
import type { Schema, SchemaProperty } from './types';

/** What a record stores at a file position. */
export interface FileEntry {
  id: string;
  name: string;
  media_type: string;
  size: number;
  encrypted: boolean;
}

/** What a read returns at a file position. */
export interface FileDescriptor extends FileEntry {
  url: string;
}

/** An uploaded multipart part, read into memory. */
export interface UploadPart {
  name: string;
  bytes: Uint8Array;
  declaredType: string;
}

/** A new file decided on by {@link resolveFilePlaceholders}, waiting to be written. */
export interface PendingFile {
  entry: FileEntry;
  bytes: Uint8Array;
}

/** What a write's placeholders resolved to. */
export interface ResolvedFiles {
  /** New files to write. */
  pending: PendingFile[];
  /** Ids of the record's existing files the write keeps (`$file`). */
  kept: Set<string>;
}

const FILE_MARKER = 'x-aepbase-file-field';

export function isFileProperty(prop: SchemaProperty | undefined): boolean {
  return prop?.[FILE_MARKER] === true;
}

/** Whether a property has a file somewhere below it (not counting itself). */
function holdsFileBelow(prop: SchemaProperty): boolean {
  if (prop.items && (isFileProperty(prop.items) || holdsFileBelow(prop.items))) return true;
  return Object.values(prop.properties ?? {}).some(
    (sub) => isFileProperty(sub) || holdsFileBelow(sub),
  );
}

/**
 * Top-level fields with files below them — the fields this module manages. A
 * top-level field that is itself a file is the original form, handled apart.
 */
export function nestedFileFieldNames(schema: Schema): Set<string> {
  const names = new Set<string>();
  for (const [name, prop] of Object.entries(schema.properties ?? {})) {
    if (!isFileProperty(prop) && holdsFileBelow(prop)) names.add(name);
  }
  return names;
}

/**
 * Rebuild `value` with every file position replaced by `visit`'s result.
 * Values that don't have the schema's shape (validated elsewhere) pass through.
 */
export function mapFilePositions(
  prop: SchemaProperty,
  value: unknown,
  visit: (value: unknown, file: SchemaProperty, path: string) => unknown,
  path: string,
): unknown {
  if (isFileProperty(prop)) return visit(value, prop, path);
  if (value === null || value === undefined) return value;
  if (prop.items && Array.isArray(value)) {
    return value.map((item, i) => mapFilePositions(prop.items!, item, visit, `${path}[${i}]`));
  }
  if (prop.properties && typeof value === 'object' && !Array.isArray(value)) {
    const out: Record<string, unknown> = { ...(value as Record<string, unknown>) };
    for (const [key, sub] of Object.entries(prop.properties)) {
      if (key in out) out[key] = mapFilePositions(sub, out[key], visit, `${path}.${key}`);
    }
    return out;
  }
  return value;
}

/** Every stored entry in a record's managed fields, by id. */
export function storedEntries(
  schema: Schema,
  fieldNames: Iterable<string>,
  fields: Record<string, unknown>,
): Map<string, FileEntry> {
  const found = new Map<string, FileEntry>();
  for (const name of fieldNames) {
    const prop = schema.properties?.[name];
    if (!prop || !(name in fields)) continue;
    mapFilePositions(
      prop,
      fields[name],
      (value) => {
        if (isFileEntry(value)) found.set(value.id, value);
        return value;
      },
      name,
    );
  }
  return found;
}

function isFileEntry(value: unknown): value is FileEntry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === 'string' && typeof v.name === 'string' && typeof v.media_type === 'string';
}

/** A fresh id for a stored file: random, so concurrent writers never collide. */
function newFileId(): string {
  return randomBytes(10).toString('hex');
}

/** The single-key object `{ [key]: string }`, or null. */
function placeholder(value: unknown, key: '$upload' | '$file'): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const keys = Object.keys(v);
  if (keys.length !== 1 || keys[0] !== key) return null;
  return typeof v[key] === 'string' && v[key] !== '' ? (v[key] as string) : null;
}

export interface PlaceholderInput {
  schema: Schema;
  /** The managed fields of this resource ({@link nestedFileFieldNames}). */
  fieldNames: Iterable<string>;
  /** The write's fields; managed ones are rewritten in place. */
  fields: Record<string, unknown>;
  /** Multipart parts not claimed by a top-level file field, by part name. */
  parts: Map<string, UploadPart[]>;
  /** Files this record already holds (empty on create). */
  existing: Map<string, FileEntry>;
  /** Whether new files will be encrypted at rest. */
  encrypt: boolean;
}

/**
 * Turn a write's placeholders into entries. Validates everything before any
 * byte is written: the caller writes {@link PendingFile}s only once this
 * returns. Every part must be used, exactly once.
 */
export function resolveFilePlaceholders(input: PlaceholderInput): ResolvedFiles {
  const { schema, fieldNames, fields, parts, existing, encrypt } = input;
  const pending: PendingFile[] = [];
  const kept = new Set<string>();
  const used = new Set<string>();

  for (const name of fieldNames) {
    const prop = schema.properties?.[name];
    if (!prop || !(name in fields)) continue;
    fields[name] = mapFilePositions(
      prop,
      fields[name],
      (value, _file, path) => {
        if (value === null || value === undefined) return value;
        const upload = placeholder(value, '$upload');
        if (upload !== null) {
          const matches = parts.get(upload);
          if (!matches) throw new HttpError(400, `"${path}" names upload "${upload}", but no file part has that name`);
          if (matches.length > 1) {
            throw new HttpError(400, `"${path}" names upload "${upload}", but ${matches.length} file parts share that name`);
          }
          if (used.has(upload)) throw new HttpError(400, `upload "${upload}" is used at more than one position`);
          used.add(upload);
          const part = matches[0]!;
          const entry: FileEntry = {
            id: newFileId(),
            name: part.name,
            // Named by the bytes where the format is recognizable; see media-type.
            media_type: resolveMediaType(part.bytes, part.declaredType),
            size: part.bytes.length,
            encrypted: encrypt,
          };
          pending.push({ entry, bytes: part.bytes });
          return entry;
        }
        const keep = placeholder(value, '$file');
        if (keep !== null) {
          const entry = existing.get(keep);
          if (!entry) throw new HttpError(400, `"${path}" keeps file "${keep}", which this record doesn't have`);
          kept.add(keep);
          return { ...entry };
        }
        throw new HttpError(
          400,
          `"${path}" holds a file: send {"$upload": "<part name>"} for a new one, ` +
            `{"$file": "<id>"} to keep one, or null`,
        );
      },
      name,
    );
  }

  for (const partName of parts.keys()) {
    if (!used.has(partName)) {
      throw new HttpError(400, `file part "${partName}" isn't used by any field`);
    }
  }
  return { pending, kept };
}

/**
 * Repeated parts named after a top-level list of files fill that list, in
 * order — the short form for `attachments: [f1, f2]` that needs no JSON. A
 * field also given in the JSON keeps the JSON (its placeholders name parts).
 */
export function expandListShorthand(
  schema: Schema,
  fieldNames: Iterable<string>,
  fields: Record<string, unknown>,
  parts: Map<string, UploadPart[]>,
): void {
  for (const name of fieldNames) {
    const prop = schema.properties?.[name];
    const files = parts.get(name);
    if (!prop || !files || name in fields) continue;
    if (!prop.items || !isFileProperty(prop.items)) continue;
    parts.delete(name);
    fields[name] = files.map((part, i) => {
      const key = `${name}[${i}]`;
      parts.set(key, [part]);
      return { $upload: key };
    });
  }
}

/** A record's managed fields with entries turned into descriptors, for a read. */
export function withFileDescriptors(
  schema: Schema,
  fieldNames: Iterable<string>,
  out: Record<string, unknown>,
  downloadUrl: (id: string) => string,
): void {
  for (const name of fieldNames) {
    const prop = schema.properties?.[name];
    if (!prop || !(name in out)) continue;
    out[name] = mapFilePositions(
      prop,
      out[name],
      (value) => {
        if (!isFileEntry(value)) return value === undefined ? value : null;
        const descriptor: FileDescriptor = {
          id: value.id,
          url: downloadUrl(value.id),
          name: value.name,
          media_type: value.media_type,
          size: value.size,
          encrypted: value.encrypted === true,
        };
        return descriptor;
      },
      name,
    );
  }
}
