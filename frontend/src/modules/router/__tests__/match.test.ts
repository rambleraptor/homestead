import { describe, it, expect } from 'vitest';
import { Box } from 'lucide-react';
import { buildRouteEntries, matchRoute } from '../match';
import type { HomeModule } from '../../types';

const Noop = () => null;

function mod(
  id: string,
  basePath: string,
  routes: HomeModule['routes'],
  children?: HomeModule[],
): HomeModule {
  return {
    id,
    name: id,
    description: id,
    icon: Box,
    basePath,
    routes,
    children,
  };
}

describe('buildRouteEntries', () => {
  it('flattens top-level and nested module routes into entries with full segments', () => {
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

    expect(entries.map((e) => ({ id: e.module.id, segments: e.segments }))).toEqual([
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
    expect(m?.module.id).toBe('gift-cards');
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

    expect(matchRoute(['games'], e)?.module.id).toBe('games');
    expect(matchRoute(['games', 'minigolf'], e)?.module.id).toBe('minigolf');
  });
});
