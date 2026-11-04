/**
 * Haptic feedback, for the moments a phone user feels before they see: a row
 * checked off, a swipe action committing, a small win.
 *
 * Built on `navigator.vibrate`, which Android browsers honour and iOS Safari
 * ignores (it has no web haptics at all), so every call is a courtesy and
 * never something the UI waits on. Silent when the reader has asked for
 * reduced motion — a buzz is motion you feel — and in any environment without
 * the API (desktop browsers, happy-dom, tests).
 */

export type HapticKind = 'tap' | 'success' | 'warning';

/** Patterns in ms: a single short pulse, a double pulse, a longer buzz. */
const PATTERNS: Record<HapticKind, number | number[]> = {
  tap: 10,
  success: [10, 40, 20],
  warning: 35,
};

function reducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Fire one of the named patterns; a no-op wherever haptics aren't available. */
export function haptic(kind: HapticKind): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  if (reducedMotion()) return;
  try {
    navigator.vibrate(PATTERNS[kind]);
  } catch {
    // Some browsers throw when vibration is blocked (no user activation yet).
  }
}
