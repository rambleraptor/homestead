/**
 * Tests for derived app route paths: `web.basePath` comes from the app id
 * (children nest under their parent), an explicit value still overrides, and
 * the registry both fills the derived value in and warns about the shapes
 * that would produce an unroutable app.
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  appBasePath,
  deriveBasePath,
  RESERVED_ROUTE_SEGMENTS,
  resolveAppPaths,
  SERVER_OWNED_SEGMENTS,
} from '../paths';
import {
  getAllRoutes,
  getAppById,
  initializeAppRegistry,
  resetAppRegistry,
} from '../registry';
import { logger } from '../../utils/logger';
import type { AppConfig } from '../types';

const icon = () => import('lucide-react').then((m) => m.Package);
const route = { path: '', index: true, component: () => Promise.resolve(() => null) };

function app(id: string, extra: Partial<AppConfig> = {}, basePath?: string): AppConfig {
  return {
    id,
    name: id,
    description: `${id} test app`,
    web: { icon, routes: [route], ...(basePath ? { basePath } : {}) },
    ...extra,
  };
}

afterEach(() => {
  resetAppRegistry();
  vi.restoreAllMocks();
});

describe('deriveBasePath', () => {
  test('a top-level app lives at /<id>', () => {
    expect(deriveBasePath(app('gift-cards'))).toBe('/gift-cards');
  });

  test('a child lives under its parent path', () => {
    expect(deriveBasePath(app('minigolf'), '/games')).toBe('/games/minigolf');
    // A trailing slash on the parent doesn't double up.
    expect(deriveBasePath(app('minigolf'), '/games/')).toBe('/games/minigolf');
  });

  test('an explicit basePath wins', () => {
    expect(deriveBasePath(app('health', {}, '/health-records'))).toBe('/health-records');
    expect(deriveBasePath(app('x', {}, '/custom/x'), '/parent')).toBe('/custom/x');
  });
});

describe('resolveAppPaths', () => {
  test('fills basePath through the whole tree without mutating the input', () => {
    const grandchild = app('putt');
    const child = app('minigolf', { children: [grandchild] });
    const parent = app('games', { children: [child] });

    const [resolved] = resolveAppPaths([parent]);

    expect(resolved.web?.basePath).toBe('/games');
    expect(resolved.children?.[0].web?.basePath).toBe('/games/minigolf');
    expect(resolved.children?.[0].children?.[0].web?.basePath).toBe('/games/minigolf/putt');
    // Originals untouched.
    expect(parent.web?.basePath).toBeUndefined();
    expect(child.web?.basePath).toBeUndefined();
    expect(grandchild.web?.basePath).toBeUndefined();
  });

  test('children of an overridden parent nest under the override', () => {
    const [resolved] = resolveAppPaths([
      app('health', { children: [app('vaccines')] }, '/health-records'),
    ]);
    expect(resolved.children?.[0].web?.basePath).toBe('/health-records/vaccines');
  });

  test('returns already-resolved and headless apps as-is', () => {
    const explicit = app('chat', {}, '/chat');
    const headless: AppConfig = { id: 'worker', name: 'Worker', description: 'no UI' };
    const [a, b] = resolveAppPaths([explicit, headless]);
    expect(a).toBe(explicit);
    expect(b).toBe(headless);
  });

  test('a headless parent passes its own parent path down to web children', () => {
    const [resolved] = resolveAppPaths([
      { id: 'group', name: 'Group', description: 'headless container', children: [app('leaf')] },
    ]);
    expect(resolved.children?.[0].web?.basePath).toBe('/leaf');
  });
});

describe('appBasePath', () => {
  test('reads the resolved path, falling back to /<id>', () => {
    expect(appBasePath(app('todos'))).toBe('/todos');
    expect(appBasePath(app('health', {}, '/health-records'))).toBe('/health-records');
  });
});

describe('registry integration', () => {
  test('apps read back from the registry always carry a basePath', () => {
    initializeAppRegistry([app('games', { children: [app('minigolf')] }), app('todos')]);
    expect(getAppById('games')?.web?.basePath).toBe('/games');
    expect(getAppById('minigolf')?.web?.basePath).toBe('/games/minigolf');
    expect(getAppById('todos')?.web?.basePath).toBe('/todos');
    expect(getAllRoutes()).toHaveLength(3);
  });

  test('two apps can no longer collide on a path without colliding on an id', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    initializeAppRegistry([app('todos'), app('todo')]);
    expect(warn).not.toHaveBeenCalled();
  });

  test('warns when an explicit basePath collides with a derived one', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    initializeAppRegistry([app('todos'), app('tasks', {}, '/todos')]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Duplicate base path detected: /todos'),
      expect.objectContaining({ appId: 'tasks' }),
    );
  });

  test('warns once, not twice, for a duplicate id', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    initializeAppRegistry([app('todos'), app('todos')]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Duplicate app ID'),
      expect.anything(),
    );
  });

  test('warns when an id is not URL-safe', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    initializeAppRegistry([app('Meal Planner')]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('App id "Meal Planner" is not URL-safe'),
      expect.objectContaining({ appId: 'Meal Planner' }),
    );
  });

  test('warns when a derived path is reserved for the server, pointing at the override', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    initializeAppRegistry([app('health')]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/"\/health" is reserved .* declare an explicit web\.basePath/),
      expect.objectContaining({ appId: 'health', basePath: '/health' }),
    );
  });

  test('an override off the reserved path is clean', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    initializeAppRegistry([app('health', {}, '/health-records')]);
    expect(warn).not.toHaveBeenCalled();
    expect(getAppById('health')?.web?.basePath).toBe('/health-records');
  });

  test('warns when a child override escapes its parent', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    initializeAppRegistry([app('games', { children: [app('minigolf', {}, '/minigolf')] })]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('must be nested under parent "games" (/games)'),
      expect.objectContaining({ appId: 'minigolf' }),
    );
  });

  test('every server-owned segment is reserved', () => {
    for (const segment of SERVER_OWNED_SEGMENTS) {
      expect(RESERVED_ROUTE_SEGMENTS).toContain(segment);
    }
    for (const segment of ['login', 'auth', 'authorize', 'api']) {
      expect(RESERVED_ROUTE_SEGMENTS).toContain(segment);
    }
  });
});
