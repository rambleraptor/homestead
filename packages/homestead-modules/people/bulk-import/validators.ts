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
