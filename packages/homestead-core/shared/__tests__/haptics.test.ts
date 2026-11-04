/**
 * `haptic()` is a courtesy that must never become a cost: the contract worth
 * locking down is that each kind sends its own pattern, that nothing is sent
 * for readers who asked for reduced motion or in browsers without the API,
 * and that a browser refusing the call (no user activation yet) is swallowed.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { haptic } from '../haptics';

const originalVibrate = Object.getOwnPropertyDescriptor(navigator, 'vibrate');

function installVibrate(impl: ((pattern: number | number[]) => boolean) | undefined) {
  if (impl) {
    Object.defineProperty(navigator, 'vibrate', { configurable: true, writable: true, value: impl });
  } else {
    Object.defineProperty(navigator, 'vibrate', { configurable: true, writable: true, value: undefined });
  }
}

function setReducedMotion(reduce: boolean) {
  vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
    matches: reduce && query === '(prefers-reduced-motion: reduce)',
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

describe('haptic', () => {
  let vibrate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vibrate = vi.fn().mockReturnValue(true);
    installVibrate(vibrate as unknown as (pattern: number | number[]) => boolean);
    setReducedMotion(false);
  });

  afterEach(() => {
    if (originalVibrate) {
      Object.defineProperty(navigator, 'vibrate', originalVibrate);
    } else {
      // happy-dom has no vibrate; put it back to absent.
      installVibrate(undefined);
    }
  });

  it('sends a distinct pattern per kind', () => {
    haptic('tap');
    haptic('success');
    haptic('warning');
    expect(vibrate.mock.calls).toEqual([[10], [[10, 40, 20]], [35]]);
  });

  it('is silent when reduced motion is requested', () => {
    setReducedMotion(true);
    haptic('tap');
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('is a no-op without the API', () => {
    installVibrate(undefined);
    expect(() => haptic('success')).not.toThrow();
  });

  it('swallows a browser refusing the call', () => {
    vibrate.mockImplementation(() => {
      throw new Error('no user activation');
    });
    expect(() => haptic('tap')).not.toThrow();
    expect(vibrate).toHaveBeenCalledTimes(1);
  });
});
