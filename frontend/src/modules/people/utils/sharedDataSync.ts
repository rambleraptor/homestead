/**
 * Shared-data sync helpers — branch on the `people` backend flag.
 *
 * The PocketBase code path is unchanged from the original implementation.
 * The aepbase code path uses the thin wrapper. Where the PB version uses
 * filter strings (e.g. `person_a = "..." || person_b = "..."`), the aepbase
 * version lists the full collection and filters client-side. Household
 * datasets are small enough that this is fine.
 *
 * Returned values use the PB-shaped types (`created_by` is a bare id, etc.)
 * so the existing hooks and components don't need to change. The aepbase
 * branch maps records into this shape internally.
 */

import { aepbase, AepCollections } from '@/core/api/aepbase';
import { getCollection, getCurrentUser, Collections } from '@/core/api/pocketbase';
import { isAepbaseEnabled } from '@/core/api/backend';
import type { PersonSharedData, Address, AddressFormData } from '../types';

/**
 * Validates that a string is a valid PocketBase record ID.
 * PocketBase IDs are 15-character alphanumeric strings.
 */
function isValidRecordId(id: string): boolean {
  return /^[a-zA-Z0-9]{15}$/.test(id);
}

// ----------------------------------------------------------------------------
// aepbase helpers
// ----------------------------------------------------------------------------

interface AepAddressRecord {
  id: string;
  path: string;
  line1: string;
  line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  wifi_network?: string;
  wifi_password?: string;
  shared_data_id?: string;
  created_by?: string;
  create_time: string;
  update_time: string;
}

interface AepSharedDataRecord {
  id: string;
  path: string;
  person_a: string;
  person_b?: string;
  address_id?: string;
  anniversary?: string;
  created_by?: string;
  create_time: string;
  update_time: string;
}

function mapAepAddress(rec: AepAddressRecord): Address {
  return {
    id: rec.id,
    line1: rec.line1,
    line2: rec.line2,
    city: rec.city,
    state: rec.state,
    postal_code: rec.postal_code,
    country: rec.country,
    wifi_network: rec.wifi_network,
    wifi_password: rec.wifi_password,
    shared_data_id: rec.shared_data_id,
    created_by: rec.created_by || '',
    created: rec.create_time,
    updated: rec.update_time,
  };
}

function mapAepSharedData(rec: AepSharedDataRecord): PersonSharedData {
  return {
    id: rec.id,
    person_a: rec.person_a,
    person_b: rec.person_b,
    address_id: rec.address_id,
    anniversary: rec.anniversary,
    created_by: rec.created_by || '',
    created: rec.create_time,
    updated: rec.update_time,
  };
}

function aepCreatedBy(): string | undefined {
  const id = aepbase.getCurrentUser()?.id;
  return id ? `users/${id}` : undefined;
}

// ----------------------------------------------------------------------------
// Address upsert
// ----------------------------------------------------------------------------

async function upsertAddress(
  addressData: AddressFormData,
  shared_data_id?: string,
): Promise<string> {
  if (isAepbaseEnabled('people')) {
    const body = {
      line1: addressData.line1,
      line2: addressData.line2,
      city: addressData.city,
      state: addressData.state,
      postal_code: addressData.postal_code,
      country: addressData.country,
      wifi_network: addressData.wifi_network,
      wifi_password: addressData.wifi_password,
      shared_data_id: shared_data_id || undefined,
    };
    if (addressData.id) {
      await aepbase.update<AepAddressRecord>(
        AepCollections.ADDRESSES,
        addressData.id,
        body,
      );
      return addressData.id;
    }
    const created = await aepbase.create<AepAddressRecord>(
      AepCollections.ADDRESSES,
      { ...body, created_by: aepCreatedBy() },
    );
    return created.id;
  }

  // PocketBase path
  const currentUser = getCurrentUser();
  const addressesCollection = getCollection<Address>(Collections.ADDRESSES);
  if (addressData.id) {
    await addressesCollection.update(addressData.id, {
      line1: addressData.line1,
      line2: addressData.line2,
      city: addressData.city,
      state: addressData.state,
      postal_code: addressData.postal_code,
      country: addressData.country,
      wifi_network: addressData.wifi_network,
      wifi_password: addressData.wifi_password,
      shared_data_id: shared_data_id || undefined,
    });
    return addressData.id;
  }
  const newAddress = await addressesCollection.create({
    line1: addressData.line1,
    line2: addressData.line2,
    city: addressData.city,
    state: addressData.state,
    postal_code: addressData.postal_code,
    country: addressData.country,
    wifi_network: addressData.wifi_network,
    wifi_password: addressData.wifi_password,
    shared_data_id: shared_data_id || undefined,
    created_by: currentUser?.id,
  });
  return newAddress.id;
}

