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
  type BulkImportSaver,
  type BulkImportSummary,
  type ParsedItem,
} from '../../resources/bulk-import/types';
import { getAllResourceDefs, getResourceBulkImport } from '../../apps/registry';
import { serverClient } from '../client';
import { isAiConfigured } from '../ai/config';
import { hasPreview, savePreview, takePreview, type PreviewOwner } from './previews';
import { readMethodBody } from '../../resources/custom-methods/body';
import { ProblemError, problemResponse } from '../../resources/problem';

/**
 * Cap on the decoded input. Bulk import inherits the async dispatcher's
 * buffer-the-whole-body approach, and a parsed archive is held in memory for
 * the operation's lifetime, so the ceiling is deliberate rather than implied.
 */
const MAX_INPUT_BYTES = 25 * 1024 * 1024;

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

  const body = await readMethodBody<BulkImportRequest>(ctx.request);

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

  if (body.preview_id !== undefined) {
    if (typeof body.preview_id !== 'string' || body.preview_id === '') {
      return problem(400, '"preview_id" must be the id a validate_only call returned');
    }
    if (body.validate_only) {
      return problem(400, '"preview_id" imports a preview; it cannot be combined with "validate_only"');
    }
    if (!hasPreview(body.preview_id, previewOwner(ctx, format.id))) {
      return problem(410, PREVIEW_GONE);
    }
  } else if (format.inputType === 'text') {
    if (typeof body.text !== 'string' || body.text.trim() === '') {
      return problem(400, `Format ${format.id} requires a non-empty "text"`);
    }
    if (body.text.length > MAX_INPUT_BYTES) {
      return problem(413, `Input exceeds the ${MAX_INPUT_BYTES} byte limit`);
    }
  } else {
    const files = uploadsOf(body);
    if (files === undefined) {
      return problem(400, `Format ${format.id} takes "files": uploaded files, sent as multipart`);
    }
    if (files.length === 0) {
      return problem(400, `Format ${format.id} requires at least one file in "files"`);
    }
    if (files.length > 1 && !format.multiple) {
      return problem(400, `Format ${format.id} accepts only one file`);
    }
    if (files.reduce((sum, f) => sum + f.size, 0) > MAX_INPUT_BYTES) {
      return problem(413, `Input exceeds the ${MAX_INPUT_BYTES} byte limit`);
    }
  }

  const selection = body.selected_indices;
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
      `"selected_indices" must be ${JSON.stringify(SELECT_ALL_VALID)} or an array of item indices`,
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

  const body = await readMethodBody<BulkImportRequest>(ctx.request);
  const format = def.formats.find((f) => f.id === body.format);
  if (!format) throw new Error(`Unknown format ${body.format}`);

  const importCtx: BulkImportContext = {
    auth: ctx.auth,
    plural: ctx.plural,
    format: format.id,
  };
  const owner = previewOwner(ctx, format.id);

  let items: ParsedItem[];
  if (body.preview_id !== undefined) {
    // Checked in validate(), but it can expire (or be taken by a concurrent
    // import) between that check and this run.
    const held = takePreview(body.preview_id, owner);
    if (!held) throw new ProblemError(410, PREVIEW_GONE);
    items = held;
  } else {
    items = await parseInput(format, body, importCtx);
  }
  const summary = summarize(items);

  if (body.validate_only) {
    return { validate_only: true, preview_id: savePreview(owner, items), items, summary };
  }

  const selected = resolveSelection(items, body.selected_indices);
  const save = def.save ? (await def.save()).save : createOnePerItem;
  const { created, failed } = await save({ items: selected, ctx: importCtx });
  return { validate_only: false, created, failed, summary };
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
      : { files: await decodeFiles(body) };

  const { default: parser } = await format.load();
  const items = await parser.parse(input, ctx);

  // Parsers index within their own input; renumber across the whole parse so
  // `selected_indices` is meaningful when several files were merged into one
  // list. Normalizing here keeps every parser from having to care.
  return items.map((item, index) => ({
    ...item,
    index,
    errors: item.errors ?? [],
    warnings: item.warnings ?? [],
  }));
}

/**
 * The `files` the body carries, once `readMethodBody` has resolved their
 * placeholders. Undefined when `files` is missing or holds anything but files
 * (e.g. a JSON request, which can't carry uploads).
 */
function uploadsOf(body: BulkImportRequest): File[] | undefined {
  if (!Array.isArray(body.files)) return undefined;
  return body.files.every((f) => f instanceof File) ? (body.files as File[]) : undefined;
}

async function decodeFiles(body: BulkImportRequest): Promise<BulkImportFile[]> {
  return Promise.all(
    (uploadsOf(body) ?? []).map(async (file, i) => ({
      name: file.name || `upload-${i + 1}`,
      ...(file.type ? { mimeType: file.type } : {}),
      bytes: new Uint8Array(await file.arrayBuffer()),
    })),
  );
}

/**
 * Resolve `selected_indices` against the freshly parsed items.
 *
 * `'*'` (and an omitted selection) means every importable item, which is what
 * makes a one-shot CLI/REST import possible. An explicit index that doesn't
 * exist, or that names an item with errors, is an error rather than a silent
 * skip — a caller that asked for a specific row deserves to hear that it
 * couldn't be imported.
 */
export function resolveSelection(
  items: ParsedItem[],
  selection: BulkImportRequest['selected_indices'],
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
 * The default saver: create one record per item in the resource's own
 * collection. Per-item failures are collected rather than thrown so a single
 * rejected row doesn't abandon the rest of the import. Exported so a custom
 * saver that only needs to follow up on the new records (recipes filing a
 * social import into its cookbook) can reuse it and read `createdIds`.
 */
export const createOnePerItem: BulkImportSaver = async ({ items, ctx }) => {
  const stampsCreatedBy = resourceHasCreatedBy(ctx.plural);
  const collection = serverClient(ctx.auth.token).collection<{ id: string }>(ctx.plural);
  const createdIds: string[] = [];
  const failed: BulkImportSaveResult['failed'] = [];
  for (const item of items) {
    const data = item.data as Record<string, unknown>;
    try {
      const record = await collection.create(
        stampsCreatedBy && data.created_by === undefined
          ? { ...data, created_by: ctx.auth.user.path }
          : data,
      );
      createdIds.push(record.id);
    } catch (error) {
      failed.push({
        index: item.index,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { created: createdIds.length, failed, createdIds };
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

const PREVIEW_GONE =
  'This preview has expired or was already imported. Preview the input again.';

function previewOwner(ctx: CustomMethodContext, format: string): PreviewOwner {
  return { userId: ctx.auth.user.id, plural: ctx.plural, format };
}

function problem(status: number, message: string): Response {
  return problemResponse(status, message);
}

export type { BulkImportDef };
