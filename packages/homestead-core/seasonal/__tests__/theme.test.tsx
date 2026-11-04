/**
 * The seasonal theme on the document: the `data-holiday` attribute, the
 * theme-color meta and the favicon, set for the day and put back after it.
 * Runs against happy-dom's head, seeded with the tags index.html ships.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { applySeasonalTheme, emojiFaviconHref, msUntilMidnight, useSeasonalTheme } from '../theme';
import { HOLIDAYS } from '../../shared/utils/dateUtils';

const HEAD = `
  <meta name="theme-color" content="#F7F9FC" />
  <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />
  <link rel="icon" type="image/png" sizes="512x512" href="/icon-512.png" />
`;

const holiday = (id: string) => HOLIDAYS.find((h) => h.id === id)!;
const themeColor = () => document.head.querySelector('meta[name="theme-color"]')!.getAttribute('content');
const iconHrefs = () =>
  Array.from(document.head.querySelectorAll('link[rel="icon"]')).map((l) => l.getAttribute('href'));
const iconTypes = () =>
  Array.from(document.head.querySelectorAll('link[rel="icon"]')).map((l) => l.getAttribute('type'));

beforeEach(() => {
  document.head.innerHTML = HEAD;
  delete document.documentElement.dataset.holiday;
});

describe('applySeasonalTheme', () => {
  it('marks the root, shifts the theme color and swaps the favicon for an accented day', () => {
    applySeasonalTheme(document, holiday('halloween'));
    expect(document.documentElement.dataset.holiday).toBe('halloween');
    expect(themeColor()).toBe('#E0702B');
    expect(iconHrefs()).toEqual([emojiFaviconHref('🎃'), emojiFaviconHref('🎃')]);
    expect(iconTypes()).toEqual(['image/svg+xml', 'image/svg+xml']);
  });

  it('keeps the theme color on a day with no accent, but still swaps the favicon', () => {
    applySeasonalTheme(document, holiday('mothers-day'));
    expect(document.documentElement.dataset.holiday).toBe('mothers-day');
    expect(themeColor()).toBe('#F7F9FC');
    expect(iconHrefs()[0]).toBe(emojiFaviconHref('💐'));
  });

  it('restores the defaults it stashed when the day is over', () => {
    applySeasonalTheme(document, holiday('christmas'));
    applySeasonalTheme(document, null);
    expect(document.documentElement.dataset.holiday).toBeUndefined();
    expect(themeColor()).toBe('#F7F9FC');
    expect(iconHrefs()).toEqual(['/icon-192.png', '/icon-512.png']);
    expect(iconTypes()).toEqual(['image/png', 'image/png']);
    // The stash is what came from the document, not a later override.
    expect(document.head.querySelector('link[rel="icon"]')!.getAttribute('data-hs-default')).toBe('/icon-192.png');
  });

  it('moves from one day to the next without losing the original', () => {
    applySeasonalTheme(document, holiday('christmas-eve'));
    applySeasonalTheme(document, holiday('christmas'));
    expect(themeColor()).toBe('#C8403A');
    applySeasonalTheme(document, null);
    expect(iconHrefs()).toEqual(['/icon-192.png', '/icon-512.png']);
  });

  it('is a no-op on a document without the tags', () => {
    document.head.innerHTML = '';
    expect(() => applySeasonalTheme(document, holiday('halloween'))).not.toThrow();
    expect(() => applySeasonalTheme(document, null)).not.toThrow();
  });
});

describe('emojiFaviconHref', () => {
  it('is an SVG data URL carrying the emoji', () => {
    const href = emojiFaviconHref('🎃');
    expect(href.startsWith('data:image/svg+xml,')).toBe(true);
    expect(decodeURIComponent(href)).toContain('🎃');
  });
});

describe('msUntilMidnight', () => {
  it('reaches just past the next local midnight', () => {
    const at = new Date(2026, 9, 30, 23, 0, 0);
    expect(msUntilMidnight(at)).toBe(60 * 60 * 1000 + 1000);
  });
});

describe('useSeasonalTheme', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('dresses the document on mount and crosses midnight into and out of a holiday', () => {
    vi.setSystemTime(new Date(2026, 9, 30, 23, 30));
    const { unmount } = renderHook(() => useSeasonalTheme());
    expect(document.documentElement.dataset.holiday).toBeUndefined();
    expect(themeColor()).toBe('#F7F9FC');

    // Into Halloween.
    act(() => {
      vi.advanceTimersByTime(31 * 60 * 1000);
    });
    expect(document.documentElement.dataset.holiday).toBe('halloween');
    expect(themeColor()).toBe('#E0702B');
    expect(iconHrefs()[0]).toBe(emojiFaviconHref('🎃'));

    // And out again the next midnight.
    act(() => {
      vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    });
    expect(document.documentElement.dataset.holiday).toBeUndefined();
    expect(themeColor()).toBe('#F7F9FC');
    expect(iconHrefs()).toEqual(['/icon-192.png', '/icon-512.png']);

    unmount();
  });

  it('restores the defaults on unmount', () => {
    vi.setSystemTime(new Date(2026, 11, 25, 9));
    const { unmount } = renderHook(() => useSeasonalTheme());
    expect(document.documentElement.dataset.holiday).toBe('christmas');
    unmount();
    expect(document.documentElement.dataset.holiday).toBeUndefined();
    expect(themeColor()).toBe('#F7F9FC');
  });
});
