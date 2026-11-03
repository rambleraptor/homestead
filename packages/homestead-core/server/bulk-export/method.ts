/**
 * Synthesizes the `<plural>:bulk-export` custom method from a resource's
 * `bulkExport` declaration — the mirror of `../bulk-import/method.ts`.
 *
 * Declaring `bulkExport` *is* the registration — an app writes no entry under
 * `customMethods` and no handler. Because the synthesized method dispatches like
 * any other AEP-136 method, bulk export inherits auth, the `/api/aep` gateway,
 * `GET /api/custom-methods` discovery, and `homestead resources` CLI support for
 * free.
 *
 * Unlike bulk import this is a **synchronous GET** method: a download is a read
 * that streams a file straight back, so it needs no operation, no request body,
 * and no progress polling.
 *
 * This lives under `core/server/` on purpose. The synthesis has to name the
 * handler in a `load()` thunk, and the handler imports the server aepbase
 * wrapper; putting it in the shared registry would drag that into the client
 * bundle, which the `methods/*` stub plugin only rescues for app-declared
 * handlers.
 */

import type { ResourceCustomMethod } from '../../resources/types';
import {
  getAllResourceBulkExports,
  getResourceBulkExport,
} from '../../apps/registry';
import type {
  BulkExportFormatInfo,
  BulkExportOption,
} from '../../resources/bulk-export/types';

/** The verb every bulk-export-capable resource answers on. */
export const BULK_EXPORT_VERB = 'bulk-export';

/**
 * The synthesized method for `plural`, or undefined when the resource doesn't
 * opt in. A read-only GET that returns the file directly (not an operation).
 */
export function bulkExportCustomMethod(
  plural: string,
  verb: string,
): ResourceCustomMethod | undefined {
  if (verb !== BULK_EXPORT_VERB) return undefined;
  const def = getResourceBulkExport(plural);
  if (!def) return undefined;
  const query: NonNullable<ResourceCustomMethod['query']> = {
    format: {
      schema: { type: 'string', enum: def.formats.map((f) => f.id) },
      description: `Output format; defaults to ${def.formats[0]?.id ?? 'the first'}. ${def.formats
        .map((f) => `${f.id}: ${f.label}`)
        .join('; ')}`,
    },
    filter: {
      schema: { type: 'string' },
      description: 'A list filter selecting the rows (e.g. id in ["a", "b"]); all rows when omitted.',
    },
    filename: { schema: { type: 'string' }, description: 'Download filename override.' },
  };
  for (const option of def.options ?? []) {
    query[option.id] = {
      schema: { type: 'boolean', ...(option.default !== undefined ? { default: option.default } : {}) },
      description: option.label,
    };
  }
  return {
    target: 'collection',
    method: 'GET',
    title: `Bulk export ${plural}`,
    description: `Download ${plural} as a file, in one of the declared formats.`,
    query,
    responseMediaTypes: [...new Set(def.formats.map((f) => f.mimeType))],
    load: () => import('./handler'),
  };
}

/**
 * Every synthesized bulk-export method, keyed `${plural}:bulk-export`, for
 * callers that enumerate rather than resolve (the discovery endpoint, the CLI).
 */
export function allBulkExportCustomMethods(): Record<string, ResourceCustomMethod> {
  const out: Record<string, ResourceCustomMethod> = {};
  for (const plural of Object.keys(getAllResourceBulkExports())) {
    const method = bulkExportCustomMethod(plural, BULK_EXPORT_VERB);
    if (method) out[`${plural}:${BULK_EXPORT_VERB}`] = method;
  }
  return out;
}

/**
 * Format metadata for `plural`, with the `load` thunks dropped — this crosses
 * the wire to the UI's format picker, which needs the labels and column docs but
 * must never see server-only code.
 *
 * Loading each serializer to read its `columns` is why this is async. That only
 * ever happens server-side, and ESM caches the import, so it costs one load per
 * format per process.
 */
export async function bulkExportFormatInfo(
  plural: string,
): Promise<BulkExportFormatInfo[] | undefined> {
  const def = getResourceBulkExport(plural);
  if (!def) return undefined;

  return Promise.all(
    def.formats.map(async (format) => ({
      id: format.id,
      label: format.label,
      mime_type: format.mimeType,
      extension: format.extension,
      columns: await loadColumns(format),
    })),
  );
}

/**
 * The export options declared for `plural` (plain data, no module to load), or
 * undefined when the resource doesn't opt into bulk export. Surfaced on the
 * discovery endpoint so the export screen can render the toggles.
 */
export function bulkExportOptionInfo(plural: string): BulkExportOption[] | undefined {
  const def = getResourceBulkExport(plural);
  if (!def) return undefined;
  return def.options ?? [];
}

/** A serializer that won't load shouldn't sink the whole discovery response. */
async function loadColumns(format: {
  id: string;
  load: () => Promise<{ default: { columns?: BulkExportFormatInfo['columns'] } }>;
}) {
  try {
    return (await format.load()).default.columns;
  } catch (error) {
    console.error(`Could not load bulk-export serializer for format ${format.id}:`, error);
    return undefined;
  }
}
