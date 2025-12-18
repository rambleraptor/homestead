/**
 * Reusable Bulk Import Framework - Type Definitions
 */

/**
 * Validator function for a field value
 */
export type FieldValidator<T = unknown> = (
  value: string,
  row: Record<string, string>
) => {
  value: T;
  error?: string;
};

/**
 * Field configuration for CSV parsing
 */
export interface FieldConfig<T = unknown> {
  /** Field name in CSV header */
  name: string;
  /** Whether field is required */
  required: boolean;
  /** Validator function */
  validator: FieldValidator<T>;
  /** Default value if not provided */
  defaultValue?: T;
  /** Description for documentation */
  description?: string;
}

/**
 * Schema configuration for a module's bulk import
 */
export interface BulkImportSchema<T> {
  /** Required fields */
  requiredFields: FieldConfig[];
  /** Optional fields */
  optionalFields: FieldConfig[];
  /** Generate CSV template content */
  generateTemplate: () => string;
  /** Custom preview component (optional) */
  PreviewComponent?: React.ComponentType<{
    item: ParsedItem<T>;
    isSelected: boolean;
    onToggle: () => void;
  }>;
}

/**
 * Parsed item from CSV with validation results
 */
export interface ParsedItem<T> {
  /** The parsed data matching the module's form type */
  data: T;
  /** Row number in CSV (1-indexed, excluding header) */
  rowNumber: number;
  /** Whether the item passed all validations */
  isValid: boolean;
  /** Validation error messages */
  errors: string[];
}

/**
 * Result from parsing a CSV file
 */
export interface CSVParseResult<T> {
  /** All parsed items */
  items: ParsedItem<T>[];
  /** Total number of items */
  totalCount: number;
  /** Number of valid items */
  validCount: number;
  /** Number of invalid items */
  invalidCount: number;
}

/**
 * Result from bulk import operation
 */
export interface BulkImportResult {
  /** Number of successfully imported items */
  successful: number;
  /** Number of failed imports */
  failed: number;
  /** Specific errors that occurred */
  errors: Array<{ rowNumber: number; error: string }>;
}

/**
 * Configuration for bulk import container
 */
export interface BulkImportConfig<T> {
  /** Module name (e.g., "Events", "Gift Cards") */
  moduleName: string;
  /** Plural module name (e.g., "events", "gift cards") */
  moduleNamePlural: string;
  /** Route to navigate back to */
  backRoute: string;
  /** Import schema configuration */
  schema: BulkImportSchema<T>;
  /** Function to perform the bulk import */
  onImport: (items: ParsedItem<T>[]) => Promise<BulkImportResult>;
  /** Whether import is in progress */
  isImporting?: boolean;
}
