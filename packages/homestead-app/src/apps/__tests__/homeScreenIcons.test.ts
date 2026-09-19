/**
 * Every user-facing app declares a home-screen (PWA) icon, and the image it
 * points at ships in `public/`. Two deliberate exceptions:
 *
 *  - the dashboard *is* the Homestead home screen, so it keeps the brand icon
 *    the static manifest already declares;
 *  - the superuser tree is admin chrome nobody pins to a phone.
 *
 * Imports through the frontend's shim (`@/apps/registry`) so the check runs
 * against the real `homestead.config.ts` plus the always-installed core apps.
 * Regenerate the images with `npm run icons:apps` (scripts/generate-app-icons.ts).
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { appRegistry } from '@/apps/registry';
import type { AppConfig } from '@rambleraptor/homestead-core/apps/types';

const PUBLIC_DIR = resolve(__dirname, '../../../public');

function walk(apps: AppConfig[]): AppConfig[] {
  return apps.flatMap((app) => [app, ...walk(app.children ?? [])]);
}

function isUserFacing(app: AppConfig): boolean {
  if (!app.web) return false;
  if (app.id === 'dashboard') return false;
  return !app.web.basePath.startsWith('/superuser');
}

const userFacing = walk(appRegistry.apps).filter(isUserFacing);

describe('home-screen icons', () => {
  it('covers the apps this instance serves', () => {
    // Guard against the filter silently matching nothing.
    expect(userFacing.map((a) => a.id)).toEqual(
      expect.arrayContaining(['groceries', 'games', 'minigolf', 'chat', 'settings']),
    );
  });

  it.each(userFacing.map((app) => [app.id, app] as const))(
    '%s declares a home-screen icon under /app-icons/',
    (_id, app) => {
      expect(app.web?.homeScreenIcon).toMatch(/^\/app-icons\/[a-z0-9-]+\.png$/);
    },
  );

  it.each(userFacing.map((app) => [app.id, app] as const))(
    '%s ships the image its home-screen icon points at',
    (_id, app) => {
      const href = app.web?.homeScreenIcon ?? '';
      expect(existsSync(resolve(PUBLIC_DIR, href.replace(/^\//, '')))).toBe(true);
    },
  );
});
