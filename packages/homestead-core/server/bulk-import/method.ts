/**
 * Synthesizes the `<plural>:bulk-import` custom method from a resource's
 * `bulkImport` declaration.
 *
 * Declaring `bulkImport` *is* the registration — an app writes no entry under
 * `customMethods` and no handler. Because the synthesized method dispatches
 * like any other AEP-136 method, bulk import inherits auth, the `/api/aep`
 * gateway, `GET /api/custom-methods` discovery, `homestead resources` CLI
 * support, and AEP-151 operations for free.
 *
 * This lives under `core/server/` on purpose. The synthesis has to name the
 * handler in a `load()` thunk, and the handler imports the server aepbase
 * wrapper; putting it in the shared registry would drag that into the client
 * bundle, which the `methods/*` stub plugin only rescues for app-declared
 * handlers.
 */

import type { ResourceCustomMethod } from '../../resources/types';
import { isAiConfigured } from '../ai/config';
import { uploadSchema } from '../../resources/custom-methods/schema';
import { getAllResourceBulkImports, getResourceBulkImport } from '../../apps/registry';
import type {
  BulkImportDef,
  BulkImportFormatInfo,
} from '../../resources/bulk-import/types';

/** The verb every bulk-import-capable resource answers on. */
export const BULK_IMPORT_VERB = 'bulk-import';

/**
 * The synthesized method for `plural`, or undefined when the resource doesn't
 * opt in. Always async: a preview of a large archive is real work, and running
 * both modes through operations keeps one code path and gives the UI progress
 * plus restart recovery.
 */
export function bulkImportCustomMethod(
  plural: string,
  verb: string,
): ResourceCustomMethod | undefined {
  if (verb !== BULK_IMPORT_VERB) return undefined;
  const def = getResourceBulkImport(plural);
  return def ? bulkImportMethodFrom(plural, def) : undefined;
}

/**
 * The synthesized method for a resource's `bulkImport` declaration — what the
 * gateway dispatches and what `/openapi.json` and the model tools describe.
 */
export function bulkImportMethodFrom(plural: string, def: BulkImportDef): ResourceCustomMethod {
  return {
    target: 'collection',
    method: 'POST',
    async: true,
    title: `Bulk import ${plural}`,
    description:
      `Import ${plural} from a file or pasted text. With validate_only, parses and returns a ` +
      'preview (and its preview_id) without writing; an import names the preview_id to write ' +
      'exactly those rows. Long-running: answers with an operation (AEP-151).',
    request: bulkImportRequestSchema(offeredFormatsOf(def)),
    response: BULK_IMPORT_RESPONSE_SCHEMA,
    // Writing asks first; a preview never does.
    confirm: { unless: 'validate_only' },
    untrustedResult: `${plural} parsed from the import input (pasted text, a web page, a file)`,
    load: () => import('./handler'),
  };
}

/** The formats offered right now: AI-backed ones only while AI is set up. */
function offeredFormats(plural: string): BulkImportDef['formats'] {
  const def = getResourceBulkImport(plural);
  return def ? offeredFormatsOf(def) : [];
}

function offeredFormatsOf(def: BulkImportDef): BulkImportDef['formats'] {
  const aiReady = isAiConfigured();
  return def.formats.filter((format) => aiReady || !format.requiresAi);
}

/** Request schema for a resource's bulk import, its `format` enum from the offered formats. */
export function bulkImportRequestSchema(formats: BulkImportDef['formats']): Record<string, unknown> {
  const formatDocs = formats
    .map((f) => `${f.id} (${f.inputType}${f.multiple ? ', several files' : ''}): ${f.description ?? f.label}`)
    .join('; ');
  return {
    type: 'object',
    properties: {
      format: {
        type: 'string',
        enum: formats.map((f) => f.id),
        description: `Input format. ${formatDocs}`,
      },
      text: { type: 'string', description: 'The input, for text formats.' },
      files: {
        type: 'array',
        items: uploadSchema('An input file, for file formats.'),
        description: 'The input files, for file formats (one unless the format takes several).',
      },
      validate_only: {
        type: 'boolean',
        description: 'Parse and return a preview without writing anything (AEP-163).',
      },
      preview_id: {
        type: 'string',
        description:
          'Import the rows of this earlier validate_only preview instead of parsing again. ' +
          'Same caller and format; single-use; expires after an hour (410).',
      },
      selected_indices: {
        description: 'Which preview rows to import: item indices, or "*" for every importable row (the default).',
        oneOf: [
          { type: 'array', items: { type: 'integer', minimum: 0 } },
          { type: 'string', enum: ['*'] },
        ],
      },
    },
    required: ['format'],
  };
}

