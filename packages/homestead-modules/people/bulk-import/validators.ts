/**
 * People Bulk Import - Field Validators
 */

import type { FieldValidator } from '@rambleraptor/homestead-core/shared/bulk-import';

/**
 * Validates name field
 */
export const validateName: FieldValidator<string> = (value) => {
  const name = value.trim();

  if (!name) {
    return {
      value: '',
      error: 'name is a required field',
    };
  }

  if (name.length > 200) {
    return {
      value: name,
      error: 'name must be 200 characters or less',
    };
  }

  return { value: name };
};

/**
 * Validates address field
 */
export const validateAddress: FieldValidator<string | undefined> = (value) => {
  const address = value.trim();

  if (!address) {
    return { value: undefined };
  }

  if (address.length > 500) {
    return {
      value: address,
      error: 'address must be 500 characters or less',
    };
  }

  return { value: address };
};

/**
 * Parses a date string in either YYYY-MM-DD or MM/DD/YYYY format
 * Returns the date in YYYY-MM-DD format if valid, or null if invalid
 */
function parseDate(dateString: string): string | null {
  const trimmed = dateString.trim();

  // Check for YYYY-MM-DD format
  const isoRegex = /^(\d{4})-(\d{2})-(\d{2})$/;
  const isoMatch = trimmed.match(isoRegex);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    const date = new Date(`${year}-${month}-${day}T00:00:00`);
    if (!isNaN(date.getTime()) && date.toISOString().startsWith(`${year}-${month}-${day}`)) {
      return `${year}-${month}-${day}`;
    }
    return null;
  }

  // Check for MM/DD/YYYY format
  const usRegex = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
  const usMatch = trimmed.match(usRegex);
  if (usMatch) {
    const [, month, day, year] = usMatch;
    const paddedMonth = month.padStart(2, '0');
    const paddedDay = day.padStart(2, '0');
    const isoDate = `${year}-${paddedMonth}-${paddedDay}`;
    const date = new Date(`${isoDate}T00:00:00`);
    if (!isNaN(date.getTime()) && date.toISOString().startsWith(isoDate)) {
      return isoDate;
    }
    return null;
  }

  return null;
}

/**
 * Validates birthday field (YYYY-MM-DD or MM/DD/YYYY format)
 */
export const validateBirthday: FieldValidator<string | undefined> = (value) => {
  const birthday = value.trim();

  if (!birthday) {
    return { value: undefined };
  }

  const parsedDate = parseDate(birthday);
  if (!parsedDate) {
    return {
      value: birthday,
      error: 'birthday must be in YYYY-MM-DD or MM/DD/YYYY format',
    };
  }

  return { value: parsedDate };
};

/**
 * Validates anniversary field (YYYY-MM-DD or MM/DD/YYYY format)
 */
export const validateAnniversary: FieldValidator<string | undefined> = (value) => {
  const anniversary = value.trim();

  if (!anniversary) {
    return { value: undefined };
  }

  const parsedDate = parseDate(anniversary);
  if (!parsedDate) {
    return {
      value: anniversary,
      error: 'anniversary must be in YYYY-MM-DD or MM/DD/YYYY format',
    };
  }

  return { value: parsedDate };
};


/**
 * Validates optional string field with max length
 */
export const validateOptionalString = (maxLength: number): FieldValidator<string | undefined> => (value) => {
  const trimmed = value.trim();

  if (!trimmed) {
    return { value: undefined };
  }

  if (trimmed.length > maxLength) {
    return {
      value: trimmed,
      error: `must be ${maxLength} characters or less`,
    };
  }

  return { value: trimmed };
};

/**
 * Validates partner_name field
 */
export const validatePartnerName: FieldValidator<string | undefined> = (value) => {
  const partnerName = value.trim();

  if (!partnerName) {
    return { value: undefined };
  }

  if (partnerName.length > 200) {
    return {
      value: partnerName,
      error: 'partner_name must be 200 characters or less',
    };
  }

  return { value: partnerName };
};

/**
 * Validates WiFi network field
 */
export const validateWifiNetwork: FieldValidator<string | undefined> = (value) => {
  const wifiNetwork = value.trim();

  if (!wifiNetwork) {
    return { value: undefined };
  }

  if (wifiNetwork.length > 100) {
    return {
      value: wifiNetwork,
      error: 'wifi_network must be 100 characters or less',
    };
  }

  return { value: wifiNetwork };
};

/**
 * Validates WiFi password field
 */
export const validateWifiPassword: FieldValidator<string | undefined> = (value) => {
  const wifiPassword = value.trim();

  if (!wifiPassword) {
    return { value: undefined };
  }

  if (wifiPassword.length > 100) {
    return {
      value: wifiPassword,
      error: 'wifi_password must be 100 characters or less',
    };
  }

  return { value: wifiPassword };
};
