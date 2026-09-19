/**
 * `GET /api/app-manifest/:id` — the web-app manifest for one app, built from
 * the registry (name, description, base path, `web.homeScreenIcon`). The SPA
 * points `<link rel="manifest">` here while the user is inside the app (and
 * the server pre-writes it into the served index.html for app paths), so an
 * "Add to Home Screen" installs that app with its own icon and launch URL.
 *
 * Served from a real URL rather than a `data:` URL because iOS ignores the
 * latter. Public: browsers fetch manifests without credentials, and the
 * payload is the app's display metadata, which the SPA bundle carries anyway.
 */

import { Hono } from 'hono';
import type { AppConfig } from '@rambleraptor/homestead-core/apps/types';
import {
  buildAppManifest,
  findHomeScreenAppById,
} from '@rambleraptor/homestead-core/shared/pwa/appManifest';

export function makeAppManifestRoute(getApps: () => AppConfig[]): Hono {
  const app = new Hono();
  app.get('/:id', (c) => {
    const found = findHomeScreenAppById(getApps(), c.req.param('id'));
    if (!found) {
      return c.json({ error: 'no home-screen icon is declared for this app' }, 404);
    }
    return c.body(JSON.stringify(buildAppManifest(found)), 200, {
      'content-type': 'application/manifest+json',
      // Config edits rebuild the SPA and restart the server; don't let a
      // browser pin a stale name or icon.
      'cache-control': 'no-cache',
    });
  });
  return app;
}
