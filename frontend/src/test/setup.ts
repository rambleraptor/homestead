/**
 * Vitest Setup File
 *
 * Runs before all tests and sets up the testing environment.
 */

import '@testing-library/jest-dom';
import { afterEach, vi, beforeAll, afterAll } from 'vitest';
import { cleanup } from '@testing-library/react';

// matchMedia stub for jsdom
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

afterEach(() => {
  cleanup();
});

// Mock the aepbase client. Tests that need specific behavior can override
// these via vi.mocked(...) on the exported names.
class MockAepbaseError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly url: string,
  ) {
    super(message);
    this.name = 'AepbaseError';
  }
}
vi.mock('@/core/api/aepbase', () => ({
  AepbaseError: MockAepbaseError,
  aepbase: {
    list: vi.fn(async () => []),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    download: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    refreshCurrentUser: vi.fn(),
    getCurrentUser: vi.fn(() => ({
      id: 'test-user-id',
      email: 'test@example.com',
      name: 'Test User',
      username: 'test@example.com',
      verified: true,
      created: '2024-01-01T00:00:00Z',
      updated: '2024-01-01T00:00:00Z',
    })),
    authStore: {
      token: 'test-token',
      isValid: true,
      model: { id: 'test-user-id' },
      save: vi.fn(),
      clear: vi.fn(),
      onChange: vi.fn(() => () => undefined),
    },
  },
  AepCollections: {
    USERS: 'users',
    USER_PREFERENCES: 'preferences',
    GIFT_CARDS: 'gift-cards',
    GIFT_CARD_TRANSACTIONS: 'transactions',
    PEOPLE: 'people',
    PERSON_SHARED_DATA: 'person-shared-data',
    ADDRESSES: 'addresses',
    NOTIFICATIONS: 'notifications',
    NOTIFICATION_SUBSCRIPTIONS: 'notification-subscriptions',
    GROCERIES: 'groceries',
    STORES: 'stores',
    HSA_RECEIPTS: 'hsa-receipts',
    CREDIT_CARDS: 'credit-cards',
    CREDIT_CARD_PERKS: 'perks',
    PERK_REDEMPTIONS: 'redemptions',
    RECIPES: 'recipes',
    RECIPE_LOGS: 'logs',
    GAMES: 'games',
    GAME_HOLES: 'holes',
    PICTIONARY_GAMES: 'pictionary-games',
    PICTIONARY_TEAMS: 'pictionary-teams',
    MODULE_FLAGS: 'module-flags',
  },
}));

// Suppress noisy jsdom error about form submission
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('Not implemented: HTMLFormElement.prototype.submit')
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});
