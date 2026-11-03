/**
 * The one bulk-import handler.
 *
 * Every resource declaring `bulkImport` shares this handler — it finds its own
 * declaration from `ctx.plural`, so an app contributes formats and (optionally)
 * a saver, never a handler. Registered as an AEP-151 async custom method by
 * `./method.ts`; both the dry-run preview and the real import run as operations.
 *
 * Server-only: reachable from the synthesized method's lazy `load()` under
 * `core/server/`, which the client registry never imports.
 */

import type {
  AsyncCustomMethodValidator,
  CustomMethodContext,
} from '../../resources/types';
import {
  SELECT_ALL_VALID,
  type BulkImportContext,
  type BulkImportDef,
  type BulkImportFile,
  type BulkImportFormat,
  type BulkImportInput,
  type BulkImportPreview,
  type BulkImportRequest,
  type BulkImportResult,
  type BulkImportSaveResult,
  type BulkImportSummary,
  type ParsedItem,
} from '../../resources/bulk-import/types';
import { getAllResourceDefs, getResourceBulkImport } from '../../apps/registry';
import { serverClient } from '../client';
import { isAiConfigured } from '../ai/config';

/**
 * Cap on the decoded input. Bulk import inherits the async dispatcher's
 * buffer-the-whole-body approach, and a parsed archive is held in memory for
 * the operation's lifetime, so the ceiling is deliberate rather than implied.
 */
const MAX_INPUT_BYTES = 25 * 1024 * 1024;

/** Base64 inflates ~4/3, so bound the encoded payload before decoding it. */
const MAX_ENCODED_CHARS = Math.ceil((MAX_INPUT_BYTES * 4) / 3) + 1024;

/**
 * Pre-flight (AEP-151): reject a call that can't start before any operation
 * exists, so bad requests are ordinary 4xx rather than a 202 followed by a
 * failed operation.
 */
export const validate: AsyncCustomMethodValidator = async (ctx) => {
  const def = getResourceBulkImport(ctx.plural);
  if (!def) {
    return problem(404, `${ctx.plural} does not support bulk import`);
  }

  let body: BulkImportRequest;
  try {
    body = (await ctx.request.json()) as BulkImportRequest;
  } catch {
    return problem(400, 'Request body must be JSON');
  }

  const format = def.formats.find((f) => f.id === body.format);
  if (!format) {
    return problem(
      400,
      `Unknown format ${JSON.stringify(body.format ?? null)}. Supported: ${def.formats
        .map((f) => f.id)
        .join(', ')}`,
    );
  }

  if (format.requiresAi && !isAiConfigured()) {
    return problem(503, `Format ${format.id} needs AI, which isn't set up on this server`);
  }

  if (format.inputType === 'text') {
    if (typeof body.text !== 'string' || body.text.trim() === '') {
      return problem(400, `Format ${format.id} requires a non-empty "text"`);
    }
    if (body.text.length > MAX_INPUT_BYTES) {
      return problem(413, `Input exceeds the ${MAX_INPUT_BYTES} byte limit`);
    }
  } else {
    const data = asArray(body.data);
    if (data.length === 0) {
      return problem(400, `Format ${format.id} requires base64 "data"`);
    }
    if (data.length > 1 && !format.multiple) {
      return problem(400, `Format ${format.id} accepts only one file`);
    }
    const encoded = data.reduce((sum, d) => sum + d.length, 0);
    if (encoded > MAX_ENCODED_CHARS) {
      return problem(413, `Input exceeds the ${MAX_INPUT_BYTES} byte limit`);
    }
  }

  const selection = body.selectedIndices;
  if (
    selection !== undefined &&
    selection !== SELECT_ALL_VALID &&
    !(
      Array.isArray(selection) &&
      selection.every((i) => Number.isInteger(i) && i >= 0)
    )
  ) {
    return problem(
      400,
      `"selectedIndices" must be ${JSON.stringify(SELECT_ALL_VALID)} or an array of item indices`,
    );
  }

  return undefined;
};

/**
 * Parse, then either report (dry run) or write the selected items. The resolved
 * value becomes the operation's `response`; a throw becomes its `error`.
 */
export default async function bulkImport(
  ctx: CustomMethodContext,
): Promise<BulkImportPreview | BulkImportResult> {
  const def = getResourceBulkImport(ctx.plural);
  // validate() already rejected these; re-checked because the handler runs
  // detached and must not depend on validate having been wired up.
  if (!def) throw new Error(`${ctx.plural} does not support bulk import`);

  const body = (await ctx.request.json()) as BulkImportRequest;
  const format = def.formats.find((f) => f.id === body.format);
  if (!format) throw new Error(`Unknown format ${body.format}`);

  const importCtx: BulkImportContext = { auth: ctx.auth, plural: ctx.plural };
  const items = await parseInput(format, body, importCtx);
  const summary = summarize(items);

  if (body.dryRun) return { dryRun: true, items, summary };

  const selected = resolveSelection(items, body.selectedIndices);
  const save = def.save ? (await def.save()).save : defaultSaver;
  const { created, failed } = await save({ items: selected, ctx: importCtx });
  return { dryRun: false, created, failed, summary };
}

