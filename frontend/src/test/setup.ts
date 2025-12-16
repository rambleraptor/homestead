/**
 * Vitest Setup File
 *
 * This file runs before all tests and sets up the testing environment
 */

import '@testing-library/jest-dom';
import { afterEach, vi, beforeAll, afterAll } from 'vitest';
import { cleanup } from '@testing-library/react';

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
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

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock PocketBase
vi.mock('@/core/api/pocketbase', () => ({
  pb: {
    authStore: {
      isValid: true,
      model: { id: 'test-user-id', email: 'test@example.com' },
      token: 'test-token',
      clear: vi.fn(),
      onChange: vi.fn(),
    },
    collection: vi.fn(),
  },
  Collections: {
    USERS: 'users',
    USER_ROLES: 'user_roles',
    MODULE_PERMISSIONS: 'module_permissions',
    AUDIT_LOG: 'audit_log',
    GIFT_CARDS: 'gift_cards',
    GIFT_CARD_TRANSACTIONS: 'gift_card_transactions',
    EVENTS: 'events',
    NOTIFICATIONS: 'notifications',
    NOTIFICATION_SUBSCRIPTIONS: 'notification_subscriptions',
  },
  getCurrentUser: vi.fn(() => ({
    id: 'test-user-id',
    email: 'test@example.com',
    name: 'Test User',
  })),
  isAuthenticated: vi.fn(() => true),
  getAuthToken: vi.fn(() => 'test-token'),
  clearAuth: vi.fn(),
  onAuthChange: vi.fn(),
  getCollection: vi.fn(),
}));

// Suppress console errors in tests (optional, can be removed if you want to see them)
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
