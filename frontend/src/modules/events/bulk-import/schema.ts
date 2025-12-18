/**
 * Events Bulk Import - Schema Definition
 */

import type { BulkImportSchema } from '@/shared/bulk-import';
import type { EventFormData } from '../types';
import {
  validateEventType,
  validateTitle,
  validatePeopleInvolved,
  validateEventDate,
  validateRecurringYearly,
  validateDetails,
  validateNotificationPreferences,
} from './validators';
import { EventPreview } from './EventPreview';

/**
 * CSV headers for events import
 */
const REQUIRED_HEADERS = [
  'event_type',
  'title',
  'people_involved',
  'event_date',
] as const;

const OPTIONAL_HEADERS = [
  'recurring_yearly',
  'details',
  'notification_preferences',
] as const;

const ALL_HEADERS = [...REQUIRED_HEADERS, ...OPTIONAL_HEADERS] as const;

/**
 * Generate CSV template for events
 */
function generateTemplate(): string {
  const headers = ALL_HEADERS.join(',');
  const example1 =
    'birthday,John\'s Birthday,John Doe,2024-06-15,true,"Bring a gift","day_of,day_before"';
  const example2 =
    'anniversary,Wedding Anniversary,Jane & Bob Smith,2020-08-20,true,"10th anniversary celebration","day_of,week_before"';

  return `${headers}\n${example1}\n${example2}`;
}

/**
 * Events bulk import schema
 */
export const eventsImportSchema: BulkImportSchema<EventFormData> = {
  requiredFields: [
    {
      name: 'event_type',
      required: true,
      validator: validateEventType,
      description: 'Type of event: "birthday" or "anniversary"',
    },
    {
      name: 'title',
      required: true,
      validator: validateTitle,
      description: 'Event title (max 200 characters)',
    },
    {
      name: 'people_involved',
      required: true,
      validator: validatePeopleInvolved,
      description: 'People involved (max 500 characters)',
    },
    {
      name: 'event_date',
      required: true,
      validator: validateEventDate,
      description: 'Event date in YYYY-MM-DD format',
    },
  ],
  optionalFields: [
    {
      name: 'recurring_yearly',
      required: false,
      validator: validateRecurringYearly,
      defaultValue: true,
      description: 'Whether event recurs yearly: "true" or "false" (default: true)',
    },
    {
      name: 'details',
      required: false,
      validator: validateDetails,
      description: 'Additional details (max 2000 characters)',
    },
    {
      name: 'notification_preferences',
      required: false,
      validator: validateNotificationPreferences,
      defaultValue: ['day_of'],
      description:
        'Comma-separated: "day_of", "day_before", "week_before" (default: "day_of")',
    },
  ],
  generateTemplate,
  PreviewComponent: EventPreview,
};
