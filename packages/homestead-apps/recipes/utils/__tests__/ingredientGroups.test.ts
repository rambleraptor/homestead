import { describe, expect, it } from 'vitest';
import { groupIngredients } from '../ingredientGroups';
import type { RecipeIngredient } from '../../types';

const ing = (item: string, group?: string): RecipeIngredient => ({
  item,
  qty: 1,
  unit: '',
  raw: item,
  ...(group !== undefined ? { group } : {}),
});

describe('groupIngredients', () => {
  it('returns one unnamed group when no ingredient has a section', () => {
    const groups = groupIngredients([ing('flour'), ing('sugar')]);
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBeUndefined();
    expect(groups[0].items.map((i) => i.index)).toEqual([0, 1]);
  });

  it('buckets by section in order of first appearance, keeping original indexes', () => {
    const groups = groupIngredients([
      ing('chicken', 'For the chicken'),
      ing('stock', 'For the sauce'),
      ing('salt', 'For the chicken'),
    ]);
    expect(groups.map((g) => g.name)).toEqual(['For the chicken', 'For the sauce']);
    expect(groups[0].items.map((i) => i.index)).toEqual([0, 2]);
    expect(groups[1].items.map((i) => i.index)).toEqual([1]);
  });

  it('matches section names trimmed and case-insensitively, keeping the first spelling', () => {
    const groups = groupIngredients([ing('a', 'Sauce'), ing('b', '  sauce ')]);
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe('Sauce');
  });

  it('treats a blank section as no section', () => {
    const groups = groupIngredients([ing('a', '  '), ing('b')]);
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBeUndefined();
  });
});
