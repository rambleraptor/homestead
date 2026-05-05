// Address type. PB-shape stays here so existing helpers compile; the
// aepbase code path hydrates the same field names.
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
  created_by: string;
  created: string;
  updated: string;
}

// Person — addresses come from shared_data; partner is hydrated client-side.
export interface Person {
  id: string;
  name: string;
  addresses: Address[]; // Array of addresses (can be empty)
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
  partner_name?: string; // Partner name for matching
}

export interface PeopleStats {
  totalPeople: number;
}
