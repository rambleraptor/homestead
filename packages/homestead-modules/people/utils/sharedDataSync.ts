/**
 * Shared-data sync helpers for the people module.
 *
 * All reads/writes go through aepbase. Where PB used filter strings we list
 * the collection and filter client-side (household datasets are small).
 */

import { aepbase, AepCollections } from '@/core/api/aepbase';
import type { PersonSharedData, Address, AddressFormData } from '../types';

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

function mapAddress(rec: AepAddressRecord): Address {
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

function mapSharedData(rec: AepSharedDataRecord): PersonSharedData {
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

function createdByPath(): string | undefined {
  const id = aepbase.getCurrentUser()?.id;
  return id ? `users/${id}` : undefined;
}

async function upsertAddress(
  addressData: AddressFormData,
  shared_data_id?: string,
): Promise<string> {
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
    await aepbase.update<AepAddressRecord>(AepCollections.ADDRESSES, addressData.id, body);
    return addressData.id;
  }
  const created = await aepbase.create<AepAddressRecord>(AepCollections.ADDRESSES, {
    ...body,
    created_by: createdByPath(),
  });
  return created.id;
}

async function syncAddresses(
  addresses: AddressFormData[],
  sharedDataId: string,
): Promise<string | undefined> {
  const validAddresses = addresses.filter((a) => a.line1 && a.line1.trim() !== '');
  if (validAddresses.length === 0) return undefined;

  const formAddressIds = new Set(
    validAddresses.map((a) => a.id).filter((id): id is string => !!id),
  );

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

  const primaryAddressId = await upsertAddress(validAddresses[0]);
  for (let i = 1; i < validAddresses.length; i++) {
    await upsertAddress(validAddresses[i], sharedDataId);
  }
  return primaryAddressId;
}

export async function findSharedDataForPerson(
  personId: string,
): Promise<PersonSharedData | null> {
  const all = await aepbase.list<AepSharedDataRecord>(AepCollections.PERSON_SHARED_DATA);
  const found = all.find((s) => s.person_a === personId || s.person_b === personId);
  return found ? mapSharedData(found) : null;
}

export async function createSharedData(data: {
  personId: string;
  addresses?: AddressFormData[];
  anniversary?: string;
}): Promise<PersonSharedData> {
  const validAddresses =
    data.addresses?.filter((a) => a.line1 && a.line1.trim() !== '') || [];
  let primaryAddressId: string | undefined;
  if (validAddresses.length > 0) {
    primaryAddressId = await upsertAddress(validAddresses[0]);
  }
  const created = await aepbase.create<AepSharedDataRecord>(
    AepCollections.PERSON_SHARED_DATA,
    {
      person_a: data.personId,
      person_b: undefined,
      address_id: primaryAddressId,
      anniversary: data.anniversary,
      created_by: createdByPath(),
    },
  );
  for (let i = 1; i < validAddresses.length; i++) {
    await upsertAddress(validAddresses[i], created.id);
  }
  return mapSharedData(created);
}

export async function updateSharedData(
  sharedDataId: string,
  data: { addresses?: AddressFormData[]; anniversary?: string },
): Promise<PersonSharedData> {
  const primaryAddressId = data.addresses
    ? await syncAddresses(data.addresses, sharedDataId)
    : undefined;
  const updated = await aepbase.update<AepSharedDataRecord>(
    AepCollections.PERSON_SHARED_DATA,
    sharedDataId,
    { address_id: primaryAddressId, anniversary: data.anniversary },
  );
  return mapSharedData(updated);
}

export async function setPartner(
  personId: string,
  partnerId: string,
  sharedData?: { addresses?: AddressFormData[]; anniversary?: string },
): Promise<PersonSharedData> {
  const existingSharedData = await findSharedDataForPerson(personId);
  const partnerSharedData = await findSharedDataForPerson(partnerId);

  if (existingSharedData && !partnerSharedData) {
    const primaryAddressId = sharedData?.addresses
      ? await syncAddresses(sharedData.addresses, existingSharedData.id)
      : existingSharedData.address_id;
    const updated = await aepbase.update<AepSharedDataRecord>(
      AepCollections.PERSON_SHARED_DATA,
      existingSharedData.id,
      {
        person_b: partnerId,
        address_id: primaryAddressId,
        anniversary: sharedData?.anniversary || existingSharedData.anniversary,
      },
    );
    return mapSharedData(updated);
  }

  if (!existingSharedData && partnerSharedData) {
    const primaryAddressId = sharedData?.addresses
      ? await syncAddresses(sharedData.addresses, partnerSharedData.id)
      : partnerSharedData.address_id;
    const updated = await aepbase.update<AepSharedDataRecord>(
      AepCollections.PERSON_SHARED_DATA,
      partnerSharedData.id,
      {
        person_b: personId,
        address_id: primaryAddressId,
        anniversary: sharedData?.anniversary || partnerSharedData.anniversary,
      },
    );
    return mapSharedData(updated);
  }

  if (existingSharedData && partnerSharedData) {
    let primaryAddressId: string | undefined;
    if (sharedData?.addresses) {
      primaryAddressId = await syncAddresses(sharedData.addresses, existingSharedData.id);
    } else {
      primaryAddressId = existingSharedData.address_id;
    }
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
    return mapSharedData(merged);
  }

  // Neither has shared data — create new.
  const validAddresses =
    sharedData?.addresses?.filter((a) => a.line1 && a.line1.trim() !== '') || [];
  let primaryAddressId: string | undefined;
  if (validAddresses.length > 0) {
    primaryAddressId = await upsertAddress(validAddresses[0]);
  }
  const created = await aepbase.create<AepSharedDataRecord>(
    AepCollections.PERSON_SHARED_DATA,
    {
      person_a: personId,
      person_b: partnerId,
      address_id: primaryAddressId,
      anniversary: sharedData?.anniversary,
      created_by: createdByPath(),
    },
  );
  for (let i = 1; i < validAddresses.length; i++) {
    await upsertAddress(validAddresses[i], created.id);
  }
  return mapSharedData(created);
}

export async function removePartner(
  personId: string,
  partnerId: string,
): Promise<void> {
  const sharedData = await findSharedDataForPerson(personId);
  if (!sharedData) return;

  const personIsA = sharedData.person_a === personId;
  const otherPersonId = personIsA ? sharedData.person_b : sharedData.person_a;
  if (otherPersonId !== partnerId) return;

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
    created_by: createdByPath(),
  });
}

export async function deleteSharedData(sharedDataId: string): Promise<void> {
  await aepbase.remove(AepCollections.PERSON_SHARED_DATA, sharedDataId);
}

export { mapAddress };
