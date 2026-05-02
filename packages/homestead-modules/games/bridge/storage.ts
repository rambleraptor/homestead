/**
 * Local storage backend for the Bridge module.
 *
 * Hands are persisted as a single JSON array under one localStorage key.
 * Reads/writes are synchronous; `loadHands` returns `[]` whenever the
 * key is missing, malformed, or unavailable (SSR / private browsing).
 */

import type { Hand } from './types';

const STORAGE_KEY = 'bridge:hands';

function hasStorage(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage;
}

export function loadHands(): Hand[] {
  if (!hasStorage()) return [];
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Hand[]) : [];
  } catch {
    return [];
  }
}

export function saveHands(hands: Hand[]): void {
  if (!hasStorage()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(hands));
}

export function clearHands(): void {
  if (!hasStorage()) return;
  window.localStorage.removeItem(STORAGE_KEY);
}

/** Generate a stable id for a freshly-created hand. */
export function newHandId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `hand_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
