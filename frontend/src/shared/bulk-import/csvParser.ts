/**
 * Reusable Bulk Import Framework - CSV Parser
 */

import type { BulkImportSchema, ParsedItem, CSVParseResult } from './types';

/**
 * Generic CSV parser that works with any schema
 */
export function parseCSV<T>(
  csvContent: string,
  schema: BulkImportSchema<T>
): CSVParseResult<T> {
  const lines = csvContent.trim().split('\n');

  if (lines.length === 0) {
    return {
      items: [],
      totalCount: 0,
      validCount: 0,
      invalidCount: 0,
    };
  }

  // Parse header
  const headerLine = lines[0];
  const headers = parseCSVLine(headerLine);

  // Validate required headers are present
  const requiredHeaders = schema.requiredFields.map(f => f.name);
  const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));

  if (missingHeaders.length > 0) {
    throw new Error(`Missing required headers: ${missingHeaders.join(', ')}`);
  }

  // Parse data rows
  const items: ParsedItem<T>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // Skip empty lines

    const values = parseCSVLine(line);
    const rowData: Record<string, string> = {};

    headers.forEach((header, index) => {
      rowData[header] = values[index] || '';
    });

    const parsed = parseRow<T>(rowData, i + 1, schema);
    items.push(parsed);
  }

  const validCount = items.filter(item => item.isValid).length;
  const invalidCount = items.length - validCount;

  return {
    items,
    totalCount: items.length,
    validCount,
    invalidCount,
  };
}

/**
 * Parse a single CSV line handling quoted values
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote mode
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // Field separator
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  // Add last field
  result.push(current.trim());

  return result;
}

/**
 * Parse and validate a single row using the schema
 */
function parseRow<T>(
  row: Record<string, string>,
  rowNumber: number,
  schema: BulkImportSchema<T>
): ParsedItem<T> {
  const errors: string[] = [];
  const data: Record<string, unknown> = {};

  // Process all fields (required and optional)
  const allFields = [...schema.requiredFields, ...schema.optionalFields];

  for (const field of allFields) {
    const rawValue = row[field.name];
    const value = rawValue?.trim() || '';

    // Check if required field is missing
    if (field.required && !value) {
      errors.push(`${field.name} is required`);
      continue;
    }

    // Skip validation for optional empty fields
    if (!field.required && !value) {
      if (field.defaultValue !== undefined) {
        data[field.name] = field.defaultValue;
      }
      continue;
    }

    // Run validator
    try {
      const result = field.validator(value, row);

      if (result.error) {
        errors.push(result.error);
      } else {
        data[field.name] = result.value;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Validation failed';
      errors.push(`${field.name}: ${errorMessage}`);
    }
  }

  return {
    data: data as T,
    rowNumber,
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Download a CSV template file
 */
export function downloadCSVTemplate(
  templateContent: string,
  filename: string
): void {
  const blob = new Blob([templateContent], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
