/**
 * Names for the View Transitions API, so a record's card on a list and its
 * hero on the detail page are the *same* element to the browser: opening one
 * grows the card into the page instead of cutting to it.
 *
 * Usage, on both ends of the journey:
 *
 *   <img style={viewTransitionName('recipe', recipe.id)} … />   // the list card
 *   <img style={viewTransitionName('recipe', recipe.id)} … />   // the detail hero
 *
 * The convention: the list card and the detail hero for one record carry the
 * *same* name (`<kind>-<id>`), and nothing else on either page does. The
 * browser then pairs them across the navigation and glides the card into the
 * hero's place while the rest of the page crossfades underneath. Name the one
 * element that visually survives the journey — the image or the title block —
 * not the whole card, or the glide drags the card's buttons along with it.
 *
 * The page-level crossfade and the `startViewTransition` call live in the SPA's
 * route renderer (`AppRoute.tsx`, through `layout/useDisplayedLocation.ts`),
 * and the timing of the glide is `::view-transition-group(*)` in
 * `globals.css`; this only mints the names. A name must be a CSS identifier
 * and unique on the page, so ids are sanitised and prefixed by kind. Browsers
 * without the API ignore the property, as does happy-dom.
 */

import type { CSSProperties } from 'react';

/** Keep letters, digits, `-` and `_`; replace anything else so the name stays a valid ident. */
function ident(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, '_');
}

export function viewTransitionName(kind: string, id: string): CSSProperties {
  return { viewTransitionName: `${ident(kind)}-${ident(id)}` } as CSSProperties;
}
