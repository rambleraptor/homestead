/**
 * Whether a media query matches, kept live.
 *
 * Same shape as `useReducedMotion`, for the other environment questions a
 * component has to ask at runtime rather than in CSS — chiefly whether the
 * pointer is a finger (`(pointer: coarse)`), which decides if a touch gesture
 * is worth listening for at all. Where there is no `matchMedia` (SSR, old
 * DOMs) the answer is `false`, and happy-dom answers `false` to every feature
 * query it doesn't model, so a gesture gated on this is inert in tests.
 */

import { useEffect, useState } from 'react';

function matches(query: string): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(query).matches;
}

export function useMediaQuery(query: string): boolean {
  const [matched, setMatched] = useState(() => matches(query));

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const list = window.matchMedia(query);
    const onChange = () => setMatched(list.matches);
    onChange();
    list.addEventListener?.('change', onChange);
    return () => list.removeEventListener?.('change', onChange);
  }, [query]);

  return matched;
}
