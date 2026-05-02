import type { BulkImportSchema, ParsedItem, CSVParseResult } from './types';

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

// Handles quoted fields with `""` as an escaped quote.
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());

  return result;
}

function parseRow<T>(
  row: Record<string, string>,
  rowNumber: number,
  schema: BulkImportSchema<T>
): ParsedItem<T> {
  const errors: string[] = [];
  const data: Record<string, unknown> = {};

  for (const field of [...schema.requiredFields, ...schema.optionalFields]) {
    const value = row[field.name]?.trim() || '';

    if (field.required && !value) {
      errors.push(`${field.name} is required`);
      continue;
    }
    if (!field.required && !value) {
      if (field.defaultValue !== undefined) data[field.name] = field.defaultValue;
      continue;
    }

    try {
      const result = field.validator(value, row);
      if (result.error) errors.push(result.error);
      else data[field.name] = result.value;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Validation failed';
      errors.push(`${field.name}: ${message}`);
    }
  }

  const isValid = errors.length === 0;
  const finalData =
    isValid && schema.transformParsed ? schema.transformParsed(data) : (data as T);

  return {
    data: finalData,
    rowNumber,
    isValid,
    errors,
  };
}

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
