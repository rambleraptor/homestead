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
  return await pb.collection('gift_cards').create({
    merchant: data.merchant,
    amount: data.amount,
    card_number: data.card_number || '',
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
  const promises = cards.map(card => createGiftCard(pb, card));
  return await Promise.all(promises);
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
    recurrence_type?: 'daily' | 'weekly' | 'monthly' | 'yearly';
    notes?: string;
  }
) {
  return await pb.collection('events').create({
    name: data.name,
    date: data.date,
    recurring: data.recurring || false,
    recurrence_type: data.recurrence_type || '',
    notes: data.notes || '',
    created_by: pb.authStore.model?.id,
  });
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
  const promises = events.map(event => createEvent(pb, event));
  return await Promise.all(promises);
}

/**
 * Delete all gift cards (family-wide, not filtered by user)
 */
export async function deleteAllGiftCards(pb: PocketBase) {
  const records = await pb.collection('gift_cards').getFullList();

  const promises = records.map(record =>
    pb.collection('gift_cards').delete(record.id)
  );

  await Promise.all(promises);
}

/**
 * Delete all events (family-wide, not filtered by user)
 */
export async function deleteAllEvents(pb: PocketBase) {
  const records = await pb.collection('events').getFullList();

  const promises = records.map(record =>
    pb.collection('events').delete(record.id)
  );

  await Promise.all(promises);
}

/**
 * Clean up all test data (for the entire family, not just one user)
 */
export async function cleanupUserData(pb: PocketBase) {
  await Promise.all([
    deleteAllGiftCards(pb),
    deleteAllEvents(pb),
  ]);
}
