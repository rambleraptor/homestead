/**
 * The day's flavour on the document: a `data-holiday` attribute on `<html>`
 * that `seasonal.css` keys its accent overrides on, the browser's
 * `theme-color` shifted to the holiday's accent, and the favicon swapped for
 * the holiday's emoji. Mounted once in the shell (`useSeasonalTheme`), it
 * re-checks at midnight so a tab left open crosses into the holiday — and
 * back out of it — on its own.
 *
 * Like `shared/pwa/homeScreenIcon.ts`, the first touch of each element stashes
 * its original value in `data-hs-default`, so the defaults are restored from
 * the document itself rather than from module state.
 */

import { useEffect } from 'react';
import { getTodaysHoliday, type Holiday } from '@rambleraptor/homestead-core/shared/utils/dateUtils';

const DEFAULT_THEME_COLOR = '#F7F9FC';
const DEFAULT_ICON_TYPE = 'image/png';

/** An SVG data URL drawing `emoji` as a favicon. */
export function emojiFaviconHref(emoji: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
    `<text x="32" y="52" font-size="52" text-anchor="middle">${emoji}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** Record the element's current attribute value once, before it is overwritten. */
function stashDefault(el: Element, attr: string, fallback: string, key = 'data-hs-default'): void {
  if (!el.hasAttribute(key)) el.setAttribute(key, el.getAttribute(attr) ?? fallback);
}

function restoreDefault(el: Element, attr: string, fallback: string, key = 'data-hs-default'): void {
  el.setAttribute(attr, el.getAttribute(key) ?? fallback);
}

/**
 * Dress the document for `holiday`, or undress it for `null`. Idempotent:
 * applying the same holiday twice, or none twice, changes nothing.
 */
export function applySeasonalTheme(doc: Document, holiday: Holiday | null): void {
  const root = doc.documentElement;
  if (holiday) root.dataset.holiday = holiday.id;
  else delete root.dataset.holiday;

  const themeColor = doc.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (themeColor) {
    if (holiday?.accent) {
      stashDefault(themeColor, 'content', DEFAULT_THEME_COLOR);
      themeColor.setAttribute('content', holiday.accent);
    } else {
      restoreDefault(themeColor, 'content', DEFAULT_THEME_COLOR);
    }
  }

  for (const icon of doc.head.querySelectorAll<HTMLLinkElement>('link[rel="icon"]')) {
    if (holiday) {
      stashDefault(icon, 'href', '');
      stashDefault(icon, 'type', DEFAULT_ICON_TYPE, 'data-hs-default-type');
      icon.setAttribute('href', emojiFaviconHref(holiday.emoji));
      icon.setAttribute('type', 'image/svg+xml');
    } else if (icon.hasAttribute('data-hs-default')) {
      restoreDefault(icon, 'href', '');
      restoreDefault(icon, 'type', DEFAULT_ICON_TYPE, 'data-hs-default-type');
    }
  }
}

/** Milliseconds from `now` to the next local midnight (plus a beat, so the new day has begun). */
export function msUntilMidnight(now: Date = new Date()): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
  return Math.max(1000, next.getTime() - now.getTime());
}

/**
 * Keep the document dressed for today's holiday. Mount once, high in the
 * shell; it re-checks at each midnight and restores the defaults on unmount.
 */
export function useSeasonalTheme(): void {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      applySeasonalTheme(document, getTodaysHoliday());
      timer = setTimeout(tick, msUntilMidnight());
    };
    tick();
    return () => {
      clearTimeout(timer);
      applySeasonalTheme(document, null);
    };
  }, []);
}
