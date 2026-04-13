/**
 * aepbase Helper Functions for E2E Tests
 *
 * Direct REST helpers for seeding and cleaning up test data. Takes a bearer
 * token + optional parent path. Designed to replace the old
 * `pocketbase-helpers.ts` with the same signatures, adjusted to aepbase's
 * kebab-case collections and nested child URLs.
 */

import { getAepbaseUrl } from '../config/aepbase.setup';

type ParentPath = string[];

interface RequestOptions {
  token: string;
  method?: string;
  body?: unknown;
  mergePatch?: boolean;
  multipart?: FormData;
}

async function req(path: string, opts: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${opts.token}`,
  };
  let body: BodyInit | undefined;
  if (opts.multipart) {
    body = opts.multipart;
  } else if (opts.body !== undefined) {
    headers['Content-Type'] = opts.mergePatch
      ? 'application/merge-patch+json'
      : 'application/json';
    body = JSON.stringify(opts.body);
  }
  return fetch(`${getAepbaseUrl()}${path}`, {
    method: opts.method || 'GET',
    headers,
    body,
  });
}

function pathFor(plural: string, parent?: ParentPath): string {
  if (parent && parent.length > 0) return '/' + parent.join('/') + `/${plural}`;
  return `/${plural}`;
}

export async function aepGet<T>(
  token: string,
  plural: string,
  id: string,
  parent?: ParentPath,
): Promise<T> {
  const res = await req(`${pathFor(plural, parent)}/${id}`, { token });
  if (!res.ok) throw new Error(`get ${plural}/${id} failed: ${res.status}`);
  return (await res.json()) as T;
}

export async function aepUpdate<T>(
  token: string,
  plural: string,
  id: string,
  body: Record<string, unknown>,
  parent?: ParentPath,
): Promise<T> {
  const res = await req(`${pathFor(plural, parent)}/${id}`, {
    token,
    method: 'PATCH',
    body,
    mergePatch: true,
  });
  if (!res.ok) throw new Error(`update ${plural}/${id} failed: ${res.status}`);
  return (await res.json()) as T;
}

export async function aepList<T>(
  token: string,
  plural: string,
  parent?: ParentPath,
): Promise<T[]> {
  const res = await req(`${pathFor(plural, parent)}?max_page_size=200`, { token });
  if (!res.ok) {
    if (res.status === 404 || res.status === 403) return [];
    throw new Error(`list ${plural} failed: ${res.status}`);
  }
  const body = (await res.json()) as { results?: T[] };
  return body.results || [];
}

export async function aepCreate<T>(
  token: string,
  plural: string,
  body: Record<string, unknown>,
  parent?: ParentPath,
): Promise<T> {
  const res = await req(pathFor(plural, parent), { token, method: 'POST', body });
  if (!res.ok) {
    throw new Error(`create ${plural} failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as T;
}

export async function aepCreateMultipart<T>(
  token: string,
  plural: string,
  formData: FormData,
  parent?: ParentPath,
): Promise<T> {
  const res = await req(pathFor(plural, parent), {
    token,
    method: 'POST',
    multipart: formData,
  });
  if (!res.ok) {
    throw new Error(`create ${plural} failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as T;
}

export async function aepRemove(
  token: string,
  plural: string,
  id: string,
  parent?: ParentPath,
): Promise<void> {
  const res = await req(`${pathFor(plural, parent)}/${id}`, {
    token,
    method: 'DELETE',
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`delete ${plural}/${id} failed: ${res.status}`);
  }
}

// ---------------------------------------------------------------------------
// Domain-specific helpers (same shapes the old PB helpers exported)
// ---------------------------------------------------------------------------

interface CreateGiftCardInput {
  merchant: string;
  amount: number;
  card_number?: string;
  pin?: string;
  notes?: string;
}

export interface GiftCardRecord {
  id: string;
  merchant: string;
  amount: number;
  card_number: string;
  pin?: string;
  notes?: string;
}

export async function createGiftCard(
  token: string,
  data: CreateGiftCardInput,
): Promise<GiftCardRecord> {
  return aepCreate<GiftCardRecord>(token, 'gift-cards', {
    merchant: data.merchant,
    amount: data.amount,
    card_number:
      data.card_number ||
      `TEST-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    pin: data.pin || '',
    notes: data.notes || '',
  });
}

export async function createMultipleGiftCards(
  token: string,
  cards: Array<CreateGiftCardInput>,
) {
  const results = [];
  for (const card of cards) {
    results.push(await createGiftCard(token, card));
  }
  return results;
}

interface CreatePersonInput {
  name: string;
  address?: string;
  birthday?: string;
  anniversary?: string;
}

export interface PersonRecord {
  id: string;
  name: string;
  birthday?: string;
}

