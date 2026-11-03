/**
 * Custom methods (AEP-136) from `homestead resources`, through the shared
 * client — so the CLI sends exactly what every other client sends: JSON, or
 * multipart with `$upload` parts when there are files, and long-running
 * methods (AEP-151) awaited unless `--no-wait`.
 *
 *   homestead resources grocery process-image --upload image=./list.png
 *   homestead resources document classify <id> --@data body.json
 *   homestead resources recipe bulk-import --format paprika --file a.paprikarecipe --validate-only
 *   homestead resources recipe bulk-import --format paprika --preview-id <id> --select 0,2
 *   homestead resources person bulk-export --format csv --out people.csv
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import {
  bearerToken,
  createHomesteadClient,
  encodeMethodBody,
  type BulkImportFormatInfo,
  type BulkImportPreview,
  type BulkImportSelection,
  type CollectionRef,
  type HomesteadClient,
  type Operation,
} from '@rambleraptor/homestead-client';
import { FlagError, type RawFlags } from './resources-flags.ts';
import type { CustomMethodInfo, ResourceContext } from './resources-model.ts';

/** Flags this module reads; never treated as resource fields. */
export const CUSTOM_METHOD_FLAGS = [
  'upload',
  'no-wait',
  'format',
  'file',
  'text',
  'text-file',
  'validate-only',
  'preview-id',
  'select',
  'filter',
  'out',
  'filename',
];

/** Everything a flag was given, in order — for flags that may repeat (`--file`, `--upload`). */
export type RepeatedFlags = Record<string, string[]>;

/** A client authenticated as the CLI's caller, against the same server. */
export function clientFor(model: ResourceContext): HomesteadClient {
  return createHomesteadClient({
    baseUrl: model.sidecarUrl,
    auth: bearerToken(model.token, model.userId),
  });
}

/** The collection handle for a (possibly nested) collection path like `users/u1/notifications`. */
export function collectionAt(hs: HomesteadClient, path: string): CollectionRef<unknown> {
  const segments = path.split('/').filter(Boolean);
  let ref = hs.collection<unknown>(segments[0]!);
  for (let i = 1; i + 1 < segments.length; i += 2) {
    ref = ref.record(segments[i]!).collection<unknown>(segments[i + 1]!);
  }
  return ref;
}

const MEDIA_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.heic': 'image/heic',
  '.pdf': 'application/pdf',
  '.csv': 'text/csv',
  '.json': 'application/json',
  '.txt': 'text/plain',
  '.zip': 'application/zip',
};

/** A local file as a `File`, named after it, typed by its extension. */
export function readUpload(path: string): File {
  let bytes: Buffer;
  try {
    bytes = readFileSync(path);
  } catch {
    throw new FlagError(`cannot read file: ${path}`);
  }
  const type = MEDIA_TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream';
  return new File([new Uint8Array(bytes)], basename(path), { type });
}

/**
 * `--upload field=path`, repeatable: one file for a field named once, a list
 * for a field named more than once.
 */
export function uploadsFrom(values: string[] = []): Record<string, File | File[]> {
  const byField = new Map<string, File[]>();
  for (const value of values) {
    const eq = value.indexOf('=');
    if (eq <= 0 || eq === value.length - 1) {
      throw new FlagError(`--upload takes field=path (got "${value}")`);
    }
    const field = value.slice(0, eq);
    byField.set(field, [...(byField.get(field) ?? []), readUpload(value.slice(eq + 1))]);
  }
  return Object.fromEntries(
    [...byField].map(([field, files]) => [field, files.length === 1 ? files[0]! : files]),
  );
}

function isOperation(value: unknown): value is Operation {
  return !!value && typeof value === 'object' && typeof (value as Operation).id === 'string' && 'done' in value;
}

/** Await an async method's operation, unless `--no-wait`. */
async function settle(hs: HomesteadClient, method: CustomMethodInfo, result: unknown, flags: RawFlags) {
  if (!method.async || flags['no-wait'] === true || !isOperation(result)) return result;
  return hs.operations.await(result.id!, { timeoutMs: 10 * 60_000 });
}

/** Any custom method: `--@data` body plus `--upload` files; a long-running one awaited. */
export async function runCustomMethod(
  model: ResourceContext,
  method: CustomMethodInfo,
  resourcePath: string,
  body: Record<string, unknown> | undefined,
  flags: RawFlags,
  repeated: RepeatedFlags,
): Promise<unknown> {
  const hs = clientFor(model);
  if (method.bulk_import) return runBulkImport(hs, method, resourcePath, flags, repeated);
  if (method.bulk_export) return runBulkExport(hs, method, resourcePath, flags);

  const full = { ...(body ?? {}), ...uploadsFrom(repeated.upload) };
  const result = await hs.request<unknown>(`/${resourcePath}:${method.verb}`, {
    method: method.method || 'POST',
    body: Object.keys(full).length > 0 || method.method !== 'GET' ? encodeMethodBody(full) : undefined,
    includeUserId: true,
  });
  return settle(hs, method, result, flags);
}

