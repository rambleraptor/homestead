/**
 * People E2E helpers — seed people, addresses, the linking
 * `person-shared-data` records, and `person-relationship` rows via the aepbase
 * REST API.
 */

import { deleteIfPresent, e2eClient } from '../../../../tests/e2e/utils/aepbase-helpers';

interface CreatePersonInput {
  name: string;
  address?: string;
  /**
   * Required when `address` is set — the address resource has
   * `created_by` in its `required` list per the canonical schema.
   * Pass the test user's id from the `userId` fixture.
   */
  createdByUserId?: string;
}

export interface PersonRecord {
  id: string;
  name: string;
}

export async function createPerson(
  token: string,
  data: CreatePersonInput,
): Promise<PersonRecord> {
  const hs = e2eClient(token);
  const person = await hs.collection<PersonRecord>('people').create({
    name: data.name,
  });

  if (data.address) {
    if (!data.createdByUserId) {
      throw new Error(
        'createPerson: createdByUserId is required when `address` is set',
      );
    }
    const address = await hs.collection<{ id: string }>('addresses').create({
      line1: data.address,
      created_by: `users/${data.createdByUserId}`,
    });
    await hs.collection('person-shared-data').create({
      person_a: person.id,
      person_b: undefined,
      address_id: address.id,
    });
  }

  return person;
}

export async function createMultiplePeople(
  token: string,
  people: Array<CreatePersonInput>,
) {
  const results = [];
  for (const person of people) {
    results.push(await createPerson(token, person));
  }
  return results;
}

export async function getPersonSharedData(token: string, personId: string) {
  const all = await e2eClient(token)
    .collection<{
      id: string;
      person_a: string;
      person_b?: string;
      address_id?: string;
    }>('person-shared-data')
    .listAll();
  return all.find((s) => s.person_a === personId || s.person_b === personId) || null;
}

export interface RelationshipRecord {
  id: string;
  kind: 'partner' | 'parent' | 'sibling';
  person_a: string;
  person_b: string;
}

/** Seed a relationship. For `parent`, person_a is the parent of person_b. */
export async function createRelationship(
  token: string,
  data: Omit<RelationshipRecord, 'id'>,
): Promise<RelationshipRecord> {
  return e2eClient(token).collection<RelationshipRecord>('person-relationships').create(data);
}

export async function listRelationships(token: string): Promise<RelationshipRecord[]> {
  return e2eClient(token).collection<RelationshipRecord>('person-relationships').listAll();
}

export async function deleteAllPeople(token: string) {
  const items = await e2eClient(token).collection<{ id: string }>('people').listAll();
  for (const item of items) {
    await deleteIfPresent(token, 'people', item.id);
  }
}

export async function deleteAllAddresses(token: string) {
  const items = await e2eClient(token).collection<{ id: string }>('addresses').listAll();
  for (const item of items) {
    await deleteIfPresent(token, 'addresses', item.id);
  }
}

export const testPeople = [
  {
    name: 'John Smith',
    address: '123 Main St, Anytown, USA',
  },
  {
    name: 'Jane Doe',
    address: '456 Oak Ave, Someplace, USA',
  },
  {
    name: 'Peter Jones',
    address: '789 Pine Ln, Elsewhere, USA',
  },
];

/** CSV fixtures for the bulk-import flow. */
export const testBulkImportCSV = {
  // Basic import - name only
  basicImport: `name
Alice Johnson
Bob Williams
Carol Davis`,

  // Full data import with all fields
  fullDataImport: `name,address,wifi_network,wifi_password,partner_name
John Smith,"123 Main St, Springfield, IL 62701",HomeNetwork,pass123,Jane Smith
Jane Smith,"123 Main St, Springfield, IL 62701",HomeNetwork,pass123,John Smith`,

  // Partner import - two people linked
  partnerImport: `name,address,partner_name
Mike Brown,456 Oak Ave,Sarah Brown
Sarah Brown,456 Oak Ave,Mike Brown`,

  // WiFi info import
  wifiInfoImport: `name,address,wifi_network,wifi_password
David Lee,111 Tech Blvd,OfficeWiFi,secure123
Lisa Chen,222 Innovation Dr,HomeNet,mypassword`,

  // Mixed valid/invalid rows
  mixedValidInvalid: `name,address
Valid Person,123 Good St
,Missing Name Street
Another Valid,456 Nice Ave
Person Too Long Name ${'X'.repeat(200)},Invalid Name`,

  // Validation errors - 1 valid (name only), 1 invalid (missing required name)
  validationErrors: `name,address
Valid Person Only,
,123 No Name Street`,
};
