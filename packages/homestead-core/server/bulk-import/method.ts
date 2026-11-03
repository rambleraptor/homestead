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
  if (!getResourceBulkImport(plural)) return undefined;
  return {
    target: 'collection',
    method: 'POST',
    async: true,
    title: `Bulk import ${plural}`,
    load: () => import('./handler'),
  };
}

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
  const aiReady = isAiConfigured();
  const offered = def.formats.filter((format) => aiReady || !format.requiresAi);

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
