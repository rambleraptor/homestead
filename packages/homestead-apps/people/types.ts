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

export type RelationshipKind = 'partner' | 'parent' | 'sibling';

// A family link. For kind=parent, person_a is the parent of person_b; partner
// and sibling rows store the lower id as person_a. Ids may arrive as bare ids
// or `people/{id}` paths (the chat tools write either).
export interface PersonRelationship {
  id: string;
  person_a: string;
  person_b: string;
  kind: RelationshipKind;
  created_by?: string;
}

export interface RelatedPerson {
  id: string;
  name: string;
  // A sibling derived from a shared parent rather than a stored sibling row.
  inferred?: boolean;
}

// Person — addresses come from shared_data; relatives come from
// person-relationships. Both are hydrated client-side.
export interface Person {
  id: string;
  name: string;
  aliases: string[]; // Alternate names (maiden name, nickname); can be empty
  addresses: Address[]; // Array of addresses (can be empty)
  partner?: RelatedPerson;
  parents: RelatedPerson[];
  children: RelatedPerson[];
  siblings: RelatedPerson[];
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
  aliases: string[]; // Alternate names (maiden name, nickname)
  addresses: AddressFormData[]; // Array of addresses
  partner_id?: string; // Used in form to select partner
  parent_ids?: string[];
  child_ids?: string[];
  sibling_ids?: string[]; // Stored sibling links only, not inferred ones
}

export interface PeopleStats {
  totalPeople: number;
}
