import { getCollection, getCurrentUser, Collections } from '@/core/api/pocketbase';
import type { PersonSharedData } from '../types';

/**
 * Finds shared data for a given person.
 * Searches where person_a = personId OR person_b = personId
 */
export async function findSharedDataForPerson(
  personId: string
): Promise<PersonSharedData | null> {
  try {
    const sharedDataCollection = getCollection<PersonSharedData>(Collections.PERSON_SHARED_DATA);

    // Query for shared data where person is either person_a or person_b
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
  address?: string;
  anniversary?: string;
}): Promise<PersonSharedData> {
  const currentUser = getCurrentUser();
  const sharedDataCollection = getCollection<PersonSharedData>(Collections.PERSON_SHARED_DATA);

  return await sharedDataCollection.create({
    person_a: data.personId,
    person_b: undefined,
    address: data.address,
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
    address?: string;
    anniversary?: string;
  }
): Promise<PersonSharedData> {
  const sharedDataCollection = getCollection<PersonSharedData>(Collections.PERSON_SHARED_DATA);

  return await sharedDataCollection.update(sharedDataId, data);
}

/**
 * Adds a partner to existing shared data or creates new shared data with partner.
 */
export async function setPartner(
  personId: string,
  partnerId: string,
  sharedData?: {
    address?: string;
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
    return await sharedDataCollection.update(existingSharedData.id, {
      person_b: partnerId,
      ...sharedData,
    });
  } else if (!existingSharedData && partnerSharedData) {
    // Partner has shared data, person doesn't - add person to partner's shared data
    return await sharedDataCollection.update(partnerSharedData.id, {
      person_b: personId,
      ...sharedData,
    });
  } else if (existingSharedData && partnerSharedData) {
    // Both have shared data - merge into one (keep person's, delete partner's)
    const mergedData = await sharedDataCollection.update(existingSharedData.id, {
      person_b: partnerId,
      address: sharedData?.address || existingSharedData.address || partnerSharedData.address,
      anniversary: sharedData?.anniversary || existingSharedData.anniversary || partnerSharedData.anniversary,
    });

    // Delete partner's old shared data
    await sharedDataCollection.delete(partnerSharedData.id);

    return mergedData;
  } else {
    // Neither has shared data - create new
    return await sharedDataCollection.create({
      person_a: personId,
      person_b: partnerId,
      address: sharedData?.address,
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

  // Create new shared data for the other person
  await sharedDataCollection.create({
    person_a: otherPersonId || '',
    person_b: undefined,
    address: sharedData.address,
    anniversary: sharedData.anniversary,
    created_by: currentUser?.id,
  });

  // Update current shared data to remove partner
  await sharedDataCollection.update(sharedData.id, {
    person_b: undefined,
  });
}

/**
 * Deletes shared data for a person.
 */
export async function deleteSharedData(sharedDataId: string): Promise<void> {
  const sharedDataCollection = getCollection<PersonSharedData>(Collections.PERSON_SHARED_DATA);
  await sharedDataCollection.delete(sharedDataId);
}
