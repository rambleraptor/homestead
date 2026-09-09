import { describe, it, expect } from 'vitest';
import { Box } from 'lucide-react';
import { buildRouteEntries, matchRoute } from '../match';
import type { AppConfig, AppRoute } from '../../types';

const Noop = () => null;

function mod(
  id: string,
  basePath: string,
  routes: AppRoute[],
  children?: AppConfig[],
): AppConfig {
  return {
    id,
    name: id,
    description: id,
    children,
    web: {
      icon: Box,
      basePath,
      routes,
    },
  };
}

describe('buildRouteEntries', () => {
  it('flattens top-level and nested app routes into entries with full segments', () => {
    const child = mod('minigolf', '/games/minigolf', [
      { path: '', index: true, component: Noop },
    ]);
    const parent = mod(
      'games',
      '/games',
      [{ path: '', index: true, component: Noop }],
      [child],
    );

    const entries = buildRouteEntries([parent]);

    expect(entries.map((e) => ({ id: e.app.id, segments: e.segments }))).toEqual([
      { id: 'games', segments: ['games'] },
      { id: 'minigolf', segments: ['games', 'minigolf'] },
    ]);
  });
});

describe('matchRoute', () => {
  const giftCards = mod('gift-cards', '/gift-cards', [
    { path: '', index: true, component: Noop },
    { path: 'import', component: Noop },
  ]);
  const recipes = mod('recipes', '/recipes', [
    { path: '', index: true, component: Noop },
    { path: ':id', component: Noop, dynamic: true },
  ]);
  const entries = buildRouteEntries([giftCards, recipes]);

  it('matches an index route by basePath segment', () => {
    const m = matchRoute(['gift-cards'], entries);
    expect(m?.app.id).toBe('gift-cards');
    expect(m?.route.path).toBe('');
    expect(m?.params).toEqual({});
  });

  it('matches a static sub-route', () => {
    const m = matchRoute(['gift-cards', 'import'], entries);
    expect(m?.route.path).toBe('import');
    expect(m?.params).toEqual({});
  });

  it('captures :param segments', () => {
    const m = matchRoute(['recipes', 'abc123'], entries);
    expect(m?.route.path).toBe(':id');
    expect(m?.params).toEqual({ id: 'abc123' });
  });

  it('prefers a static segment over a param when both could match', () => {
    const recipesWithStatic = mod('recipes', '/recipes', [
      { path: '', index: true, component: Noop },
      { path: 'new', component: Noop },
      { path: ':id', component: Noop, dynamic: true },
    ]);
    const e = buildRouteEntries([recipesWithStatic]);
    const m = matchRoute(['recipes', 'new'], e);
    expect(m?.route.path).toBe('new');
    expect(m?.params).toEqual({});
  });

  it('returns null when no entry matches', () => {
    expect(matchRoute(['nonexistent'], entries)).toBeNull();
    expect(matchRoute(['gift-cards', 'import', 'extra'], entries)).toBeNull();
    expect(matchRoute([], entries)).toBeNull();
  });

  it('matches nested child routes', () => {
    const child = mod('minigolf', '/games/minigolf', [
      { path: '', index: true, component: Noop },
    ]);
    const parent = mod(
      'games',
      '/games',
      [{ path: '', index: true, component: Noop }],
      [child],
    );
    const e = buildRouteEntries([parent]);

    expect(matchRoute(['games'], e)?.app.id).toBe('games');
    expect(matchRoute(['games', 'minigolf'], e)?.app.id).toBe('minigolf');
  });
});

describe('derived base paths', () => {
  function bare(id: string, routes: AppRoute[], children?: AppConfig[]): AppConfig {
    return { id, name: id, description: id, children, web: { icon: Box, routes } };
  }

  it('routes an app with no basePath at /<id>, and its children under it', () => {
    const child = bare('minigolf', [
      { path: '', index: true, component: Noop },
      { path: 'import', component: Noop },
    ]);
    const parent = bare('games', [{ path: '', index: true, component: Noop }], [child]);
    const entries = buildRouteEntries([parent]);

    expect(entries.map((e) => e.segments)).toEqual([
      ['games'],
      ['games', 'minigolf'],
      ['games', 'minigolf', 'import'],
    ]);
    expect(matchRoute(['games', 'minigolf', 'import'], entries)?.app.id).toBe('minigolf');
  });

  it('lets an explicit basePath override the derived one, for the app and its children', () => {
    const child = bare('records', [{ path: '', index: true, component: Noop }]);
    const parent = mod('health', '/health-records', [{ path: '', index: true, component: Noop }], [child]);
    const entries = buildRouteEntries([parent]);

    expect(entries.map((e) => e.segments)).toEqual([
      ['health-records'],
      ['health-records', 'records'],
    ]);
  });
});
