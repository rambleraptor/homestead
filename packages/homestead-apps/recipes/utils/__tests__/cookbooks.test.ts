import { describe, expect, it } from 'vitest';
import {
  byName,
  cookbooksContaining,
  isAutoCookbook,
  moveRecipe,
  neighbours,
  withRecipe,
  withRecipes,
} from '../cookbooks';
import type { Cookbook } from '../../types';

const cb = (id: string, name: string, recipes: string[] = [], auto?: 'social'): Cookbook => ({
  id,
  path: `cookbooks/${id}`,
  name,
  recipes,
  auto,
  create_time: '',
  update_time: '',
});

describe('cookbook list helpers', () => {
  it('finds the cookbooks a recipe is in, in the given order', () => {
    const books = [cb('a', 'A', ['r1']), cb('b', 'B', ['r2']), cb('c', 'C', ['r1', 'r2'])];
    expect(cookbooksContaining(books, 'r1').map((c) => c.id)).toEqual(['a', 'c']);
    expect(cookbooksContaining(undefined, 'r1')).toEqual([]);
  });

  it('adds a recipe at the end and removes it anywhere, without duplicates', () => {
    expect(withRecipe(['r1'], 'r2', true)).toEqual(['r1', 'r2']);
    expect(withRecipe(['r1', 'r2'], 'r2', true)).toEqual(['r1', 'r2']);
    expect(withRecipe(['r1', 'r2', 'r3'], 'r2', false)).toEqual(['r1', 'r3']);
    expect(withRecipe(undefined, 'r1', true)).toEqual(['r1']);
    expect(withRecipe(undefined, 'r1', false)).toEqual([]);
  });

  it('appends several recipes, skipping ones already present', () => {
    expect(withRecipes(['r1'], ['r2', 'r1', 'r3', 'r2'])).toEqual(['r1', 'r2', 'r3']);
  });

  it('moves an entry and ignores out-of-range moves', () => {
    expect(moveRecipe(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveRecipe(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'c', 'b']);
    expect(moveRecipe(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c']);
    expect(moveRecipe(['a', 'b', 'c'], 2, 3)).toEqual(['a', 'b', 'c']);
  });

  it('knows the automatic cookbook', () => {
    expect(isAutoCookbook(cb('s', 'From social', [], 'social'))).toBe(true);
    expect(isAutoCookbook(cb('a', 'A'))).toBe(false);
  });

  it('finds neighbours in the given order', () => {
    const books = [cb('a', 'A'), cb('b', 'B'), cb('c', 'C')];
    expect(neighbours(books, 'b')).toEqual({ prev: books[0], next: books[2] });
    expect(neighbours(books, 'a')).toEqual({ prev: undefined, next: books[1] });
    expect(neighbours(books, 'zzz')).toEqual({});
  });

  it('sorts by name ignoring case', () => {
    const names = [cb('1', 'weeknight'), cb('2', 'Autumn'), cb('3', 'From social')]
      .sort(byName)
      .map((c) => c.name);
    expect(names).toEqual(['Autumn', 'From social', 'weeknight']);
  });
});
