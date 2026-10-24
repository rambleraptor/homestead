/**
 * On-disk storage for resource file fields — port of pkg/filestore.
 * Layout mirrors the resource path: {root}/{resource_path}/{field_name},
 * e.g. data/files/gift-cards/abc123/front_image.
 */

import { createReadStream, existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { open, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { encryptBytes, encryptionEnabled, isEncryptedContainer } from './crypto';

/** The DB column value marking that a file field has on-disk content. */
export const FILE_FIELD_SENTINEL = '1';

/**
 * Stable key id for a file field's encryption KEK. The resource path is
 * immutable for a resource's lifetime (ids and parents never change), so this
 * derives the same KEK on write and on read.
 */
export function fileKeyId(resourcePath: string, field: string): string {
  return `${resourcePath}/${field}`;
}

function sanitizeSegment(s: string): void {
  if (s === '' || s === '.' || s === '..' || s.includes('/') || s.includes('\\')) {
    throw new Error(`invalid path segment ${JSON.stringify(s)}`);
  }
}

/** Absolute on-disk path for a field; validates every component. */
export function filePath(root: string, resourcePath: string, field: string): string {
  if (!root) throw new Error('filestore root is empty');
  sanitizeSegment(field);
  const segments = resourcePath.split('/');
  for (const seg of segments) sanitizeSegment(seg);
  return join(root, ...segments, field);
}

export async function writeFileField(
  root: string,
  resourcePath: string,
  field: string,
  content: Blob,
): Promise<void> {
  const p = filePath(root, resourcePath, field);
  mkdirSync(dirname(p), { recursive: true });
  let bytes: Uint8Array = new Uint8Array(await content.arrayBuffer());
  if (encryptionEnabled()) {
    bytes = encryptBytes(bytes, fileKeyId(resourcePath, field));
  }
  await writeFile(p, bytes);
}

/** A web ReadableStream over a disk file, for streaming Response bodies. */
export function openFileStream(path: string): ReadableStream {
  return Readable.toWeb(createReadStream(path)) as unknown as ReadableStream;
}

/**
 * Cheap head-sniff: does this file start with the encrypted-container magic?
 * Used to catch a marker/format mismatch without reading the whole file.
 */
export async function fileLooksEncrypted(path: string): Promise<boolean> {
  const fh = await open(path, 'r');
  try {
    const buf = Buffer.alloc(16);
    const { bytesRead } = await fh.read(buf, 0, 16, 0);
    return isEncryptedContainer(buf.subarray(0, bytesRead));
  } finally {
    await fh.close();
  }
}

export function fileFieldExists(root: string, resourcePath: string, field: string): boolean {
  try {
    return existsSync(filePath(root, resourcePath, field));
  } catch {
    return false;
  }
}

export function fileFieldSize(root: string, resourcePath: string, field: string): number {
  return statSync(filePath(root, resourcePath, field)).size;
}

/** Remove every stored file for a resource (best-effort). */
export function deleteAllFileFields(root: string, resourcePath: string): void {
  if (!root) return;
  const segments = resourcePath.split('/');
  for (const seg of segments) sanitizeSegment(seg);
  const dir = join(root, ...segments);
  if (!existsSync(dir)) return;
  rmSync(dir, { recursive: true, force: true });
}

/**
 * Files below a record's top level (in a list, inside an object) are stored by
 * id under this directory of the record: `{record path}/_files/{id}`. Plurals
 * and field names can't start with an underscore, so it never collides with a
 * child collection or a top-level file field.
 */
const STORED_FILES_DIR = '_files';

/** Encryption key id for a file stored by id; stable for the record's lifetime. */
export function storedFileKeyId(resourcePath: string, id: string): string {
  return `${resourcePath}/${STORED_FILES_DIR}/${id}`;
}

export function storedFilePath(root: string, resourcePath: string, id: string): string {
  return filePath(root, `${resourcePath}/${STORED_FILES_DIR}`, id);
}

/** Write a file stored by id, encrypting it when encryption at rest is on. */
export async function writeStoredFile(
  root: string,
  resourcePath: string,
  id: string,
  bytes: Uint8Array,
  encrypt: boolean,
): Promise<void> {
  const p = storedFilePath(root, resourcePath, id);
  mkdirSync(dirname(p), { recursive: true });
  await writeFile(p, encrypt ? encryptBytes(bytes, storedFileKeyId(resourcePath, id)) : bytes);
}

/** Remove files stored by id (best-effort: a missing file is already gone). */
export function deleteStoredFiles(root: string, resourcePath: string, ids: Iterable<string>): void {
  if (!root) return;
  for (const id of ids) {
    try {
      rmSync(storedFilePath(root, resourcePath, id), { force: true });
    } catch {
      // An id that can't form a path was never written.
    }
  }
}