async function syncAddresses(
  addresses: AddressFormData[],
  sharedDataId: string,
): Promise<string | undefined> {
  const validAddresses = addresses.filter(
    (addr) => addr.line1 && addr.line1.trim() !== '',
  );
  if (validAddresses.length === 0) return undefined;

  const formAddressIds = new Set(
    validAddresses.map((addr) => addr.id).filter((id): id is string => !!id),
  );

  if (isAepbaseEnabled('people')) {
    // List all addresses, filter client-side by shared_data_id
    try {
      const all = await aepbase.list<AepAddressRecord>(AepCollections.ADDRESSES);
      const existingAdditional = all.filter((a) => a.shared_data_id === sharedDataId);
      for (const existing of existingAdditional) {
        if (!formAddressIds.has(existing.id)) {
          await aepbase.remove(AepCollections.ADDRESSES, existing.id);
        }
      }
    } catch {
      /* continue */
    }
  } else {
    try {
      const addressesCollection = getCollection<Address>(Collections.ADDRESSES);
      const existing = await addressesCollection.getFullList({
        filter: `shared_data_id = "${sharedDataId}"`,
      });
      for (const existingAddr of existing) {
        if (!formAddressIds.has(existingAddr.id)) {
          await addressesCollection.delete(existingAddr.id);
        }
      }
    } catch {
      /* continue */
    }
  }

  const primaryAddressId = await upsertAddress(validAddresses[0]);
  for (let i = 1; i < validAddresses.length; i++) {
    await upsertAddress(validAddresses[i], sharedDataId);
  }
  return primaryAddressId;
}

// ----------------------------------------------------------------------------
// findSharedDataForPerson
// ----------------------------------------------------------------------------

export async function findSharedDataForPerson(
  personId: string,
): Promise<PersonSharedData | null> {
  if (isAepbaseEnabled('people')) {
    const all = await aepbase.list<AepSharedDataRecord>(
      AepCollections.PERSON_SHARED_DATA,
    );
    const found = all.find(
      (s) => s.person_a === personId || s.person_b === personId,
    );
    return found ? mapAepSharedData(found) : null;
  }

  // Validate personId to prevent SQL injection
  if (!isValidRecordId(personId)) {
    throw new Error(`Invalid person ID format: ${personId}`);
  }
  try {
    const sharedDataCollection = getCollection<PersonSharedData>(
      Collections.PERSON_SHARED_DATA,
    );
    const filter = `person_a = "${personId}" || person_b = "${personId}"`;
    return await sharedDataCollection.getFirstListItem(filter);
  } catch {
    return null;
  }
}

// ----------------------------------------------------------------------------
// createSharedData
// ----------------------------------------------------------------------------

export async function createSharedData(data: {
  personId: string;
  addresses?: AddressFormData[];
  anniversary?: string;
}): Promise<PersonSharedData> {
  const validAddresses =
    data.addresses?.filter((addr) => addr.line1 && addr.line1.trim() !== '') || [];

  let primaryAddressId: string | undefined;
  if (validAddresses.length > 0) {
    primaryAddressId = await upsertAddress(validAddresses[0]);
  }

  if (isAepbaseEnabled('people')) {
    const created = await aepbase.create<AepSharedDataRecord>(
      AepCollections.PERSON_SHARED_DATA,
      {
        person_a: data.personId,
        person_b: undefined,
        address_id: primaryAddressId,
        anniversary: data.anniversary,
        created_by: aepCreatedBy(),
      },
    );
    for (let i = 1; i < validAddresses.length; i++) {
      await upsertAddress(validAddresses[i], created.id);
    }
    return mapAepSharedData(created);
  }

  const currentUser = getCurrentUser();
  const sharedDataCollection = getCollection<PersonSharedData>(
    Collections.PERSON_SHARED_DATA,
  );
  const sharedData = await sharedDataCollection.create({
    person_a: data.personId,
    person_b: undefined,
    address_id: primaryAddressId,
    anniversary: data.anniversary,
    created_by: currentUser?.id,
  });
  for (let i = 1; i < validAddresses.length; i++) {
    await upsertAddress(validAddresses[i], sharedData.id);
  }
  return sharedData;
}