const PARSED_ITEM_SCHEMA = {
  type: 'object',
  properties: {
    index: { type: 'integer', description: 'Position in the parse; what selected_indices names.' },
    data: { type: 'object', description: 'The record that would be created.' },
    errors: { type: 'array', items: { type: 'string' }, description: 'Why it cannot be imported.' },
    warnings: { type: 'array', items: { type: 'string' } },
    label: { type: 'string', description: 'Display label for the row.' },
  },
  required: ['index', 'data', 'errors', 'warnings'],
};

const SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    total: { type: 'integer' },
    valid: { type: 'integer' },
    invalid: { type: 'integer' },
  },
  required: ['total', 'valid', 'invalid'],
};

/** The operation's `response`: a preview (validate_only) or an import result. */
export const BULK_IMPORT_RESPONSE_SCHEMA: Record<string, unknown> = {
  oneOf: [
    {
      type: 'object',
      title: 'BulkImportPreview',
      properties: {
        validate_only: { const: true },
        preview_id: { type: 'string' },
        items: { type: 'array', items: PARSED_ITEM_SCHEMA },
        summary: SUMMARY_SCHEMA,
      },
      required: ['validate_only', 'preview_id', 'items', 'summary'],
    },
    {
      type: 'object',
      title: 'BulkImportResult',
      properties: {
        validate_only: { const: false },
        created: { type: 'integer' },
        failed: {
          type: 'array',
          items: {
            type: 'object',
            properties: { index: { type: 'integer' }, error: { type: 'string' } },
            required: ['index', 'error'],
          },
        },
        summary: SUMMARY_SCHEMA,
      },
      required: ['validate_only', 'created', 'failed', 'summary'],
    },
  ],
};

/**
 * Every synthesized bulk-import method, keyed `${plural}:bulk-import`, for
 * callers that enumerate rather than resolve (the discovery endpoint, the CLI).
 */
export function allBulkImportCustomMethods(): Record<string, ResourceCustomMethod> {
  const out: Record<string, ResourceCustomMethod> = {};
  for (const plural of Object.keys(getAllResourceBulkImports())) {
    const method = bulkImportCustomMethod(plural, BULK_IMPORT_VERB);
    if (method) out[`${plural}:${BULK_IMPORT_VERB}`] = method;
  }
  return out;
}

/**
 * Format metadata for `plural`, with the `load` thunks dropped — this crosses
 * the wire to the UI's format picker, which needs the labels, `accept` filters,
 * and column docs but must never see server-only code.
 *
 * Loading each parser to read its `columns` is why this is async. That only
 * ever happens server-side, and ESM caches the import, so it costs one load per
 * format per process.
 */
export async function bulkImportFormatInfo(
  plural: string,
): Promise<BulkImportFormatInfo[] | undefined> {
  const def = getResourceBulkImport(plural);
  if (!def) return undefined;

  // Read per call, not at boot: an AI key stored in Credentials takes effect
  // without a restart, so the list follows it.
  const offered = offeredFormats(plural);

  return Promise.all(
    offered.map(async (format) => ({
      id: format.id,
      label: format.label,
      input_type: format.inputType,
      accept: format.accept,
      multiple: format.multiple ?? false,
      has_template: format.hasTemplate ?? false,
      ...(format.description ? { description: format.description } : {}),
      columns: await loadColumns(format),
    })),
  );
}

/** A parser that won't load shouldn't sink the whole discovery response. */
async function loadColumns(format: { id: string; load: BulkImportFormatLoad }) {
  try {
    return (await format.load()).default.columns;
  } catch (error) {
    console.error(`Could not load bulk-import parser for format ${format.id}:`, error);
    return undefined;
  }
}

type BulkImportFormatLoad = BulkImportDef['formats'][number]['load'];
