/**
 * Diagnostics: list the registered AEP-136 custom methods (plural, verb,
 * target, http method) so the CLI / UIs can discover them — they don't
 * appear in the engine's OpenAPI since the gateway owns them.
 *
 * Bulk-import methods are synthesized from resources' `bulkImport`
 * declarations rather than declared under `customMethods`, so they're merged in
 * here too — along with each resource's format metadata, which is what lets the
 * standardized import page render an app's format picker with no per-app code.
 */

import {
  allBulkImportCustomMethods,
  bulkImportFormatInfo,
  BULK_IMPORT_VERB,
} from '@rambleraptor/homestead-core/server/bulk-import/method';
import {
  allBulkExportCustomMethods,
  bulkExportFormatInfo,
  bulkExportOptionInfo,
  BULK_EXPORT_VERB,
} from '@rambleraptor/homestead-core/server/bulk-export/method';
import { getAllResourceCustomMethods } from '../app-registry';

export async function customMethodsResponse(): Promise<Response> {
  const declared = getAllResourceCustomMethods();
  const registered = {
    ...allBulkImportCustomMethods(),
    ...allBulkExportCustomMethods(),
    ...declared,
  };

  const methods = await Promise.all(
    Object.entries(registered).map(async ([key, def]) => {
      const [plural, verb] = key.split(':', 2);
      // Only bulk-import / bulk-export methods carry format metadata, and
      // resolving it loads the (de)serializers — so don't ask for it on every
      // other verb.
      const bulkImport =
        verb === BULK_IMPORT_VERB ? await bulkImportFormatInfo(plural) : undefined;
      const bulkExport =
        verb === BULK_EXPORT_VERB ? await bulkExportFormatInfo(plural) : undefined;
      const exportOptions =
        verb === BULK_EXPORT_VERB ? bulkExportOptionInfo(plural) : undefined;
      return {
        plural,
        verb,
        target: def.target ?? 'collection',
        method: def.method ?? 'POST',
        async: def.async ?? false,
        ...(bulkImport ? { bulk_import: { formats: bulkImport } } : {}),
        ...(bulkExport
          ? { bulk_export: { formats: bulkExport, options: exportOptions ?? [] } }
          : {}),
      };
    }),
  );
  return Response.json({ methods });
}
