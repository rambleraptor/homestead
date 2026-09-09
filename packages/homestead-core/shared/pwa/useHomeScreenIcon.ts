/**
 * Keeps the document's home-screen (PWA) icon in sync with the app the user
 * is currently inside. Mount once, high in the authenticated shell.
 *
 * On every navigation it resolves the active app from the path; if that
 * app declares a `homeScreenIcon`, the document's `apple-touch-icon`,
 * manifest and app title are swapped to that app's so an "Add to Home Screen"
 * uses the app's own icon. Otherwise the global Homestead defaults are
 * restored.
 */

import { useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { getAllApps } from '../../apps/registry';
import { appBasePath } from '../../apps/paths';
import { buildRouteEntries, matchRoute } from '../../apps/router/match';
import {
  applyHomeScreenIcon,
  resetHomeScreenIcon,
} from './homeScreenIcon';

export function useHomeScreenIcon(): void {
  const { pathname } = useLocation();
  const entries = useMemo(() => buildRouteEntries(getAllApps()), []);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const slug = pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
    const match = matchRoute(slug, entries);
    const mod = match?.app;

    if (mod?.web?.homeScreenIcon) {
      applyHomeScreenIcon(
        document,
        {
          name: mod.name,
          description: mod.description,
          basePath: appBasePath(mod),
          iconHref: mod.web.homeScreenIcon,
        },
        window.location.origin,
      );
    } else {
      resetHomeScreenIcon(document);
    }
  }, [pathname, entries]);
}
