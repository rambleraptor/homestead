/**
 * PocketBase Helper Functions for E2E Tests
 *
 * Direct API helpers for setting up test data
 */

import PocketBase from 'pocketbase';

/**
 * Create a gift card via PocketBase API
 */
export async function createGiftCard(
  pb: PocketBase,
  data: {
    merchant: string;
    amount: number;
    card_number?: string;
    pin?: string;
    notes?: string;
  }
) {
  // Generate a random card number if not provided (required field)
  const cardNumber = data.card_number || `TEST-${Date.now()}-${Math.random().toString(36).substring(7)}`;

  return await pb.collection('gift_cards').create({
    merchant: data.merchant,
    amount: data.amount,
    card_number: cardNumber,
    pin: data.pin || '',
    notes: data.notes || '',
    created_by: pb.authStore.model?.id,
  });
}

/**
 * Create multiple gift cards
 */
export async function createMultipleGiftCards(
  pb: PocketBase,
  cards: Array<{ merchant: string; amount: number; notes?: string }>
) {
  // Create sequentially to avoid PocketBase auto-cancellation
  const results = [];
  for (const card of cards) {
    const result = await createGiftCard(pb, card);
    results.push(result);
  }
  return results;
}

/**
 * Create a person via PocketBase API
 */
export async function createPerson(
  pb: PocketBase,
  data: {
    name: string;
    address?: string;
    birthday?: string;
    anniversary?: string;
  }
) {
  try {
    // Create person record (without address/anniversary - those go in shared_data)
    const person = await pb.collection('people').create({
      name: data.name,
      birthday: data.birthday,
      notification_preferences: ['day_of'],
      created_by: pb.authStore.model?.id,
    });

    // Create address and shared data if needed
    if (data.address || data.anniversary) {
      let addressId = null;

      // Create address if provided
      if (data.address) {
        const address = await pb.collection('addresses').create({
          line1: data.address,
          created_by: pb.authStore.model?.id,
        });
        addressId = address.id;
      }

      // Create shared data with address_id
      await pb.collection('person_shared_data').create({
        person_a: person.id,
        person_b: null,
        address_id: addressId,
        anniversary: data.anniversary,
        created_by: pb.authStore.model?.id,
      });
    }

    return person;
  } catch (error) {
    console.error('[createPerson] Failed to create person:', error);
    throw error;
  }
}

/**
 * Create multiple people
 */
export async function createMultiplePeople(
  pb: PocketBase,
  people: Array<{
    name: string;
    address?: string;
    birthday?: string;
    anniversary?: string;
  }>
) {
  // Create sequentially to avoid PocketBase auto-cancellation
  const results = [];
  for (const person of people) {
    const result = await createPerson(pb, person);
    results.push(result);
  }
  return results;
}

/**
 * Delete all gift cards (family-wide, not filtered by user)
 * Silently handles cases where collection doesn't exist or no access
 */
export async function deleteAllGiftCards(pb: PocketBase) {
  try {
    const records = await pb.collection('gift_cards').getFullList();

    if (records.length > 0) {
      const promises = records.map(record =>
        pb.collection('gift_cards').delete(record.id)
      );
      await Promise.all(promises);
    }
  } catch (error: any) {
    if (error.status === 404 || error.status === 403) {
      return;
    }
    throw error;
  }
}

/**
 * Get shared data for a person
 */
export async function getPersonSharedData(pb: PocketBase, personId: string) {
  try {
    const filter = `person_a = "${personId}" || person_b = "${personId}"`;
    const sharedData = await pb.collection('person_shared_data').getFirstListItem(filter);
    return sharedData;
  } catch (error: any) {
    // No shared data found
    if (error.status === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Delete all people (family-wide, not filtered by user)
 * Silently handles cases where collection doesn't exist or no access
 */
export async function deleteAllPeople(pb: PocketBase) {
  try {
    const records = await pb.collection('people').getFullList();

    if (records.length > 0) {
      const promises = records.map(record =>
        pb.collection('people').delete(record.id)
      );
      await Promise.all(promises);
    }
  } catch (error: any) {
    if (error.status === 404 || error.status === 403) {
      return;
    }
    throw error;
  }
}

/**
 * Delete all addresses (family-wide, not filtered by user)
 * Silently handles cases where collection doesn't exist or no access
 */
export async function deleteAllAddresses(pb: PocketBase) {
  try {
    const records = await pb.collection('addresses').getFullList();

    if (records.length > 0) {
      const promises = records.map(record =>
        pb.collection('addresses').delete(record.id)
      );
      await Promise.all(promises);
    }
  } catch (error: any) {
    if (error.status === 404 || error.status === 403) {
      return;
    }
    throw error;
  }
}

/**
 * Create a grocery item via PocketBase API
 */
export async function createGroceryItem(
  pb: PocketBase,
  data: {
    name: string;
    notes?: string;
    checked?: boolean;
    category?: string;
  }
) {
  return await pb.collection('groceries').create({
    name: data.name,
    notes: data.notes || '',
    checked: data.checked || false,
    category: data.category || 'Other',
    created_by: pb.authStore.model?.id,
  });
}

/**
 * Create multiple grocery items
 */
export async function createMultipleGroceryItems(
  pb: PocketBase,
  items: Array<{ name: string; notes?: string; checked?: boolean; category?: string }>
) {
  // Create sequentially to avoid PocketBase auto-cancellation
  const results = [];
  for (const item of items) {
    const result = await createGroceryItem(pb, item);
    results.push(result);
  }
  return results;
}

/**
 * Delete all grocery items (family-wide, not filtered by user)
 * Silently handles cases where collection doesn't exist or no access
 */
export async function deleteAllGroceryItems(pb: PocketBase) {
  try {
    const records = await pb.collection('groceries').getFullList();

    if (records.length > 0) {
      const promises = records.map(record =>
        pb.collection('groceries').delete(record.id)
      );
      await Promise.all(promises);
    }
  } catch (error: any) {
    if (error.status === 404 || error.status === 403) {
      return;
    }
    throw error;
  }
}

/**
 * Clean up all test data (for the entire family, not just one user)
 */
export async function cleanupUserData(pb: PocketBase) {
  await Promise.all([
    deleteAllGiftCards(pb),
    deleteAllPeople(pb),
    deleteAllAddresses(pb),
    deleteAllGroceryItems(pb),
  ]);
}