export async function createPerson(
  token: string,
  data: CreatePersonInput,
): Promise<PersonRecord> {
  const person = await aepCreate<PersonRecord>(token, 'people', {
    name: data.name,
    birthday: data.birthday,
  });

  if (data.address || data.anniversary) {
    let addressId: string | null = null;
    if (data.address) {
      const address = await aepCreate<{ id: string }>(token, 'addresses', {
        line1: data.address,
      });
      addressId = address.id;
    }
    await aepCreate(token, 'person-shared-data', {
      person_a: person.id,
      person_b: undefined,
      address_id: addressId ?? undefined,
      anniversary: data.anniversary,
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

export async function deleteAllGiftCards(token: string) {
  const items = await aepList<{ id: string }>(token, 'gift-cards');
  for (const item of items) {
    await aepRemove(token, 'gift-cards', item.id);
  }
}

export async function getPersonSharedData(token: string, personId: string) {
  const all = await aepList<{
    id: string;
    person_a: string;
    person_b?: string;
    address_id?: string;
    anniversary?: string;
  }>(token, 'person-shared-data');
  return all.find((s) => s.person_a === personId || s.person_b === personId) || null;
}

export async function deleteAllPeople(token: string) {
  const items = await aepList<{ id: string }>(token, 'people');
  for (const item of items) {
    await aepRemove(token, 'people', item.id);
  }
}

export async function deleteAllAddresses(token: string) {
  const items = await aepList<{ id: string }>(token, 'addresses');
  for (const item of items) {
    await aepRemove(token, 'addresses', item.id);
  }
}

export async function deleteAllPersonSharedData(token: string) {
  const items = await aepList<{ id: string }>(token, 'person-shared-data');
  for (const item of items) {
    await aepRemove(token, 'person-shared-data', item.id);
  }
}

interface CreateHSAReceiptInput {
  merchant: string;
  service_date: string;
  amount: number;
  category: 'Medical' | 'Dental' | 'Vision' | 'Rx';
  patient?: string;
  status: 'Stored' | 'Reimbursed';
  notes?: string;
}

export interface HSAReceiptRecord {
  id: string;
  merchant: string;
  service_date: string;
  amount: number;
  category: 'Medical' | 'Dental' | 'Vision' | 'Rx';
  status: 'Stored' | 'Reimbursed';
  patient?: string;
  notes?: string;
}

export async function createHSAReceipt(
  token: string,
  data: CreateHSAReceiptInput,
): Promise<HSAReceiptRecord> {
  // Minimal valid JPEG (required file field).
  const jpegBytes = new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
  ]);
  const blob = new Blob([jpegBytes], { type: 'image/jpeg' });
  const resource: Record<string, unknown> = {
    merchant: data.merchant,
    service_date: data.service_date,
    amount: data.amount,
    category: data.category,
    status: data.status,
  };
  if (data.patient) resource.patient = data.patient;
  if (data.notes) resource.notes = data.notes;

  const formData = new FormData();
  formData.append(
    'resource',
    new Blob([JSON.stringify(resource)], { type: 'application/json' }),
  );
  formData.append('receipt_file', blob, 'test-receipt.jpg');

  return aepCreateMultipart<HSAReceiptRecord>(token, 'hsa-receipts', formData);
}

export async function createMultipleHSAReceipts(
  token: string,
  receipts: Array<CreateHSAReceiptInput>,
) {
  const results = [];
  for (const receipt of receipts) {
    results.push(await createHSAReceipt(token, receipt));
  }
  return results;
}

export async function deleteAllHSAReceipts(token: string) {
  const items = await aepList<{ id: string }>(token, 'hsa-receipts');
  for (const item of items) {
    await aepRemove(token, 'hsa-receipts', item.id);
  }
}

export async function getRecurringNotificationsForPerson(
  token: string,
  userId: string,
  personId: string,
) {
  const all = await aepList<{
    id: string;
    source_collection: string;
    source_id: string;
    reference_date_field: string;
    timing: string;
  }>(token, 'recurring-notifications', ['users', userId]);
  return all
    .filter((n) => n.source_collection === 'people' && n.source_id === personId)
    .sort((a, b) => {
      const fieldCmp = a.reference_date_field.localeCompare(b.reference_date_field);
      return fieldCmp !== 0 ? fieldCmp : a.timing.localeCompare(b.timing);
    });
}

export async function deleteAllRecurringNotifications(token: string, userId: string) {
  const items = await aepList<{ id: string }>(token, 'recurring-notifications', [
    'users',
    userId,
  ]);
  for (const item of items) {
    await aepRemove(token, 'recurring-notifications', item.id, ['users', userId]);
  }
}

/** Wipe everything the test user can see. */
export async function cleanupUserData(token: string, userId: string) {
  await Promise.all([
    deleteAllGiftCards(token),
    deleteAllPersonSharedData(token),
    deleteAllPeople(token),
    deleteAllAddresses(token),
    deleteAllHSAReceipts(token),
    deleteAllRecurringNotifications(token, userId),
  ]);
}
