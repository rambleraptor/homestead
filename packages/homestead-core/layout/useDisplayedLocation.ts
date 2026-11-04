/**
 * The location the route renderer is *showing*, as distinct from the one the
 * router is at — the seam the View Transitions API needs.
 *
 * `document.startViewTransition(update)` snapshots the page, runs `update`,
 * snapshots again and animates between the two. For that to crossfade one
 * page into the next, the DOM has to still show the old page when the
 * snapshot is taken, and swap to the new one inside `update`. React Router
 * 6 has no global `viewTransition` flag, so this hook holds the swap back:
 * the router's location changes, the renderer keeps displaying the old one,
 * and the new one is committed (`flushSync`, so the swap lands inside the
 * callback rather than on React's own schedule) from within the transition.
 *
 * It swaps directly, with no transition, when:
 *   - the browser has no `startViewTransition` (Firefox, happy-dom, Playwright
 *     without the flag), so tests see no intermediate state;
 *   - the reader asked for reduced motion;
 *   - `samePage` says the two locations are one mounted page (routes sharing a
 *     `mountKey`: the home's `''` and `c/:id`), where only params change and a
 *     crossfade would read as the screen blinking.
 *
 * A second navigation during a transition supersedes the first: the browser
 * skips the pending one and the stale callback does nothing.
 */

import { useLayoutEffect, useState } from 'react';
import { flushSync } from 'react-dom';

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void | Promise<void>) => unknown;
};

/** Whether a navigation may run as a view transition here, right now. */
export function canRunViewTransition(): boolean {
  if (typeof document === 'undefined') return false;
  if (typeof (document as ViewTransitionDocument).startViewTransition !== 'function') return false;
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  }
  return true;
}

export function useDisplayedLocation<L>(
  location: L,
  samePage: (from: L, to: L) => boolean,
): L {
  const [displayed, setDisplayed] = useState(location);

  const animate =
    displayed !== location && !samePage(displayed, location) && canRunViewTransition();

  // No transition to run: catch the displayed location up during render
  // (React's sanctioned "adjust state while rendering" pattern), so the page
  // swaps in the same commit as the URL change.
  if (displayed !== location && !animate) {
    setDisplayed(location);
  }

  useLayoutEffect(() => {
    if (!animate) return;
    let stale = false;
    (document as ViewTransitionDocument).startViewTransition?.(() => {
      if (stale) return;
      flushSync(() => setDisplayed(location));
    });
    return () => {
      stale = true;
    };
  }, [animate, location]);

  return animate ? displayed : location;
}
