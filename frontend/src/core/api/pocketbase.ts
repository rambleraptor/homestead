/**
 * PocketBase Client Configuration
 *
 * Singleton instance of PocketBase client for the entire application.
 * All API calls should use this instance.
 */

import PocketBase from 'pocketbase';
import type { User } from '../auth/types';

// Use the Next.js proxy by default (/api/pb)
// This avoids CORS issues and Cloudflare Access blocking
// The proxy is configured in next.config.ts
const PB_URL = process.env.NEXT_PUBLIC_POCKETBASE_URL || '/api/pb';

/**
 * Typed PocketBase client with User type
 */
export const pb = new PocketBase(PB_URL);

/**
 * Configure PocketBase client
 */
pb.autoCancellation(false); // Prevent request cancellation on component unmount

/**
 * Type-safe collection names
 */
export const Collections = {
  USERS: 'users',
  USER_ROLES: 'user_roles',
  MODULE_PERMISSIONS: 'module_permissions',
  AUDIT_LOG: 'audit_log',
  GIFT_CARDS: 'gift_cards',
  GIFT_CARD_TRANSACTIONS: 'gift_card_transactions',
  PEOPLE: 'people',
  PERSON_SHARED_DATA: 'person_shared_data',
  ADDRESSES: 'addresses',
  NOTIFICATIONS: 'notifications',
  NOTIFICATION_SUBSCRIPTIONS: 'notification_subscriptions',
  RECURRING_NOTIFICATIONS: 'recurring_notifications',
  GROCERIES: 'groceries',
  STORES: 'stores',
  RECIPES: 'recipes',
  COOKING_LOGS: 'cooking_logs',
  HSA_RECEIPTS: 'hsa_receipts',
  CREDIT_CARDS: 'credit_cards',
  CREDIT_CARD_PERKS: 'credit_card_perks',
  PERK_REDEMPTIONS: 'perk_redemptions',
} as const;

/**
 * Get the current authenticated user with proper typing
 */
export function getCurrentUser(): User | null {
  const authStore = pb.authStore;
  if (!authStore.isValid || !authStore.model) {
    return null;
  }
  return authStore.model as unknown as User;
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
  return pb.authStore.isValid;
}

/**
 * Get auth token
 */
export function getAuthToken(): string | null {
  return pb.authStore.token || null;
}

/**
 * Clear auth data
 */
export function clearAuth(): void {
  pb.authStore.clear();
}

/**
 * Subscribe to auth state changes
 */
export function onAuthChange(callback: (token: string, model: User | null) => void) {
  return pb.authStore.onChange((token, model) => {
    callback(token, model as unknown as User | null);
  });
}

/**
 * Realtime subscription helper
 */
export function subscribeToCollection<T = unknown>(
  collection: string,
  callback: (data: { action: string; record: T }) => void
) {
  return pb.collection(collection).subscribe('*', (data) => {
    callback(data as { action: string; record: T });
  });
}

/**
 * Type-safe collection getter
 */
export function getCollection<T = unknown>(name: string) {
  return pb.collection(name) as unknown as {
    getFullList: (options?: unknown) => Promise<T[]>;
    getList: (page: number, perPage: number, options?: unknown) => Promise<{
      page: number;
      perPage: number;
      totalItems: number;
      totalPages: number;
      items: T[];
    }>;
    getOne: (id: string, options?: unknown) => Promise<T>;
    getFirstListItem: (filter: string, options?: unknown) => Promise<T>;
    create: (data: Partial<T> | FormData, options?: unknown) => Promise<T>;
    update: (id: string, data: Partial<T> | FormData, options?: unknown) => Promise<T>;
    delete: (id: string) => Promise<boolean>;
    subscribe: (
      idOrFilter: string,
      callback: (data: { action: string; record: T }) => void
    ) => Promise<() => void>;
  };
}

/**
 * Server-side: create a PocketBase instance authenticated via request header
 */
export function getPocketBase(request: { headers: { get(name: string): string | null } }): PocketBase {
  const serverPb = new PocketBase(process.env.NEXT_PUBLIC_POCKETBASE_URL || 'http://127.0.0.1:8090');
  const token = request.headers.get('Authorization') || '';
  serverPb.authStore.save(token, null);
  return serverPb;
}

/**
 * Client-side hook: returns the singleton PocketBase instance
 */
export function usePocketBase(): PocketBase {
  return pb;
}

export default pb;