/** Decode the request payload into the parser's input shape and run it. */
async function parseInput(
  format: BulkImportFormat,
  body: BulkImportRequest,
  ctx: BulkImportContext,
): Promise<ParsedItem[]> {
  const input: BulkImportInput =
    format.inputType === 'text'
      ? { text: body.text ?? '' }
      : { files: decodeFiles(body) };

  const { default: parser } = await format.load();
  const items = await parser.parse(input, ctx);

  // Parsers index within their own input; renumber across the whole parse so
  // `selectedIndices` is meaningful when several files were merged into one
  // list. Normalizing here keeps every parser from having to care.
  return items.map((item, index) => ({
    ...item,
    index,
    errors: item.errors ?? [],
    warnings: item.warnings ?? [],
  }));
}

function decodeFiles(body: BulkImportRequest): BulkImportFile[] {
  const data = asArray(body.data);
  return data.map((encoded, i) => ({
    name: body.filenames?.[i] ?? `upload-${i + 1}`,
    bytes: decodeBase64(encoded),
  }));
}

function decodeBase64(encoded: string): Uint8Array {
  // atob is the one decoder available in every runtime this ships on (Bun,
  // Node >= 22, and the test environment) without a node:buffer import.
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Resolve `selectedIndices` against the freshly parsed items.
 *
 * `'*'` (and an omitted selection) means every importable item, which is what
 * makes a one-shot CLI/REST import possible. An explicit index that doesn't
 * exist, or that names an item with errors, is an error rather than a silent
 * skip — a caller that asked for a specific row deserves to hear that it
 * couldn't be imported.
 */
export function resolveSelection(
  items: ParsedItem[],
  selection: BulkImportRequest['selectedIndices'],
): ParsedItem[] {
  const importable = items.filter((item) => item.errors.length === 0);
  if (selection === undefined || selection === SELECT_ALL_VALID) {
    return importable;
  }

  const byIndex = new Map(items.map((item) => [item.index, item]));
  const seen = new Set<number>();
  return selection.flatMap((index) => {
    if (seen.has(index)) return [];
    seen.add(index);
    const item = byIndex.get(index);
    if (!item) throw new Error(`Selected index ${index} is not in the parsed input`);
    if (item.errors.length > 0) {
      throw new Error(
        `Selected index ${index} has errors and cannot be imported: ${item.errors.join('; ')}`,
      );
    }
    return [item];
  });
}

/**
 * Create one record per item in the resource's own collection. Per-item
 * failures are collected rather than thrown so a single rejected row doesn't
 * abandon the rest of the import.
 */
const defaultSaver = async ({
  items,
  ctx,
}: {
  items: ParsedItem[];
  ctx: BulkImportContext;
}): Promise<BulkImportSaveResult> => {
  const stampsCreatedBy = resourceHasCreatedBy(ctx.plural);
  const collection = serverClient(ctx.auth.token).collection(ctx.plural);
  let created = 0;
  const failed: BulkImportSaveResult['failed'] = [];
  for (const item of items) {
    const data = item.data as Record<string, unknown>;
    try {
      await collection.create(
        stampsCreatedBy && data.created_by === undefined
          ? { ...data, created_by: ctx.auth.user.path }
          : data,
      );
      created++;
    } catch (error) {
      failed.push({
        index: item.index,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { created, failed };
};

/**
 * Whether the resource declares a `created_by` field.
 *
 * Imported records are owned by whoever ran the import, matching what every
 * app's own create form does. Driven off the declared schema rather than
 * stamped unconditionally, since a resource without the field would reject the
 * write.
 */
function resourceHasCreatedBy(plural: string): boolean {
  const def = getAllResourceDefs().find((d) => d.plural === plural);
  return def?.fields.created_by !== undefined;
}

function summarize(items: ParsedItem[]): BulkImportSummary {
  const valid = items.filter((item) => item.errors.length === 0).length;
  return { total: items.length, valid, invalid: items.length - valid };
}

function asArray(data: string | string[] | undefined): string[] {
  if (data === undefined) return [];
  return Array.isArray(data) ? data : [data];
}

function problem(status: number, message: string): Response {
  return Response.json({ error: message, message }, { status });
}

export type { BulkImportDef };
