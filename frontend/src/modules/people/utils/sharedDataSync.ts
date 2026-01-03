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
 * If shared_data_id is provided, links the address to that shared data.
 */
async function upsertAddress(
  addressData: AddressFormData,
  shared_data_id?: string
): Promise<string> {
  const currentUser = getCurrentUser();
  const addressesCollection = getCollection<Address>(Collections.ADDRESSES);

  if (addressData.id) {
    // Update existing address - don't include created_by
    const updatePayload = {
      line1: addressData.line1,
      line2: addressData.line2,
      city: addressData.city,
      state: addressData.state,
      postal_code: addressData.postal_code,
      country: addressData.country,
      wifi_network: addressData.wifi_network,
      wifi_password: addressData.wifi_password,
      shared_data_id: shared_data_id || undefined, // Explicitly clear if not provided
    };
    await addressesCollection.update(addressData.id, updatePayload);
    return addressData.id;
  } else {
    // Create new address
    const createPayload = {
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
    };
    const newAddress = await addressesCollection.create(createPayload);
    return newAddress.id;
  }
}

/**
 * Synchronizes addresses for shared data.
 * - First address becomes the primary (address_id on shared data)
 * - Additional addresses get linked via shared_data_id
 * - Deletes addresses that were removed from the form
 * Returns the primary address ID or undefined if no addresses.
 */
async function syncAddresses(
  addresses: AddressFormData[],
  sharedDataId: string
): Promise<string | undefined> {
  const addressesCollection = getCollection<Address>(Collections.ADDRESSES);

  // Filter out empty addresses
  const validAddresses = addresses.filter(
    addr => addr.line1 && addr.line1.trim() !== ''
  );

  if (validAddresses.length === 0) {
    return undefined;
  }

  // Get current address IDs from the form
  const formAddressIds = new Set(
    validAddresses.map(addr => addr.id).filter((id): id is string => !!id)
  );

  // Get all existing additional addresses for this shared data
  try {
    const existingAdditionalAddresses = await addressesCollection.getFullList({
      filter: `shared_data_id = "${sharedDataId}"`,
    });

    // Delete addresses that are no longer in the form
    for (const existingAddr of existingAdditionalAddresses) {
      if (!formAddressIds.has(existingAddr.id)) {
        await addressesCollection.delete(existingAddr.id);
      }
    }
  } catch {
    // No existing additional addresses or error fetching - continue
  }

  // 1. Upsert primary address (first one, no shared_data_id)
  const primaryAddressId = await upsertAddress(validAddresses[0]);

  // 2. Upsert additional addresses with shared_data_id link
  for (let i = 1; i < validAddresses.length; i++) {
    await upsertAddress(validAddresses[i], sharedDataId);
  }

  return primaryAddressId;
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

  // Filter valid addresses
  const validAddresses = data.addresses?.filter(
    addr => addr.line1 && addr.line1.trim() !== ''
  ) || [];

  // Create primary address if any
  let primaryAddressId: string | undefined;
  if (validAddresses.length > 0) {
    primaryAddressId = await upsertAddress(validAddresses[0]);
  }

  // Create shared data with primary address
  const sharedData = await sharedDataCollection.create({
    person_a: data.personId,
    person_b: undefined,
    address_id: primaryAddressId,
    anniversary: data.anniversary,
    created_by: currentUser?.id,
  });

  // Create additional addresses with shared_data_id link
  for (let i = 1; i < validAddresses.length; i++) {
    await upsertAddress(validAddresses[i], sharedData.id);
  }

  return sharedData;
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

  // Sync addresses if provided
  const primaryAddressId = data.addresses
    ? await syncAddresses(data.addresses, sharedDataId)
    : undefined;

  return await sharedDataCollection.update(sharedDataId, {
    address_id: primaryAddressId,
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
    // Sync addresses if provided, otherwise keep existing
    const primaryAddressId = sharedData?.addresses
      ? await syncAddresses(sharedData.addresses, existingSharedData.id)
      : existingSharedData.address_id;

    return await sharedDataCollection.update(existingSharedData.id, {
      person_b: partnerId,
      address_id: primaryAddressId,
      anniversary: sharedData?.anniversary || existingSharedData.anniversary,
    });
  } else if (!existingSharedData && partnerSharedData) {
    // Partner has shared data, person doesn't - add person to partner's shared data
    const primaryAddressId = sharedData?.addresses
      ? await syncAddresses(sharedData.addresses, partnerSharedData.id)
      : partnerSharedData.address_id;

    return await sharedDataCollection.update(partnerSharedData.id, {
      person_b: personId,
      address_id: primaryAddressId,
      anniversary: sharedData?.anniversary || partnerSharedData.anniversary,
    });
  } else if (existingSharedData && partnerSharedData) {
    // Both have shared data - merge into one (keep person's, delete partner's)
    let primaryAddressId: string | undefined;

    if (sharedData?.addresses) {
      // Use provided addresses
      primaryAddressId = await syncAddresses(sharedData.addresses, existingSharedData.id);
    } else {
      // Keep existing primary address (no merge needed with new approach)
      primaryAddressId = existingSharedData.address_id;
    }

    const mergedData = await sharedDataCollection.update(existingSharedData.id, {
      person_b: partnerId,
      address_id: primaryAddressId,
      anniversary: sharedData?.anniversary || existingSharedData.anniversary || partnerSharedData.anniversary,
    });

    // Delete partner's old shared data
    await sharedDataCollection.delete(partnerSharedData.id);

    return mergedData;
  } else {
    // Neither has shared data - create new
    // Filter valid addresses
    const validAddresses = sharedData?.addresses?.filter(
      addr => addr.line1 && addr.line1.trim() !== ''
    ) || [];

    // Create primary address if any
    let primaryAddressId: string | undefined;
    if (validAddresses.length > 0) {
      primaryAddressId = await upsertAddress(validAddresses[0]);
    }

    // Create shared data
    const newSharedData = await sharedDataCollection.create({
      person_a: personId,
      person_b: partnerId,
      address_id: primaryAddressId,
      anniversary: sharedData?.anniversary,
      created_by: currentUser?.id,
    });

    // Create additional addresses with shared_data_id link
    for (let i = 1; i < validAddresses.length; i++) {
      await upsertAddress(validAddresses[i], newSharedData.id);
    }

    return newSharedData;
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
