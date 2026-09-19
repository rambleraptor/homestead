/**
 * Tests for the per-app home-screen (PWA) icon head mutations.
 *
 * These run against jsdom's `document`, seeding the head with the same tags
 * `packages/homestead-app/index.html` ships, then asserting apply/reset behavior.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import {
  applyHomeScreenIcon,
  resetHomeScreenIcon,
  type HomeScreenApp,
} from '../homeScreenIcon';
import { injectHomeScreenHead } from '../appManifest';

const GROCERIES: HomeScreenApp = {
  id: 'groceries',
  name: 'Groceries',
  description: 'Shopping lists',
  basePath: '/groceries',
  iconHref: '/app-icons/groceries.png',
};

const HEAD = `
    <meta name="apple-mobile-web-app-title" content="Homestead" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
  `;

function seedHead(html: string = HEAD): void {
  document.head.innerHTML = html;
}

function appleTouchHref(): string | null {
  return document.head
    .querySelector('link[rel="apple-touch-icon"]')
    ?.getAttribute('href') ?? null;
}

function manifestHref(): string | null {
  return document.head
    .querySelector('link[rel="manifest"]')
    ?.getAttribute('href') ?? null;
}

function appTitle(): string | null {
  return document.head
    .querySelector('meta[name="apple-mobile-web-app-title"]')
    ?.getAttribute('content') ?? null;
}

describe('applyHomeScreenIcon / resetHomeScreenIcon', () => {
  beforeEach(() => seedHead());

  it('points apple-touch-icon, manifest and app title at the app', () => {
    applyHomeScreenIcon(document, GROCERIES);

    expect(appleTouchHref()).toBe('/app-icons/groceries.png');
    expect(appTitle()).toBe('Groceries');
    // The manifest is served by the server, never embedded as a data: URL
    // (iOS ignores those and falls back to the site-wide manifest).
    expect(manifestHref()).toBe('/api/app-manifest/groceries');
  });

  it('restores the Homestead defaults on reset', () => {
    applyHomeScreenIcon(document, GROCERIES);
    resetHomeScreenIcon(document);

    expect(appleTouchHref()).toBe('/apple-touch-icon.png');
    expect(manifestHref()).toBe('/manifest.webmanifest');
    expect(appTitle()).toBe('Homestead');
  });

  it('restores the original defaults even after switching between apps', () => {
    const recipes: HomeScreenApp = {
      id: 'recipes',
      name: 'Recipes',
      basePath: '/recipes',
      iconHref: '/app-icons/recipes.png',
    };
    applyHomeScreenIcon(document, GROCERIES);
    applyHomeScreenIcon(document, recipes);

    expect(appleTouchHref()).toBe('/app-icons/recipes.png');
    expect(manifestHref()).toBe('/api/app-manifest/recipes');
    expect(appTitle()).toBe('Recipes');

    resetHomeScreenIcon(document);
    expect(appleTouchHref()).toBe('/apple-touch-icon.png');
    expect(manifestHref()).toBe('/manifest.webmanifest');
    expect(appTitle()).toBe('Homestead');
  });

  it('creates the tags when the head does not ship them', () => {
    seedHead('');
    applyHomeScreenIcon(document, GROCERIES);
    expect(appleTouchHref()).toBe('/app-icons/groceries.png');
    expect(manifestHref()).toBe('/api/app-manifest/groceries');
    expect(appTitle()).toBe('Groceries');

    resetHomeScreenIcon(document);
    expect(appleTouchHref()).toBe('/apple-touch-icon.png');
    expect(manifestHref()).toBe('/manifest.webmanifest');
    expect(appTitle()).toBe('Homestead');
  });

  it('is idempotent', () => {
    applyHomeScreenIcon(document, GROCERIES);
    applyHomeScreenIcon(document, GROCERIES);
    expect(document.head.querySelectorAll('link[rel="manifest"]')).toHaveLength(1);
    expect(document.head.querySelectorAll('link[rel="apple-touch-icon"]')).toHaveLength(1);
    resetHomeScreenIcon(document);
    expect(manifestHref()).toBe('/manifest.webmanifest');
  });

  it('treats a server-rewritten head as already applied, and still resets to the site defaults', () => {
    // A direct load of /groceries gets the app's tags from the server, with
    // the site-wide values parked in data-hs-default.
    seedHead(injectHomeScreenHead(HEAD, GROCERIES));
    expect(manifestHref()).toBe('/api/app-manifest/groceries');

    // Client-side navigation to the dashboard must go back to Homestead's own
    // icon, not to the groceries icon the head happened to load with.
    resetHomeScreenIcon(document);
    expect(appleTouchHref()).toBe('/apple-touch-icon.png');
    expect(manifestHref()).toBe('/manifest.webmanifest');
    expect(appTitle()).toBe('Homestead');
  });
});
