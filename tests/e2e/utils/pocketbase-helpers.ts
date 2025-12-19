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
 * Create an event via PocketBase API
 */
export async function createEvent(
  pb: PocketBase,
  data: {
    name: string;
    date: string;
    recurring?: boolean;
    notes?: string;
    event_type?: 'birthday' | 'anniversary';
    people_involved?: string;
  }
) {
  const eventData = {
    title: data.name,
    event_date: data.date,
    recurring_yearly: data.recurring || false,
    details: data.notes || '',
    event_type: data.event_type || 'birthday',
    people_involved: data.people_involved || 'Test Person',
    created_by: pb.authStore.model?.id,
  };

  console.log('[createEvent] Attempting to create event:', eventData);
  console.log('[createEvent] Auth state:', {
    isValid: pb.authStore.isValid,
    recordId: pb.authStore.model?.id,
    recordEmail: pb.authStore.model?.email,
  });

  try {
    const result = await pb.collection('events').create(eventData);
    console.log('[createEvent] Event created successfully:', result.id);
    return result;
  } catch (error) {
    console.error('[createEvent] Failed to create event:', error);
    console.error('[createEvent] Error details:', {
      status: (error as any).status,
      message: (error as any).message,
      data: (error as any).data,
    });
    throw error;
  }
}

/**
 * Create multiple events
 */
export async function createMultipleEvents(
  pb: PocketBase,
  events: Array<{
    name: string;
    date: string;
    recurring?: boolean;
    recurrence_type?: 'daily' | 'weekly' | 'monthly' | 'yearly';
    notes?: string;
  }>
) {
  // Create sequentially to avoid PocketBase auto-cancellation
  const results = [];
  for (const event of events) {
    const result = await createEvent(pb, event);
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
    // If collection doesn't exist or no access (admin auth vs user auth),
    // silently skip - this is expected for fresh test runs
    if (error.status === 404 || error.status === 403) {
      return;
    }
    throw error;
  }
}

/**
 * Delete all events (family-wide, not filtered by user)
 * Silently handles cases where collection doesn't exist or no access
 */
export async function deleteAllEvents(pb: PocketBase) {
  try {
    const records = await pb.collection('events').getFullList();

    if (records.length > 0) {
      const promises = records.map(record =>
        pb.collection('events').delete(record.id)
      );
      await Promise.all(promises);
    }
  } catch (error: any) {
    // If collection doesn't exist or no access (admin auth vs user auth),
    // silently skip - this is expected for fresh test runs
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
    // If collection doesn't exist or no access (admin auth vs user auth),
    // silently skip - this is expected for fresh test runs
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
    deleteAllEvents(pb),
    deleteAllGroceryItems(pb),
  ]);
}
