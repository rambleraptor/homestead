import { describe, expect, it } from 'vitest';
import type { AppConfig } from '../../../apps/types';
import {
  appManifestPath,
  buildAppManifest,
  findHomeScreenApp,
  findHomeScreenAppById,
  injectHomeScreenHead,
  toHomeScreenApp,
  type HomeScreenApp,
} from '../appManifest';

const GROCERIES: HomeScreenApp = {
  id: 'groceries',
  name: 'Groceries',
  description: 'Shopping lists',
  basePath: '/groceries',
  iconHref: '/app-icons/groceries.png',
};

const icon = () => Promise.reject(new Error('not rendered in tests'));
const app = (
  id: string,
  basePath: string,
  homeScreenIcon?: string,
  children?: AppConfig[],
): AppConfig => ({
  id,
  name: id[0].toUpperCase() + id.slice(1),
  description: `${id} app`,
  children,
  web: { icon, basePath, homeScreenIcon, routes: [] },
});

const APPS: AppConfig[] = [
  app('todos', '/todos', '/app-icons/todos.png'),
  app('games', '/games', '/app-icons/games.png', [
    app('minigolf', '/games/minigolf', '/app-icons/minigolf.png'),
    app('bridge', '/games/bridge'),
  ]),
  app('dashboard', '/dashboard'),
];

describe('buildAppManifest', () => {
  it('launches at the app, chromeless, but scopes the whole origin', () => {
    const manifest = buildAppManifest(GROCERIES);
    expect(manifest.name).toBe('Groceries');
    expect(manifest.short_name).toBe('Groceries');
    expect(manifest.description).toBe('Shopping lists');
    expect(manifest.id).toBe('/groceries');
    // The installed app opens without the sidebar/top bar (layout/chromeMode.ts).
    expect(manifest.start_url).toBe('/groceries?chrome=none');
    // Login, the OAuth callback and cross-app links must stay in the
    // installed app rather than opening a browser.
    expect(manifest.scope).toBe('/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons).toEqual([
      { src: '/app-icons/groceries.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      {
        src: '/app-icons/groceries.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any maskable',
      },
    ]);
  });

  it('infers the icon type from its extension', () => {
    const icons = buildAppManifest({
      ...GROCERIES,
      iconHref: 'https://cdn.example.com/g.svg',
    }).icons as Array<{ src: string; type: string }>;
    expect(icons[0]).toMatchObject({ src: 'https://cdn.example.com/g.svg', type: 'image/svg+xml' });
  });

  it('omits description when the app has none', () => {
    expect('description' in buildAppManifest({ ...GROCERIES, description: undefined })).toBe(false);
  });
});

describe('appManifestPath', () => {
  it('addresses the server route by app id', () => {
    expect(appManifestPath('gift-cards')).toBe('/api/app-manifest/gift-cards');
  });
});

describe('toHomeScreenApp', () => {
  it('projects an app config, or null without an icon', () => {
    expect(toHomeScreenApp(APPS[0])).toEqual({
      id: 'todos',
      name: 'Todos',
      description: 'todos app',
      basePath: '/todos',
      iconHref: '/app-icons/todos.png',
    });
    expect(toHomeScreenApp(APPS[2])).toBeNull();
  });
});

describe('findHomeScreenAppById', () => {
  it('finds nested apps and ignores ones without an icon', () => {
    expect(findHomeScreenAppById(APPS, 'minigolf')?.basePath).toBe('/games/minigolf');
    expect(findHomeScreenAppById(APPS, 'bridge')).toBeNull();
    expect(findHomeScreenAppById(APPS, 'nope')).toBeNull();
  });
});

describe('findHomeScreenApp', () => {
  it('matches the app that owns the path, including deeper routes', () => {
    expect(findHomeScreenApp(APPS, '/todos')?.id).toBe('todos');
    expect(findHomeScreenApp(APPS, '/todos/')?.id).toBe('todos');
    expect(findHomeScreenApp(APPS, '/todos/abc/edit')?.id).toBe('todos');
  });

  it('prefers the longest base path, so a child app beats its parent', () => {
    expect(findHomeScreenApp(APPS, '/games')?.id).toBe('games');
    expect(findHomeScreenApp(APPS, '/games/minigolf/123')?.id).toBe('minigolf');
  });

  it('falls back to the parent when the child has no icon', () => {
    expect(findHomeScreenApp(APPS, '/games/bridge')?.id).toBe('games');
  });

  it('returns null off any app, on a prefix collision, or on an icon-less app', () => {
    expect(findHomeScreenApp(APPS, '/')).toBeNull();
    expect(findHomeScreenApp(APPS, '/login')).toBeNull();
    expect(findHomeScreenApp(APPS, '/todosx')).toBeNull();
    expect(findHomeScreenApp(APPS, '/dashboard')).toBeNull();
  });
});

describe('injectHomeScreenHead', () => {
  const HTML = `<!doctype html>
<html>
  <head>
    <meta name="apple-mobile-web-app-title" content="Homestead" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <title>Homestead</title>
  </head>
  <body></body>
</html>`;

  it('rewrites the manifest, touch icon and title, keeping the site defaults', () => {
    const out = injectHomeScreenHead(HTML, GROCERIES);
    expect(out).toContain(
      '<link rel="manifest" href="/api/app-manifest/groceries" data-hs-default="/manifest.webmanifest" />',
    );
    expect(out).toContain(
      '<link rel="apple-touch-icon" href="/app-icons/groceries.png" data-hs-default="/apple-touch-icon.png" />',
    );
    expect(out).toContain(
      '<meta name="apple-mobile-web-app-title" content="Groceries" data-hs-default="Homestead" />',
    );
    // Untouched neighbours.
    expect(out).toContain('<link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />');
    expect(out).toContain('<title>Homestead</title>');
  });

  it('escapes attribute values', () => {
    const out = injectHomeScreenHead(HTML, { ...GROCERIES, name: 'Gift & "Cards" <3' });
    expect(out).toContain('content="Gift &amp; &quot;Cards&quot; &lt;3"');
  });

  it('leaves HTML without the tags untouched', () => {
    const bare = '<html><head><title>x</title></head></html>';
    expect(injectHomeScreenHead(bare, GROCERIES)).toBe(bare);
  });
});