// ----------------------------------------------------------------------------
// updateSharedData
// ----------------------------------------------------------------------------

export async function updateSharedData(
  sharedDataId: string,
  data: { addresses?: AddressFormData[]; anniversary?: string },
): Promise<PersonSharedData> {
  const primaryAddressId = data.addresses
    ? await syncAddresses(data.addresses, sharedDataId)
    : undefined;

  if (isAepbaseEnabled('people')) {
    const updated = await aepbase.update<AepSharedDataRecord>(
      AepCollections.PERSON_SHARED_DATA,
      sharedDataId,
      { address_id: primaryAddressId, anniversary: data.anniversary },
    );
    return mapAepSharedData(updated);
  }

  const sharedDataCollection = getCollection<PersonSharedData>(
    Collections.PERSON_SHARED_DATA,
  );
  return await sharedDataCollection.update(sharedDataId, {
    address_id: primaryAddressId,
    anniversary: data.anniversary,
  });
}

// ----------------------------------------------------------------------------
// setPartner
// ----------------------------------------------------------------------------

export async function setPartner(
  personId: string,
  partnerId: string,
  sharedData?: { addresses?: AddressFormData[]; anniversary?: string },
): Promise<PersonSharedData> {
  const useAep = isAepbaseEnabled('people');
  const existingSharedData = await findSharedDataForPerson(personId);
  const partnerSharedData = await findSharedDataForPerson(partnerId);

  if (existingSharedData && !partnerSharedData) {
    const primaryAddressId = sharedData?.addresses
      ? await syncAddresses(sharedData.addresses, existingSharedData.id)
      : existingSharedData.address_id;

    if (useAep) {
      const updated = await aepbase.update<AepSharedDataRecord>(
        AepCollections.PERSON_SHARED_DATA,
        existingSharedData.id,
        {
          person_b: partnerId,
          address_id: primaryAddressId,
          anniversary: sharedData?.anniversary || existingSharedData.anniversary,
        },
      );
      return mapAepSharedData(updated);
    }
    return await getCollection<PersonSharedData>(
      Collections.PERSON_SHARED_DATA,
    ).update(existingSharedData.id, {
      person_b: partnerId,
      address_id: primaryAddressId,
      anniversary: sharedData?.anniversary || existingSharedData.anniversary,
    });
  }

  if (!existingSharedData && partnerSharedData) {
    const primaryAddressId = sharedData?.addresses
      ? await syncAddresses(sharedData.addresses, partnerSharedData.id)
      : partnerSharedData.address_id;

    if (useAep) {
      const updated = await aepbase.update<AepSharedDataRecord>(
        AepCollections.PERSON_SHARED_DATA,
        partnerSharedData.id,
        {
          person_b: personId,
          address_id: primaryAddressId,
          anniversary: sharedData?.anniversary || partnerSharedData.anniversary,
        },
      );
      return mapAepSharedData(updated);
    }
    return await getCollection<PersonSharedData>(
      Collections.PERSON_SHARED_DATA,
    ).update(partnerSharedData.id, {
      person_b: personId,
      address_id: primaryAddressId,
      anniversary: sharedData?.anniversary || partnerSharedData.anniversary,
    });
  }

  if (existingSharedData && partnerSharedData) {
    let primaryAddressId: string | undefined;
    if (sharedData?.addresses) {
      primaryAddressId = await syncAddresses(sharedData.addresses, existingSharedData.id);
    } else {
      primaryAddressId = existingSharedData.address_id;
    }

    if (useAep) {
      const merged = await aepbase.update<AepSharedDataRecord>(
        AepCollections.PERSON_SHARED_DATA,
        existingSharedData.id,
        {
          person_b: partnerId,
          address_id: primaryAddressId,
          anniversary:
            sharedData?.anniversary ||
            existingSharedData.anniversary ||
            partnerSharedData.anniversary,
        },
      );
      await aepbase.remove(AepCollections.PERSON_SHARED_DATA, partnerSharedData.id);
      return mapAepSharedData(merged);
    }

    const sharedDataCollection = getCollection<PersonSharedData>(
      Collections.PERSON_SHARED_DATA,
    );
    const merged = await sharedDataCollection.update(existingSharedData.id, {
      person_b: partnerId,
      address_id: primaryAddressId,
      anniversary:
        sharedData?.anniversary ||
        existingSharedData.anniversary ||
        partnerSharedData.anniversary,
    });
    await sharedDataCollection.delete(partnerSharedData.id);
    return merged;
  }

  // Neither has shared data — create new.
  const validAddresses =
    sharedData?.addresses?.filter((addr) => addr.line1 && addr.line1.trim() !== '') ||
    [];
  let primaryAddressId: string | undefined;
  if (validAddresses.length > 0) {
    primaryAddressId = await upsertAddress(validAddresses[0]);
  }

  if (useAep) {
    const created = await aepbase.create<AepSharedDataRecord>(
      AepCollections.PERSON_SHARED_DATA,
      {
        person_a: personId,
        person_b: partnerId,
        address_id: primaryAddressId,
        anniversary: sharedData?.anniversary,
        created_by: aepCreatedBy(),
      },
    );
    for (let i = 1; i < validAddresses.length; i++) {
      await upsertAddress(validAddresses[i], created.id);
    }
    return mapAepSharedData(created);
  }

  const currentUser = getCurrentUser();
  const sharedDataCollection = getCollection<PersonSharedData>(
    Collections.PERSON_SHARED_DATA,
  );
  const newSharedData = await sharedDataCollection.create({
    person_a: personId,
    person_b: partnerId,
    address_id: primaryAddressId,
    anniversary: sharedData?.anniversary,
    created_by: currentUser?.id,
  });
  for (let i = 1; i < validAddresses.length; i++) {
    await upsertAddress(validAddresses[i], newSharedData.id);
  }
  return newSharedData;
}

