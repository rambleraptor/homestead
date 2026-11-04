/**
 * Tests for `useDisplayedLocation`.
 *
 * The whole point of the hook is *when* the displayed page changes: at once
 * where there is no View Transitions API (or the reader opted out, or the two
 * locations are one mounted page), and inside the transition's update
 * callback where there is one. happy-dom has no `startViewTransition`, so the
 * direct path is the default here and the API is stubbed on for the rest.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { canRunViewTransition, useDisplayedLocation } from '../useDisplayedLocation';

interface Loc {
  key: string;
  pathname: string;
}

const a: Loc = { key: 'a', pathname: '/todos' };
const b: Loc = { key: 'b', pathname: '/recipes' };
const c: Loc = { key: 'c', pathname: '/events' };

const never = () => false;

type Update = () => void | Promise<void>;

function stubViewTransitions() {
  const updates: Update[] = [];
  const startViewTransition = vi.fn((update: Update) => {
    updates.push(update);
    return {};
  });
  Object.defineProperty(document, 'startViewTransition', {
    configurable: true,
    writable: true,
    value: startViewTransition,
  });
  return { startViewTransition, updates };
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

function renderDisplayed(samePage: (from: Loc, to: Loc) => boolean = never) {
  return renderHook(({ loc }: { loc: Loc }) => useDisplayedLocation(loc, samePage), {
    initialProps: { loc: a },
  });
}

afterEach(() => {
  // happy-dom ships without the API; leave it that way for the next file.
  delete (document as { startViewTransition?: unknown }).startViewTransition;
  setReducedMotion(false);
});

describe('useDisplayedLocation', () => {
  it('swaps at once where the browser has no view transitions', () => {
    expect(canRunViewTransition()).toBe(false);
    const { result, rerender } = renderDisplayed();
    expect(result.current).toBe(a);

    rerender({ loc: b });
    expect(result.current).toBe(b);
  });

  it('holds the old page until the transition’s update runs', () => {
    const { startViewTransition, updates } = stubViewTransitions();
    const { result, rerender } = renderDisplayed();

    rerender({ loc: b });
    expect(startViewTransition).toHaveBeenCalledTimes(1);
    expect(result.current).toBe(a);

    act(() => void updates[0]());
    expect(result.current).toBe(b);
  });

  it('does not transition between locations on one mounted page', () => {
    const { startViewTransition } = stubViewTransitions();
    const { result, rerender } = renderDisplayed(() => true);

    rerender({ loc: b });
    expect(startViewTransition).not.toHaveBeenCalled();
    expect(result.current).toBe(b);
  });

  it('skips the transition for readers who asked for reduced motion', () => {
    const { startViewTransition } = stubViewTransitions();
    setReducedMotion(true);
    expect(canRunViewTransition()).toBe(false);
    const { result, rerender } = renderDisplayed();

    rerender({ loc: b });
    expect(startViewTransition).not.toHaveBeenCalled();
    expect(result.current).toBe(b);
  });

  it('lets a later navigation supersede a pending one', () => {
    const { startViewTransition, updates } = stubViewTransitions();
    const { result, rerender } = renderDisplayed();

    rerender({ loc: b });
    rerender({ loc: c });
    expect(startViewTransition).toHaveBeenCalledTimes(2);

    // The first update is stale: running it must not show the page it was for.
    act(() => void updates[0]());
    expect(result.current).toBe(a);

    act(() => void updates[1]());
    expect(result.current).toBe(c);
  });

  it('runs no transition when nothing changed', () => {
    const { startViewTransition } = stubViewTransitions();
    const { rerender } = renderDisplayed();
    rerender({ loc: a });
    expect(startViewTransition).not.toHaveBeenCalled();
  });
});
