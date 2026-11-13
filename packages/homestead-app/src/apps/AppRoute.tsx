/**
 * Catch-all app renderer for the SPA.
 *
 * React Router hands us the current path; we resolve it to an app route
 * via the shared matcher, lazily load the route component, and wrap it in
 * any declared gates — the client-side equivalent of the old Next
 * `(app)/[...slug]/page.tsx` server component.
 *
 * Moving between pages is a view transition where the browser has them
 * (`useDisplayedLocation`): the renderer keeps showing the page it was on,
 * `document.startViewTransition` snapshots it, and the new page is committed
 * inside the transition so the two crossfade (`::view-transition-*` in
 * `globals.css`). While that is pending the subtree's location context is
 * pinned to the displayed location, so the outgoing page never renders — or
 * reacts to — a URL that belongs to the page replacing it.
 */

import { Suspense, useContext, useMemo, type ReactNode } from 'react';
import {
  useLocation,
  UNSAFE_LocationContext as LocationContext,
  type Location,
} from 'react-router-dom';
import { getAllApps } from '@/apps/registry';
import {
  buildRouteEntries,
  matchRoute,
  type RouteEntry,
} from '@rambleraptor/homestead-core/apps/router/match';
import { wrapWithGate } from '@rambleraptor/homestead-core/apps/router/gates';
import { getLazyComponent } from '@rambleraptor/homestead-core/apps/lazy';
import { NotFound } from '@rambleraptor/homestead-core/router/NotFound';
import { ErrorBoundary, RenderError } from '@rambleraptor/homestead-core/shared/components/ErrorBoundary';
import { useDisplayedLocation } from '@rambleraptor/homestead-core/layout/useDisplayedLocation';

function RouteFallback() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-accent-terracotta" />
    </div>
  );
}

/**
 * What a page that threw while rendering leaves behind: the error, in the
 * main area, with the shell (and so the way to every other page) still up.
 * It offers a reload rather than a re-render — a page that can't load its
 * code (a tab older than the build being served) only recovers that way.
 */
function PageError({ error }: { error: Error }) {
  return (
    <div className="p-4">
      <RenderError
        error={error}
        onReload={() => window.location.reload()}
        title="This page ran into a problem"
        className="mx-auto max-w-xl"
        data-testid="page-error"
      />
    </div>
  );
}

function toSlug(pathname: string): string[] {
  return pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
}

/**
 * What identifies the mounted page for a path. A new path is a new page,
 * unless its route shares a mount key with the last one: then the page stays
 * and only its params change.
 */
function pageKeyFor(pathname: string, entries: RouteEntry[]): string {
  const match = matchRoute(toSlug(pathname), entries);
  return match?.route.mountKey ? `${match.app.id}:${match.route.mountKey}` : pathname;
}

export function AppRoute() {
  const entries = useMemo(() => buildRouteEntries(getAllApps()), []);
  const location = useLocation();
  const displayed = useDisplayedLocation(
    location,
    (from: Location, to: Location) =>
      pageKeyFor(from.pathname, entries) === pageKeyFor(to.pathname, entries),
  );

  // The subtree reads the displayed location, not the router's, for as long
  // as the two differ (only ever mid-transition).
  const locationContext = useContext(LocationContext);
  const pinnedContext = useMemo(
    () => ({ ...locationContext, location: displayed }),
    [locationContext, displayed],
  );

  const { pathname } = displayed;
  const match = matchRoute(toSlug(pathname), entries);

  if (!match) {
    return (
      <LocationContext.Provider value={pinnedContext}>
        <NotFound />
      </LocationContext.Provider>
    );
  }

  const Component = getLazyComponent(match.route.component);
  const mountKey = pageKeyFor(pathname, entries);
  let element: ReactNode = (
    <Suspense key={mountKey} fallback={<RouteFallback />}>
      <Component params={match.params} />
    </Suspense>
  );

  for (const gateName of match.route.gates ?? []) {
    element = wrapWithGate(gateName, match.app.id, element);
  }

  // Without this a throw anywhere in a page unmounts the whole SPA: a blank
  // screen. Moving to another page clears it.
  return (
    <LocationContext.Provider value={pinnedContext}>
      <ErrorBoundary resetKey={pathname} fallback={(error) => <PageError error={error} />}>
        {element}
      </ErrorBoundary>
    </LocationContext.Provider>
  );
}
