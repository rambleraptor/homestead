/**
 * Test Data for E2E Tests
 *
 * Centralized test data definitions
 */

export const testUsers = {
  user1: {
    email: 'user1@test.local',
    password: 'TestPassword123!',
    passwordConfirm: 'TestPassword123!',
    name: 'Test User 1',
  },
  user2: {
    email: 'user2@test.local',
    password: 'TestPassword123!',
    passwordConfirm: 'TestPassword123!',
    name: 'Test User 2',
  },
};

export const testGiftCards = [
  {
    merchant: 'Amazon',
    card_number: '1234-5678-9012-3456',
    amount: 50.00,
    notes: 'Birthday gift',
  },
  {
    merchant: 'Starbucks',
    card_number: '2345-6789-0123-4567',
    amount: 25.00,
    notes: 'Coffee gift card',
  },
  {
    merchant: 'Target',
    card_number: '3456-7890-1234-5678',
    amount: 100.00,
    notes: 'Holiday shopping',
  },
  {
    merchant: 'Amazon',
    card_number: '4567-8901-2345-6789',
    amount: 30.00,
    notes: 'Another Amazon card',
  },
];

export const testEvents = [
  {
    name: "Mom's Birthday",
    date: '1965-06-15',
    recurring: true,
    recurrence_type: 'yearly',
  },
  {
    name: "Dad's Birthday",
    date: '1963-03-20',
    recurring: true,
    recurrence_type: 'yearly',
  },
  {
    name: 'Anniversary',
    date: '1995-08-12',
    recurring: true,
    recurrence_type: 'yearly',
  },
  {
    name: 'One-time Event',
    date: getFutureDate(30),
    recurring: false,
  },
];

/**
 * Get a future date as YYYY-MM-DD string
 */
export function getFutureDate(daysFromNow: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().split('T')[0];
}

/**
 * Get a past date as YYYY-MM-DD string
 */
export function getPastDate(daysAgo: number): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().split('T')[0];
}

/**
 * Format date as displayed in UI (e.g., "Jun 15, 1965")
 */
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Test grocery items
 */
export const testGroceryItems = [
  { name: 'Milk', notes: '2% organic', category: 'Dairy & Eggs' },
  { name: 'Apples', notes: 'Honeycrisp', category: 'Produce' },
  { name: 'Chicken Breast', notes: '2 lbs', category: 'Meat & Seafood' },
  { name: 'Bread', notes: 'Whole wheat', category: 'Bakery' },
  { name: 'Yogurt', notes: 'Greek yogurt', category: 'Dairy & Eggs' },
  { name: 'Bananas', category: 'Produce' },
  { name: 'Cereal', category: 'Pantry & Canned Goods' },
];