// ----------------------------------------------------------------------------
// removePartner
// ----------------------------------------------------------------------------

export async function removePartner(
  personId: string,
  partnerId: string,
): Promise<void> {
  const useAep = isAepbaseEnabled('people');
  const sharedData = await findSharedDataForPerson(personId);
  if (!sharedData) return;

  const personIsA = sharedData.person_a === personId;
  const otherPersonId = personIsA ? sharedData.person_b : sharedData.person_a;
  if (otherPersonId !== partnerId) return;

  if (useAep) {
    await aepbase.update<AepSharedDataRecord>(
      AepCollections.PERSON_SHARED_DATA,
      sharedData.id,
      { person_b: undefined },
    );
    await aepbase.create<AepSharedDataRecord>(AepCollections.PERSON_SHARED_DATA, {
      person_a: otherPersonId || '',
      person_b: undefined,
      address_id: sharedData.address_id,
      anniversary: sharedData.anniversary,
      created_by: aepCreatedBy(),
    });
    return;
  }

  const currentUser = getCurrentUser();
  const sharedDataCollection = getCollection<PersonSharedData>(
    Collections.PERSON_SHARED_DATA,
  );
  await sharedDataCollection.update(sharedData.id, { person_b: undefined });
  await sharedDataCollection.create({
    person_a: otherPersonId || '',
    person_b: undefined,
    address_id: sharedData.address_id,
    anniversary: sharedData.anniversary,
    created_by: currentUser?.id,
  });
}

// ----------------------------------------------------------------------------
// deleteSharedData
// ----------------------------------------------------------------------------

export async function deleteSharedData(sharedDataId: string): Promise<void> {
  if (isAepbaseEnabled('people')) {
    await aepbase.remove(AepCollections.PERSON_SHARED_DATA, sharedDataId);
    return;
  }
  await getCollection<PersonSharedData>(Collections.PERSON_SHARED_DATA).delete(
    sharedDataId,
  );
}

export { mapAepAddress };
