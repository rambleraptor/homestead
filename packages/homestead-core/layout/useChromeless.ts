/**
 * Whether the app chrome (sidebar + top bar) is hidden — see `chromeMode.ts`.
 *
 * Reads `?chrome=none` / `?chrome=full` off every navigation and persists the
 * answer for the session, so the mode survives client-side navigation (which
 * drops the query string) and a redirect through the login page.
 */

import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { chromeModeFromSearch, readChromeless, writeChromeless, CHROME_NONE } from './chromeMode';

export function useChromeless(): boolean {
  const { search } = useLocation();
  const [chromeless, setChromeless] = useState(readChromeless);

  // Resolve during render (not in an effect) so the first paint of a
  // `?chrome=none` launch is already chromeless — no flash of sidebar.
  const requested = chromeModeFromSearch(search);
  if (requested !== null) {
    const next = requested === CHROME_NONE;
    if (next !== chromeless) {
      writeChromeless(next);
      setChromeless(next);
    }
  }

  return requested !== null ? requested === CHROME_NONE : chromeless;
}
