/**
 * `/dashboard?ask=<text>`: a link into the home with a question ready to go.
 * Empty states elsewhere use it ("Ask the assistant to add one"). The text is
 * put in the composer, unsent — the person reads it and presses Enter — and
 * the parameter is taken off the address straight away, so a reload or a
 * shared link doesn't keep re-filling the box.
 *
 * The hook returns the text only while it is in the address; the composer
 * writes it into its field (`usePrefillComposer`), which keeps it after the
 * strip, so no state has to carry it across.
 */

import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export const ASK_PARAM = 'ask';

/** The text to prefill the composer with, while `?ask=` is in the address. */
export function useAskPrefill(): string | undefined {
  const { pathname, search, hash } = useLocation();
  const navigate = useNavigate();
  const ask = new URLSearchParams(search).get(ASK_PARAM)?.trim() || undefined;

  useEffect(() => {
    if (!ask) return;
    const rest = new URLSearchParams(search);
    rest.delete(ASK_PARAM);
    const query = rest.toString();
    navigate({ pathname, search: query ? `?${query}` : '', hash }, { replace: true });
  }, [ask, search, pathname, hash, navigate]);

  return ask;
}
