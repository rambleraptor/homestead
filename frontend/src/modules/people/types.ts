export type PersonEventType = 'birthday' | 'anniversary';

export type NotificationPreference = 'day_of' | 'day_before' | 'week_before';

// Address type
export interface Address {
  id: string;
  line1: string;
  line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  wifi_network?: string;
  wifi_password?: string;
  shared_data_id?: string; // Optional link to person_shared_data for additional addresses
  created_by: string;
  created: string;
  updated: string;
}

// Internal type for shared data (not exposed to UI)
export interface PersonSharedData {
  id: string;
  person_a: string;
  person_b?: string;
  address_id?: string; // Primary address ID (single)
  anniversary?: string;
  created_by: string;
  created: string;
  updated: string;
}

// Person - addresses and anniversary come from shared_data table (abstracted)
export interface Person {
  id: string;
  name: string;
  addresses: Address[]; // Array of addresses (can be empty)
  birthday?: string;
  anniversary?: string;
  notification_preferences: NotificationPreference[];
  partner?: Person; // Partner info if exists
  created_by: string;
  created: string;
  updated: string;
}

// Form data for address input (can be new or existing)
export interface AddressFormData {
  id?: string; // If editing existing address
  line1: string;
  line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  wifi_network?: string;
  wifi_password?: string;
}

export interface PersonFormData {
  name: string;
  addresses: AddressFormData[]; // Array of addresses
  birthday?: string;
  anniversary?: string;
  notification_preferences: NotificationPreference[];
  partner_id?: string; // Used in form to select partner
}

/**
 * CSV import data - flat structure matching CSV columns
 */
export interface PersonCSVData {
  name: string;
  address?: string;
  wifi_network?: string;
  wifi_password?: string;
  birthday?: string;
  anniversary?: string;
  notification_preferences?: NotificationPreference[];
  partner_name?: string; // Partner name for matching
}

export interface PeopleStats {
  totalPeople: number;
  upcomingBirthdays: number;
  upcomingAnniversaries: number;
}

export interface NotificationPreferenceOption {
  value: NotificationPreference;
  label: string;
  description: string;
}

export const NOTIFICATION_PREFERENCE_OPTIONS: NotificationPreferenceOption[] = [
  {
    value: 'day_of',
    label: 'On the day',
    description: 'Get notified on the day of the birthday or anniversary',
  },
  {
    value: 'day_before',
    label: 'The day before',
    description: 'Get notified one day before the birthday or anniversary',
  },
  {
    value: 'week_before',
    label: 'A week before',
    description: 'Get notified one week before the birthday or anniversary',
  },
];