/** `--select 0,2` or `--select '*'`. */
export function parseSelection(value: string | boolean | undefined): BulkImportSelection | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim() === '') {
    throw new FlagError('--select takes row indices (e.g. 0,2) or *');
  }
  if (value.trim() === '*') return '*';
  const indices = value.split(',').map((part) => Number(part.trim()));
  if (indices.some((i) => !Number.isInteger(i) || i < 0)) {
    throw new FlagError(`--select takes row indices (e.g. 0,2) or * (got "${value}")`);
  }
  return indices;
}

function pickFormat(method: CustomMethodInfo, requested: string | boolean | undefined): BulkImportFormatInfo {
  const formats = method.bulk_import?.formats ?? [];
  const ids = formats.map((f) => f.id).join(', ');
  if (typeof requested !== 'string') {
    if (formats.length === 1) return formats[0]!;
    throw new FlagError(`bulk-import needs --format <id> — one of: ${ids}`);
  }
  const format = formats.find((f) => f.id === requested);
  if (!format) throw new FlagError(`unknown format "${requested}" — one of: ${ids}`);
  return format;
}

/** What to tell someone after a preview: how to import it. */
export function previewHint(
  command: string,
  format: string,
  preview: BulkImportPreview<unknown>,
): string {
  const { total, valid } = preview.summary;
  const rows = `${total} row${total === 1 ? '' : 's'}, ${valid} importable`;
  return (
    `${rows}. Import them with:\n` +
    `  ${command} --format ${format} --preview-id ${preview.preview_id} [--select 0,2]\n` +
    '(the preview is kept for an hour, and can be imported once)'
  );
}

async function runBulkImport(
  hs: HomesteadClient,
  method: CustomMethodInfo,
  resourcePath: string,
  flags: RawFlags,
  repeated: RepeatedFlags,
): Promise<unknown> {
  const format = pickFormat(method, flags.format);
  const importer = collectionAt(hs, resourcePath).bulkImport;
  const selected = parseSelection(flags.select);
  const wait = { timeoutMs: 10 * 60_000 };

  if (typeof flags['preview-id'] === 'string') {
    return importer.importPreview({ format: format.id, previewId: flags['preview-id'], selected }, wait);
  }

  const source =
    format.input_type === 'file'
      ? { format: format.id, files: fileInputs(format, repeated.file) }
      : { format: format.id, text: textInput(flags) };

  if (flags['validate-only'] === true) {
    const preview = await importer.preview(source, wait);
    console.error(previewHint(`homestead resources ${method.plural} bulk-import`, format.id, preview));
    return preview;
  }
  return importer.run({ ...source, selected }, wait);
}

function fileInputs(format: BulkImportFormatInfo, paths: string[] = []): File[] {
  if (paths.length === 0) throw new FlagError(`format "${format.id}" takes files: --file <path> (repeatable)`);
  if (paths.length > 1 && !format.multiple) throw new FlagError(`format "${format.id}" takes one file`);
  return paths.map(readUpload);
}

function textInput(flags: RawFlags): string {
  if (typeof flags.text === 'string') return flags.text;
  if (typeof flags['text-file'] === 'string') {
    try {
      return readFileSync(flags['text-file'], 'utf8');
    } catch {
      throw new FlagError(`cannot read --text-file: ${flags['text-file']}`);
    }
  }
  throw new FlagError('this format takes text: --text <text> or --text-file <path>');
}

async function runBulkExport(
  hs: HomesteadClient,
  method: CustomMethodInfo,
  resourcePath: string,
  flags: RawFlags,
): Promise<unknown> {
  const options: Record<string, boolean> = {};
  for (const option of method.bulk_export?.options ?? []) {
    const value = flags[option.id];
    if (value !== undefined) options[option.id] = value === true || value === 'true';
  }
  const blob = await collectionAt(hs, resourcePath).bulkExport({
    format: typeof flags.format === 'string' ? flags.format : undefined,
    filter: typeof flags.filter === 'string' ? flags.filter : undefined,
    filename: typeof flags.filename === 'string' ? flags.filename : undefined,
    options,
  });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (typeof flags.out === 'string') {
    writeFileSync(flags.out, bytes);
    return { written: flags.out, bytes: bytes.length };
  }
  process.stdout.write(bytes);
  return undefined;
}
