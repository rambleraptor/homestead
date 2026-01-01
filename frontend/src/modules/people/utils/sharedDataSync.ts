import { getCollection, getCurrentUser, Collections } from '@/core/api/pocketbase';
import type { PersonSharedData, Address, AddressFormData } from '../types';

/**
 * Validates that a string is a valid PocketBase record ID.
 * PocketBase IDs are 15-character alphanumeric strings.
 */
function isValidRecordId(id: string): boolean {
  return /^[a-zA-Z0-9]{15}$/.test(id);
}

/**
 * Creates or updates a single address.
 */
async function upsertAddress(
  addressData: AddressFormData
): Promise<string> {
  const currentUser = getCurrentUser();
  const addressesCollection = getCollection<Address>(Collections.ADDRESSES);

  if (addressData.id) {
    // Update existing address
    await addressesCollection.update(addressData.id, {
      line1: addressData.line1,
      line2: addressData.line2,
      city: addressData.city,
      state: addressData.state,
      postal_code: addressData.postal_code,
      country: addressData.country,
      wifi_network: addressData.wifi_network,
      wifi_password: addressData.wifi_password,
      created_by: currentUser?.id,
    });
    return addressData.id;
  } else {
    // Create new address
    const newAddress = await addressesCollection.create({
      line1: addressData.line1,
      line2: addressData.line2,
      city: addressData.city,
      state: addressData.state,
      postal_code: addressData.postal_code,
      country: addressData.country,
      wifi_network: addressData.wifi_network,
      wifi_password: addressData.wifi_password,
      created_by: currentUser?.id,
    });
    return newAddress.id;
  }
}

/**
 * Upserts multiple addresses and returns their IDs.
 * Filters out empty addresses (no line1).
 */
async function upsertAddresses(
  addresses: AddressFormData[]
): Promise<string[]> {
  const addressIds: string[] = [];

  for (const addressData of addresses) {
    // Skip empty addresses
    if (!addressData.line1 || addressData.line1.trim() === '') {
      continue;
    }

    const addressId = await upsertAddress(addressData);
    addressIds.push(addressId);
  }

  return addressIds;
}

/**
 * Finds shared data for a given person.
 * Searches where person_a = personId OR person_b = personId
 */
export async function findSharedDataForPerson(
  personId: string
): Promise<PersonSharedData | null> {
  // Validate personId to prevent SQL injection
  if (!isValidRecordId(personId)) {
    throw new Error(`Invalid person ID format: ${personId}`);
  }

  try {
    const sharedDataCollection = getCollection<PersonSharedData>(Collections.PERSON_SHARED_DATA);

    // Safe to use template literal now that we've validated the format
    const filter = `person_a = "${personId}" || person_b = "${personId}"`;
    const sharedData = await sharedDataCollection.getFirstListItem(filter);

    return sharedData;
  } catch {
    // No shared data found
    return null;
  }
}

/**
 * Creates shared data for a person (without partner).
 */
export async function createSharedData(data: {
  personId: string;
  addresses?: AddressFormData[];
  anniversary?: string;
}): Promise<PersonSharedData> {
  const currentUser = getCurrentUser();
  const sharedDataCollection = getCollection<PersonSharedData>(Collections.PERSON_SHARED_DATA);

  // Create or update addresses if provided
  const addressIds = data.addresses ? await upsertAddresses(data.addresses) : [];

  return await sharedDataCollection.create({
    person_a: data.personId,
    person_b: undefined,
    address_id: addressIds.length > 0 ? addressIds : undefined,
    anniversary: data.anniversary,
    created_by: currentUser?.id,
  });
}

/**
 * Updates existing shared data.
 */
export async function updateSharedData(
  sharedDataId: string,
  data: {
    addresses?: AddressFormData[];
    anniversary?: string;
  }
): Promise<PersonSharedData> {
  const sharedDataCollection = getCollection<PersonSharedData>(Collections.PERSON_SHARED_DATA);

  // Update or create addresses if provided
  const addressIds = data.addresses ? await upsertAddresses(data.addresses) : undefined;

  return await sharedDataCollection.update(sharedDataId, {
    address_id: addressIds,
    anniversary: data.anniversary,
  });
}

/**
 * Adds a partner to existing shared data or creates new shared data with partner.
 */
