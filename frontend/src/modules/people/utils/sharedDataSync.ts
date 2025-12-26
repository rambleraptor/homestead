import { getCollection, getCurrentUser, Collections } from '@/core/api/pocketbase';
import type { PersonSharedData, Address } from '../types';

/**
 * Validates that a string is a valid PocketBase record ID.
 * PocketBase IDs are 15-character alphanumeric strings.
 */
function isValidRecordId(id: string): boolean {
  return /^[a-zA-Z0-9]{15}$/.test(id);
}

/**
 * Creates or updates an address.
 */
async function upsertAddress(
  addressId: string | undefined,
  addressData: {
    line1: string;
    line2?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
    wifi_network?: string;
    wifi_password?: string;
  } | undefined
): Promise<string | undefined> {
  if (!addressData || !addressData.line1) {
    return undefined;
  }

  const currentUser = getCurrentUser();
  const addressesCollection = getCollection<Address>(Collections.ADDRESSES);

  if (addressId) {
    // Update existing address
    await addressesCollection.update(addressId, {
      ...addressData,
      created_by: currentUser?.id,
    });
    return addressId;
  } else {
    // Create new address
    const newAddress = await addressesCollection.create({
      ...addressData,
      created_by: currentUser?.id,
    });
    return newAddress.id;
  }
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
  address?: {
    line1: string;
    line2?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
    wifi_network?: string;
    wifi_password?: string;
  };
  anniversary?: string;
}): Promise<PersonSharedData> {
  const currentUser = getCurrentUser();
  const sharedDataCollection = getCollection<PersonSharedData>(Collections.PERSON_SHARED_DATA);

  // Create address if provided
  const addressId = await upsertAddress(undefined, data.address);

  return await sharedDataCollection.create({
    person_a: data.personId,
    person_b: undefined,
    address_id: addressId,
    anniversary: data.anniversary,
    created_by: currentUser?.id,
  });
}

/**
 * Updates existing shared data.
 */
export async function updateSharedData(
  sharedDataId: string,
  currentAddressId: string | undefined,
  data: {
    address?: {
      line1: string;
      line2?: string;
      city?: string;
      state?: string;
      postal_code?: string;
      country?: string;
      wifi_network?: string;
      wifi_password?: string;
    };
    anniversary?: string;
  }
): Promise<PersonSharedData> {
  const sharedDataCollection = getCollection<PersonSharedData>(Collections.PERSON_SHARED_DATA);

  // Update or create address if provided
  const addressId = await upsertAddress(currentAddressId, data.address);

  return await sharedDataCollection.update(sharedDataId, {
    address_id: addressId,
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
    address?: {
      line1: string;
      line2?: string;
      city?: string;
      state?: string;
      postal_code?: string;
      country?: string;
      wifi_network?: string;
      wifi_password?: string;
    };
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
    const addressId = sharedData?.address
      ? await upsertAddress(existingSharedData.address_id, sharedData.address)
      : existingSharedData.address_id;

    return await sharedDataCollection.update(existingSharedData.id, {
      person_b: partnerId,
      address_id: addressId,
      anniversary: sharedData?.anniversary || existingSharedData.anniversary,
    });
  } else if (!existingSharedData && partnerSharedData) {
    // Partner has shared data, person doesn't - add person to partner's shared data
    const addressId = sharedData?.address
      ? await upsertAddress(partnerSharedData.address_id, sharedData.address)
      : partnerSharedData.address_id;

    return await sharedDataCollection.update(partnerSharedData.id, {
      person_b: personId,
      address_id: addressId,
      anniversary: sharedData?.anniversary || partnerSharedData.anniversary,
    });
  } else if (existingSharedData && partnerSharedData) {
    // Both have shared data - merge into one (keep person's, delete partner's)
    // Prefer provided address, then existing, then partner's
    const addressId = sharedData?.address
      ? await upsertAddress(existingSharedData.address_id, sharedData.address)
      : existingSharedData.address_id || partnerSharedData.address_id;

    const mergedData = await sharedDataCollection.update(existingSharedData.id, {
      person_b: partnerId,
      address_id: addressId,
      anniversary: sharedData?.anniversary || existingSharedData.anniversary || partnerSharedData.anniversary,
    });

    // Delete partner's old shared data
    await sharedDataCollection.delete(partnerSharedData.id);

    return mergedData;
  } else {
    // Neither has shared data - create new
    const addressId = await upsertAddress(undefined, sharedData?.address);

    return await sharedDataCollection.create({
      person_a: personId,
      person_b: partnerId,
      address_id: addressId,
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
