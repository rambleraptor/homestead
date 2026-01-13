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
    store?: string;
  }
) {
  return await pb.collection('groceries').create({
    name: data.name,
    notes: data.notes || '',
    checked: data.checked || false,
    category: data.category || 'Other',
    store: data.store || '',
    created_by: pb.authStore.model?.id,
  });
}

/**
 * Create multiple grocery items
 */
export async function createMultipleGroceryItems(
  pb: PocketBase,
  items: Array<{ name: string; notes?: string; checked?: boolean; category?: string; store?: string }>
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
 * Create a store via PocketBase API
 */
export async function createStore(
  pb: PocketBase,
  data: {
    name: string;
    sort_order?: number;
  }
) {
  return await pb.collection('stores').create({
    name: data.name,
    sort_order: data.sort_order ?? 0,
    created_by: pb.authStore.model?.id,
  });
}

/**
 * Create multiple stores
 */
export async function createMultipleStores(
  pb: PocketBase,
  stores: Array<{ name: string; sort_order?: number }>
) {
  // Create sequentially to avoid PocketBase auto-cancellation
  const results = [];
  for (const store of stores) {
    const result = await createStore(pb, store);
    results.push(result);
  }
  return results;
}

/**
 * Delete all stores (family-wide, not filtered by user)
 * Silently handles cases where collection doesn't exist or no access
 */
export async function deleteAllStores(pb: PocketBase) {
  try {
    const records = await pb.collection('stores').getFullList();

    if (records.length > 0) {
      const promises = records.map(record =>
        pb.collection('stores').delete(record.id)
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
 * Get all grocery items for the current user
 */
export async function getGroceryItems(pb: PocketBase) {
  try {
    return await pb.collection('groceries').getFullList();
  } catch (error: any) {
    if (error.status === 404 || error.status === 403) {
      return [];
    }
    throw error;
  }
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
 * Create an HSA receipt via PocketBase API
 * Note: receipt_file is not created in tests (would require file upload)
 */
export async function createHSAReceipt(
  pb: PocketBase,
  data: {
    merchant: string;
    service_date: string;
    amount: number;
    category: 'Medical' | 'Dental' | 'Vision' | 'Rx';
    patient?: string;
    status: 'Stored' | 'Reimbursed';
    notes?: string;
  }
) {
  // For e2e tests, we create a minimal valid JPEG file with proper magic bytes
  // In a real scenario, users would upload actual receipt images/PDFs
  const minimalJpegBytes = new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9
  ]);
  const testFile = new File([minimalJpegBytes], 'test-receipt.jpg', { type: 'image/jpeg' });

  const formData = new FormData();
  formData.append('merchant', data.merchant);
  formData.append('service_date', data.service_date);
  formData.append('amount', data.amount.toString());
  formData.append('category', data.category);
  formData.append('status', data.status);
  formData.append('receipt_file', testFile);

  if (data.patient) {
    formData.append('patient', data.patient);
  }

  if (data.notes) {
    formData.append('notes', data.notes);
  }

  if (pb.authStore.model?.id) {
    formData.append('created_by', pb.authStore.model.id);
  }

  return await pb.collection('hsa_receipts').create(formData);
}

/**
 * Create multiple HSA receipts
 */
export async function createMultipleHSAReceipts(
  pb: PocketBase,
  receipts: Array<{
    merchant: string;
    service_date: string;
    amount: number;
    category: 'Medical' | 'Dental' | 'Vision' | 'Rx';
    patient?: string;
    status: 'Stored' | 'Reimbursed';
    notes?: string;
  }>
) {
  // Create sequentially to avoid PocketBase auto-cancellation
  const results = [];
  for (const receipt of receipts) {
    const result = await createHSAReceipt(pb, receipt);
    results.push(result);
  }
  return results;
}

/**
 * Delete all HSA receipts (family-wide, not filtered by user)
 * Silently handles cases where collection doesn't exist or no access
 */
export async function deleteAllHSAReceipts(pb: PocketBase) {
  try {
    const records = await pb.collection('hsa_receipts').getFullList();

    if (records.length > 0) {
      const promises = records.map(record =>
        pb.collection('hsa_receipts').delete(record.id)
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
    deleteAllStores(pb),
    deleteAllHSAReceipts(pb),
  ]);
}
