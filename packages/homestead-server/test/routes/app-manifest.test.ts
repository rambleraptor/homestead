import { describe, expect, test } from 'vitest';
import type { AppConfig } from '@rambleraptor/homestead-core/apps/types';
import { makeAppManifestRoute } from '../../src/routes/app-manifest';

const icon = () => Promise.reject(new Error('not rendered in tests'));
const apps: AppConfig[] = [
  {
    id: 'todos',
    name: 'Todos',
    description: 'Daily todo list',
    web: { icon, basePath: '/todos', homeScreenIcon: '/app-icons/todos.png', routes: [] },
  },
  {
    id: 'games',
    name: 'Games',
    description: 'Games',
    web: { icon, basePath: '/games', routes: [] },
    children: [
      {
        id: 'minigolf',
        name: 'Mini Golf',
        description: 'Mini golf',
        web: {
          icon,
          basePath: '/games/minigolf',
          homeScreenIcon: '/app-icons/minigolf.png',
          routes: [],
        },
      },
    ],
  },
];

describe('app manifest route', () => {
  const route = makeAppManifestRoute(() => apps);

  test('serves a manifest that launches at the app', async () => {
    const res = await route.request('/todos');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/manifest+json');
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      name: 'Todos',
      short_name: 'Todos',
      description: 'Daily todo list',
      start_url: '/todos',
      scope: '/',
      display: 'standalone',
    });
    expect(body.icons).toEqual([
      { src: '/app-icons/todos.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/app-icons/todos.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ]);
  });

  test('reaches nested child apps', async () => {
    const res = await route.request('/minigolf');
    expect(res.status).toBe(200);
    expect(((await res.json()) as { start_url: string }).start_url).toBe('/games/minigolf');
  });

  test('404s for an unknown app or one without a home-screen icon', async () => {
    expect((await route.request('/nope')).status).toBe(404);
    expect((await route.request('/games')).status).toBe(404);
  });
});
