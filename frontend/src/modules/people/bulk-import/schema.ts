/**
 * People Bulk Import - Schema Definition
 */

import type { BulkImportSchema } from '@/shared/bulk-import';
import type { PersonFormData } from '../types';
import {
  validateName,
  validateAddress,
  validateBirthday,
  validateAnniversary,
  validateNotificationPreferences,
  validateOptionalString,
  validatePartnerName,
  validateWifiNetwork,
  validateWifiPassword,
} from './validators';
import { PersonPreview } from './PersonPreview';

/**
 * CSV headers for people import
 */
const REQUIRED_HEADERS = ['name'] as const;

const OPTIONAL_HEADERS = [
  'address',
  'address_line2',
  'address_city',
  'address_state',
  'address_postal_code',
  'address_country',
  'wifi_network',
  'wifi_password',
  'birthday',
  'anniversary',
  'notification_preferences',
  'partner_name',
] as const;

const ALL_HEADERS = [...REQUIRED_HEADERS, ...OPTIONAL_HEADERS] as const;

/**
 * Generate CSV template for people
 */
function generateTemplate(): string {
  const headers = ALL_HEADERS.join(',');
  // Example 1: John with full address, WiFi, birthday, and partner
  const example1 =
    'John Doe,123 Main St,Apt 4B,Anytown,CA,12345,USA,HomeWiFi,password123,1990-06-15,2015-08-20,"day_of,week_before",Jane Doe';
  // Example 2: Jane with simple address, partner (no WiFi info)
  const example2 =
    'Jane Doe,456 Oak Ave,,,,,,,1992-03-15,2015-08-20,day_of,John Doe';
  // Example 3: No partner, minimal data
  const example3 =
    'Peter Jones,789 Pine Ln,,Elsewhere,NY,54321,USA,,,1985-12-01,,day_of,';

  return `${headers}\n${example1}\n${example2}\n${example3}`;
}

/**
 * People bulk import schema
 */
export const peopleImportSchema: BulkImportSchema<PersonFormData> = {
  requiredFields: [
    {
      name: 'name',
      required: true,
      validator: validateName,
      description: 'Full name of the person (max 200 characters)',
    },
  ],
  optionalFields: [
    {
      name: 'address',
      required: false,
      validator: validateAddress,
      description: 'Street address line 1 (max 500 characters)',
    },
    {
      name: 'address_line2',
      required: false,
      validator: validateOptionalString(200),
      description: 'Address line 2 - Apt, Suite, etc. (max 200 characters)',
    },
    {
      name: 'address_city',
      required: false,
      validator: validateOptionalString(100),
      description: 'City (max 100 characters)',
    },
    {
      name: 'address_state',
      required: false,
      validator: validateOptionalString(100),
      description: 'State/Province (max 100 characters)',
    },
    {
      name: 'address_postal_code',
      required: false,
      validator: validateOptionalString(20),
      description: 'Postal/ZIP code (max 20 characters)',
    },
    {
      name: 'address_country',
      required: false,
      validator: validateOptionalString(100),
      description: 'Country (max 100 characters)',
    },
    {
      name: 'wifi_network',
      required: false,
      validator: validateWifiNetwork,
      description: 'WiFi network name (max 100 characters)',
    },
    {
      name: 'wifi_password',
      required: false,
      validator: validateWifiPassword,
      description: 'WiFi password (max 100 characters)',
    },
    {
      name: 'birthday',
      required: false,
      validator: validateBirthday,
      description: 'Birthday (YYYY-MM-DD or MM/DD/YYYY format)',
    },
    {
      name: 'anniversary',
      required: false,
      validator: validateAnniversary,
      description: 'Anniversary (YYYY-MM-DD or MM/DD/YYYY format)',
    },
    {
      name: 'notification_preferences',
      required: false,
      validator: validateNotificationPreferences,
      defaultValue: ['day_of'],
      description:
        'Comma-separated: "day_of", "day_before", "week_before" (default: "day_of")',
    },
    {
      name: 'partner_name',
      required: false,
      validator: validatePartnerName,
      description: 'Partner name - matched with other people in import or existing database',
    },
  ],
  generateTemplate,
  PreviewComponent: PersonPreview,
};

