// A home shared by a group of people. `members` holds person ids (bare ids
// or `people/{id}` paths — the chat tools write either).
export interface Household {
  id: string;
  name: string;
  members: string[];
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  wifi_network?: string;
  wifi_password?: string;
  created_by?: string;
}

export interface HouseholdFormData {
  name: string;
  members: string[]; // Bare person ids
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  wifi_network?: string;
  wifi_password?: string;
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

// Person — households and relatives are hydrated client-side from the
// households and person-relationships collections.
export interface Person {
  id: string;
  name: string;
  aliases: string[]; // Alternate names (maiden name, nickname); can be empty
  households: Household[]; // Can be empty
  partner?: RelatedPerson;
  parents: RelatedPerson[];
  children: RelatedPerson[];
  siblings: RelatedPerson[];
  created_by: string;
  created: string;
  updated: string;
}

export interface PersonFormData {
  name: string;
  aliases: string[]; // Alternate names (maiden name, nickname)
  household_ids?: string[]; // Bare household ids
  // "New household" shortcut: created with this person as a member.
  new_household?: Omit<HouseholdFormData, 'members'>;
  partner_id?: string; // Used in form to select partner
  parent_ids?: string[];
  child_ids?: string[];
  sibling_ids?: string[]; // Stored sibling links only, not inferred ones
}

export interface PeopleStats {
  totalPeople: number;
}
