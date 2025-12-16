import type { EventFormData, EventType, NotificationPreference } from '../types';
import { logger } from '@/core/utils/logger';

export interface ParsedEvent extends EventFormData {
  rowNumber: number;
  isValid: boolean;
  errors: string[];
}

export interface CSVParseResult {
  events: ParsedEvent[];
  totalCount: number;
  validCount: number;
  invalidCount: number;
}

const REQUIRED_HEADERS = [
  'event_type',
  'title',
  'people_involved',
  'event_date',
];

const OPTIONAL_HEADERS = [
  'recurring_yearly',
  'details',
  'notification_preferences',
];

const ALL_HEADERS = [...REQUIRED_HEADERS, ...OPTIONAL_HEADERS];

/**
 * Parses a CSV string into an array of ParsedEvent objects
 */
export function parseEventsCSV(csvContent: string): CSVParseResult {
  const lines = csvContent.trim().split('\n');

  if (lines.length === 0) {
    return {
      events: [],
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
  const events: ParsedEvent[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // Skip empty lines

    const values = parseCSVLine(line);
    const rowData: Record<string, string> = {};

    headers.forEach((header, index) => {
      rowData[header] = values[index] || '';
    });

    const parsed = parseEventRow(rowData, i + 1);
    events.push(parsed);
  }

  const validCount = events.filter(e => e.isValid).length;
  const invalidCount = events.length - validCount;

  return {
    events,
    totalCount: events.length,
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
 * Parses and validates a single event row
 */
function parseEventRow(row: Record<string, string>, rowNumber: number): ParsedEvent {
  const errors: string[] = [];

  // Parse event_type
  const eventType = row.event_type?.toLowerCase().trim() as EventType;
  if (!eventType) {
    errors.push('event_type is required');
  } else if (eventType !== 'birthday' && eventType !== 'anniversary') {
    errors.push('event_type must be "birthday" or "anniversary"');
  }

  // Parse title
  const title = row.title?.trim() || '';
  if (!title) {
    errors.push('title is required');
  } else if (title.length > 200) {
    errors.push('title must be 200 characters or less');
  }

  // Parse people_involved
  const peopleInvolved = row.people_involved?.trim() || '';
  if (!peopleInvolved) {
    errors.push('people_involved is required');
  } else if (peopleInvolved.length > 500) {
    errors.push('people_involved must be 500 characters or less');
  }

  // Parse event_date
  const eventDate = row.event_date?.trim() || '';
  if (!eventDate) {
    errors.push('event_date is required');
  } else if (!isValidDate(eventDate)) {
    errors.push('event_date must be in YYYY-MM-DD format');
  }

  // Parse recurring_yearly (optional, defaults to true)
  let recurringYearly = true;
  const recurringValue = row.recurring_yearly?.toLowerCase().trim();
  if (recurringValue) {
    if (recurringValue === 'false' || recurringValue === 'no' || recurringValue === '0') {
      recurringYearly = false;
    } else if (recurringValue === 'true' || recurringValue === 'yes' || recurringValue === '1') {
      recurringYearly = true;
    } else {
      errors.push('recurring_yearly must be "true", "false", "yes", "no", "1", or "0"');
    }
  }

  // Parse details (optional)
  const details = row.details?.trim() || '';
  if (details && details.length > 2000) {
    errors.push('details must be 2000 characters or less');
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
    event_type: eventType,
    title,
    people_involved: peopleInvolved,
    event_date: eventDate,
    recurring_yearly: recurringYearly,
    details: details || undefined,
    notification_preferences: notificationPreferences,
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

  return date.toISOString().startsWith(dateString);
}

/**
 * Generates a sample CSV template
 */
export function generateCSVTemplate(): string {
  const headers = ALL_HEADERS.join(',');
  const example1 = 'birthday,John\'s Birthday,John Doe,2024-06-15,true,"Bring a gift",day_of,day_before';
  const example2 = 'anniversary,Wedding Anniversary,Jane & Bob Smith,2020-08-20,true,"10th anniversary celebration",day_of,week_before';

  return `${headers}\n${example1}\n${example2}`;
}

/**
 * Downloads a CSV template file
 */
export function downloadCSVTemplate(): void {
  const template = generateCSVTemplate();
  const blob = new Blob([template], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'events_import_template.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
