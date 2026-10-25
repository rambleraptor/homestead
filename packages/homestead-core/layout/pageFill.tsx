/**
 * Page fill: a page that lays itself out as a canvas filling the main area —
 * no container padding, its own scrolling — rather than as content that
 * scrolls under the shell's padding. The agentic home uses it so the
 * conversation can take the whole screen below the top bar, with the composer
 * docked at the bottom, instead of guessing the chrome's height.
 *
 * `AppShell` provides the setter; a page opts in with `useFillPage()` for as
 * long as it's mounted.
 */

import { createContext, useContext, useLayoutEffect } from 'react';

export const PageFillContext = createContext<(fill: boolean) => void>(() => {});

/** Lay this page out as a full-height canvas while it's mounted. */
export function useFillPage(): void {
  const setFill = useContext(PageFillContext);
  // A layout effect, so the shell switches before the first paint — the page
  // never shows up padded for a frame.
  useLayoutEffect(() => {
    setFill(true);
    return () => setFill(false);
  }, [setFill]);
}
