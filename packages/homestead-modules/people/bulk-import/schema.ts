/**
 * People Bulk Import - Schema Definition
 */

import type { BulkImportSchema } from '@/shared/bulk-import';
import type { PersonCSVData } from '../types';
import {
  validateName,
  validateAddress,
  validateBirthday,
  validateAnniversary,
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
  'wifi_network',
  'wifi_password',
  'birthday',
  'anniversary',
  'partner_name',
] as const;

const ALL_HEADERS = [...REQUIRED_HEADERS, ...OPTIONAL_HEADERS] as const;

/**
 * Generate CSV template for people
 */
function generateTemplate(): string {
  const headers = ALL_HEADERS.join(',');
  // Example 1: John with address, WiFi, dates, and partner
  const example1 =
    'John Doe,"123 Main St, Anytown, CA 12345",HomeWiFi,password123,06/15/1990,08/20/2015,Jane Doe';
  // Example 2: Jane with address and partner
  const example2 =
    'Jane Doe,"456 Oak Ave, Springfield, IL",,,,08/20/2015,John Doe';
  // Example 3: Solo person, minimal data
  const example3 =
    'Peter Jones,"789 Pine Ln, Boston, MA",,,1985-12-01,,';

  return `${headers}\n${example1}\n${example2}\n${example3}`;
}

/**
 * People bulk import schema
 */
export const peopleImportSchema: BulkImportSchema<PersonCSVData> = {
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
      description: 'Full address (max 500 characters)',
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
      name: 'partner_name',
      required: false,
      validator: validatePartnerName,
      description: 'Partner name - matched with other people in import or existing database',
    },
  ],
  generateTemplate,
  PreviewComponent: PersonPreview,
};

