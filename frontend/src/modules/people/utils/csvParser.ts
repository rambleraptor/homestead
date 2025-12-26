import type { PersonFormData, NotificationPreference } from '../types';
import { logger } from '@/core/utils/logger';

export interface ParsedPerson {
  data: PersonFormData;
  rowNumber: number;
  isValid: boolean;
  errors: string[];
}

export interface CSVParseResult {
  people: ParsedPerson[];
  totalCount: number;
  validCount: number;
  invalidCount: number;
}

const REQUIRED_HEADERS = ['name'];

const OPTIONAL_HEADERS = [
  'address',
  'birthday',
  'anniversary',
  'notification_preferences',
];

const ALL_HEADERS = [...REQUIRED_HEADERS, ...OPTIONAL_HEADERS];

/**
 * Parses a CSV string into an array of ParsedPerson objects
 */
export function parsePeopleCSV(csvContent: string): CSVParseResult {
  const lines = csvContent.trim().split('\n');

  if (lines.length === 0) {
    return {
      people: [],
      totalCount: 0,
      validCount: 0,
      invalidCount: 0,
    };
  }

  // Parse header
  const headerLine = lines[0];
  const headers = parseCSVLine(headerLine);

  // Validate headers
  const missingHeaders = REQUIRED_HEADERS.filter(h => !headers.includes(h));
  if (missingHeaders.length > 0) {
    throw new Error(`Missing required headers: ${missingHeaders.join(', ')}`);
  }

  // Parse data rows
  const people: ParsedPerson[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // Skip empty lines

    const values = parseCSVLine(line);
    const rowData: Record<string, string> = {};

    headers.forEach((header, index) => {
      rowData[header] = values[index] || '';
    });

    const parsed = parsePersonRow(rowData, i + 1);
    people.push(parsed);
  }

  const validCount = people.filter(p => p.isValid).length;
  const invalidCount = people.length - validCount;

  return {
    people,
    totalCount: people.length,
    validCount,
    invalidCount,
  };
}

/**
 * Parses a single CSV line handling quoted values
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
 * Parses and validates a single person row
 */
function parsePersonRow(row: Record<string, string>, rowNumber: number): ParsedPerson {
  const errors: string[] = [];

  // Parse name
  const name = row.name?.trim() || '';
  if (!name) {
    errors.push('name is required');
  } else if (name.length > 200) {
    errors.push('name must be 200 characters or less');
  }

  // Parse address (optional) - convert string to address object for backwards compatibility with CSV
  const addressString = row.address?.trim() || undefined;
  const address = addressString
    ? { line1: addressString }
    : undefined;
  if (addressString && addressString.length > 500) {
    errors.push('address must be 500 characters or less');
  }

  // Parse birthday (optional)
  let birthday = row.birthday?.trim() || undefined;
  if (birthday && !isValidDate(birthday)) {
    errors.push('birthday must be in YYYY-MM-DD format');
    birthday = undefined; // Clear invalid date
  }

  // Parse anniversary (optional)
  let anniversary = row.anniversary?.trim() || undefined;
  if (anniversary && !isValidDate(anniversary)) {
    errors.push('anniversary must be in YYYY-MM-DD format');
    anniversary = undefined; // Clear invalid date
  }

  // Parse notification_preferences (optional, defaults to ['day_of'])
  let notificationPreferences: NotificationPreference[] = ['day_of'];
  const notifValue = row.notification_preferences?.trim();
  if (notifValue) {
    try {
      const parsed = notifValue.split(',').map(v => v.trim() as NotificationPreference);
      const validPrefs = ['day_of', 'day_before', 'week_before'];
      const invalidPrefs = parsed.filter(p => !validPrefs.includes(p));

      if (invalidPrefs.length > 0) {
        errors.push(`Invalid notification preferences: ${invalidPrefs.join(', ')}`);
      } else {
        notificationPreferences = parsed;
      }
    } catch (error) {
      logger.error('Failed to parse notification preferences', error, { rowNumber, notifValue });
      errors.push('notification_preferences must be comma-separated values');
    }
  }

  return {
    data: {
      name,
      address,
      birthday,
      anniversary,
      notification_preferences: notificationPreferences,
    },
    rowNumber,
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validates a date string in YYYY-MM-DD format
 */
function isValidDate(dateString: string): boolean {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateString)) {
    return false;
  }

  const date = new Date(dateString);
  const timestamp = date.getTime();

  if (typeof timestamp !== 'number' || Number.isNaN(timestamp)) {
    return false;
  }

  // Ensure the date string matches the ISO string to catch invalid dates like '2024-02-30'
  return date.toISOString().startsWith(dateString);
}

/**
 * Generates a sample CSV template for people
 */
function generatePeopleCSVTemplate(): string {
  const headers = ALL_HEADERS.join(',');
  const example1 = 'John Doe,"123 Main St, Anytown, USA",1990-06-15,,"day_of,week_before"';
  const example2 = 'Jane Smith,"456 Oak Ave, Someplace, USA",,2015-08-20,"day_of"';

  return `${headers}\n${example1}\n${example2}`;
}

/**
 * Downloads a CSV template file for people
 */
export function downloadPeopleCSVTemplate(): void {
  const template = generatePeopleCSVTemplate();
  const blob = new Blob([template], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'people_import_template.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
