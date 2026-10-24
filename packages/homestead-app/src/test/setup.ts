/**
 * Vitest Setup File
 *
 * Runs before all tests and sets up the testing environment.
 */

import '@testing-library/jest-dom';
import { afterEach, vi, beforeAll, afterAll } from 'vitest';
import { cleanup } from '@testing-library/react';
import { initializeAppRegistry } from '@rambleraptor/homestead-core/apps/registry';
import { applyHappyDomFixes } from '@rambleraptor/homestead-test-harness/vm/happy-dom-fixes';

// The same browser-behavior patches the VM tier applies to its window.
applyHappyDomFixes(window as unknown as Parameters<typeof applyHappyDomFixes>[0]);

// Bootstrap the app registry with an empty operator list. The
// always-installed core apps (settings/users/superuser) are enough
// for hooks like `useAppFlags` to function during unit tests; tests
// that need a richer registry can re-initialize themselves. Note: we do
// NOT import the real `homestead.config.ts` here — that would eagerly
// load every feature app's component tree before per-test `vi.mock`
// calls take effect, freezing the wrong module bindings.
initializeAppRegistry([]);

// matchMedia stub, a vi.fn so tests can override it
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
// these via vi.mocked(...) on the exported names. The error class is
// defined inside the factory because `vi.mock` is hoisted above any
// top-level declarations in this file — a sibling reference would hit a
// TDZ error the first time the factory runs.
vi.mock('@rambleraptor/homestead-core/api/aepbase', () => {
  class AepbaseError extends Error {
    constructor(
      public readonly code: number,
      message: string,
      public readonly url: string,
    ) {
      super(message);
      this.name = 'AepbaseError';
    }
  }
  return {
    AepbaseError,
    aepbase: {
      list: vi.fn(async () => []),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      download: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
      changePassword: vi.fn(),
      logoutEverywhere: vi.fn(),
      refreshCurrentUser: vi.fn(),
      listOAuthProviders: vi.fn(async () => []),
      startOAuth: vi.fn(),
      completeOAuthLogin: vi.fn(),
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
  };
});

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