export async function setPartner(
  personId: string,
  partnerId: string,
  sharedData?: {
    addresses?: AddressFormData[];
    anniversary?: string;
  }
): Promise<PersonSharedData> {
  const currentUser = getCurrentUser();
  const sharedDataCollection = getCollection<PersonSharedData>(Collections.PERSON_SHARED_DATA);

  // Check if person already has shared data
  const existingSharedData = await findSharedDataForPerson(personId);

  // Check if partner already has shared data
  const partnerSharedData = await findSharedDataForPerson(partnerId);

  if (existingSharedData && !partnerSharedData) {
    // Person has shared data, partner doesn't - add partner to person's shared data
    // Use provided addresses, or keep existing ones
    const addressIds = sharedData?.addresses
      ? await upsertAddresses(sharedData.addresses)
      : existingSharedData.address_id;

    return await sharedDataCollection.update(existingSharedData.id, {
      person_b: partnerId,
      address_id: addressIds,
      anniversary: sharedData?.anniversary || existingSharedData.anniversary,
    });
  } else if (!existingSharedData && partnerSharedData) {
    // Partner has shared data, person doesn't - add person to partner's shared data
    const addressIds = sharedData?.addresses
      ? await upsertAddresses(sharedData.addresses)
      : partnerSharedData.address_id;

    return await sharedDataCollection.update(partnerSharedData.id, {
      person_b: personId,
      address_id: addressIds,
      anniversary: sharedData?.anniversary || partnerSharedData.anniversary,
    });
  } else if (existingSharedData && partnerSharedData) {
    // Both have shared data - merge into one (keep person's, delete partner's)
    // Merge address arrays: prefer provided, then combine existing and partner's (deduped)
    let mergedAddressIds: string[] | undefined;
    if (sharedData?.addresses) {
      mergedAddressIds = await upsertAddresses(sharedData.addresses);
    } else {
      // Combine both address arrays (remove duplicates)
      const combinedIds = [
        ...(existingSharedData.address_id || []),
        ...(partnerSharedData.address_id || [])
      ];
      mergedAddressIds = Array.from(new Set(combinedIds));
    }

    const mergedData = await sharedDataCollection.update(existingSharedData.id, {
      person_b: partnerId,
      address_id: mergedAddressIds,
      anniversary: sharedData?.anniversary || existingSharedData.anniversary || partnerSharedData.anniversary,
    });

    // Delete partner's old shared data
    await sharedDataCollection.delete(partnerSharedData.id);

    return mergedData;
  } else {
    // Neither has shared data - create new
    const addressIds = sharedData?.addresses ? await upsertAddresses(sharedData.addresses) : undefined;

    return await sharedDataCollection.create({
      person_a: personId,
      person_b: partnerId,
      address_id: addressIds,
      anniversary: sharedData?.anniversary,
      created_by: currentUser?.id,
    });
  }
}

/**
 * Removes partner from shared data.
 * Splits the shared data into two separate records if both had data.
 */
export async function removePartner(
  personId: string,
  partnerId: string
): Promise<void> {
  const currentUser = getCurrentUser();
  const sharedDataCollection = getCollection<PersonSharedData>(Collections.PERSON_SHARED_DATA);

  const sharedData = await findSharedDataForPerson(personId);

  if (!sharedData) {
    return;
  }

  // Determine which person is person_a and which is person_b
  const personIsA = sharedData.person_a === personId;
  const otherPersonId = personIsA ? sharedData.person_b : sharedData.person_a;

  if (otherPersonId !== partnerId) {
    // Not actually partners in shared data
    return;
  }

  // Fix race condition: Update current shared data FIRST to remove partner
  // This ensures data consistency if the subsequent create fails
  await sharedDataCollection.update(sharedData.id, {
    person_b: undefined,
  });

  // Then create new shared data for the other person
  // If this fails, at least the original record is in a consistent state
  // Both people share the same address_id - they can modify independently later
  await sharedDataCollection.create({
    person_a: otherPersonId || '',
    person_b: undefined,
    address_id: sharedData.address_id,
    anniversary: sharedData.anniversary,
    created_by: currentUser?.id,
  });
}

/**
 * Deletes shared data for a person.
 */
export async function deleteSharedData(sharedDataId: string): Promise<void> {
  const sharedDataCollection = getCollection<PersonSharedData>(Collections.PERSON_SHARED_DATA);
  await sharedDataCollection.delete(sharedDataId);
}
