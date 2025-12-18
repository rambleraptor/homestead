/**
 * Reusable Bulk Import Framework
 *
 * This library provides a generic bulk import system that can be used
 * across different modules to import data from CSV files.
 *
 * Usage:
 * 1. Define your import schema with field validators
 * 2. Create a custom preview component (optional)
 * 3. Use BulkImportContainer with your configuration
 *
 * Example:
 * ```tsx
 * import { BulkImportContainer, useBulkImport } from '@/shared/bulk-import';
 *
 * export function MyModuleBulkImport() {
 *   const bulkImport = useBulkImport({
 *     collection: Collections.MY_MODULE,
 *     queryKey: queryKeys.module('my-module').list(),
 *   });
 *
 *   return (
 *     <BulkImportContainer
 *       config={{
 *         moduleName: 'My Module',
 *         moduleNamePlural: 'my modules',
 *         backRoute: '/my-module',
 *         schema: myModuleSchema,
 *         onImport: bulkImport.mutateAsync,
 *         isImporting: bulkImport.isPending,
 *       }}
 *     />
 *   );
 * }
 * ```
 */

export { BulkImportContainer } from './BulkImportContainer';
export { DefaultItemPreview } from './DefaultItemPreview';
export { parseCSV, downloadCSVTemplate } from './csvParser';
export { useBulkImport } from './useBulkImport';

export type {
  FieldValidator,
  FieldConfig,
  BulkImportSchema,
  ParsedItem,
  CSVParseResult,
  BulkImportResult,
  BulkImportConfig,
} from './types';
