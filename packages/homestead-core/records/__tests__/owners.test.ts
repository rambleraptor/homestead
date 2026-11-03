import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AppConfig, RecordCardType } from '../../apps/types';
import { initializeAppRegistry, resetAppRegistry } from '../../apps/registry';
import { ownerOf, ownerOfTool, parentFromPath, recordCardOf, recordParent } from '../owners';

const card: RecordCardType = { component: (() => Promise.resolve(() => null)) as RecordCardType['component'] };

const cards = {
  id: 'credit-cards',
  name: 'Credit cards',
  resources: [
    { singular: 'credit-card', plural: 'credit-cards', fields: {} },
    { singular: 'perk', plural: 'perks', parents: ['credit-card'], fields: {} },
    { singular: 'redemption', plural: 'redemptions', parents: ['perk'], fields: {} },
  ],
  records: { perk: card },
} as unknown as AppConfig;

const todos = {
  id: 'todos',
  name: 'Todos',
  resources: [{ singular: 'personal-todo', plural: 'personal-todos', parents: ['user'], fields: {} }],
} as unknown as AppConfig;

describe('record owners', () => {
  beforeEach(() => initializeAppRegistry([cards, todos]));
  afterEach(() => resetAppRegistry());

  it('finds a resource by singular or by its chat tool', () => {
    expect(ownerOf('perk')?.app.id).toBe('credit-cards');
    expect(ownerOfTool('personal_todos')?.def.singular).toBe('personal-todo');
    expect(ownerOf('nope')).toBeUndefined();
    expect(recordCardOf(ownerOf('perk')!)).toBe(card);
    expect(recordCardOf(ownerOf('credit-card')!)).toBeUndefined();
  });

  it('reads a parent chain off a resource path', () => {
    expect(parentFromPath('users/u1/personal-todos/t1')).toEqual(['users', 'u1']);
    expect(parentFromPath('credit-cards/c/perks/p/redemptions/r')).toEqual(['credit-cards', 'c', 'perks', 'p']);
    expect(parentFromPath('todos/t1')).toBeUndefined();
    expect(parentFromPath('odd/path/x')).toBeUndefined();
    expect(parentFromPath(undefined)).toBeUndefined();
  });

  it("works out a record's parent from the result's path, else from the call's ancestor ids", () => {
    const redemption = ownerOf('redemption')!.def;
    expect(recordParent(redemption, {}, { path: 'credit-cards/c/perks/p/redemptions/r' })).toEqual([
      'credit-cards',
      'c',
      'perks',
      'p',
    ]);
    expect(recordParent(redemption, { credit_card_id: 'c', perk_id: 'perks/p' }, 'preview')).toEqual([
      'credit-cards',
      'c',
      'perks',
      'p',
    ]);
    expect(recordParent(redemption, { perk_id: 'p' }, undefined)).toBeUndefined();
    expect(recordParent(ownerOf('personal-todo')!.def, { user_id: 'u1' }, undefined)).toEqual(['users', 'u1']);
    expect(recordParent(ownerOf('credit-card')!.def, { id: 'c' }, { path: 'credit-cards/c' })).toBeUndefined();
  });
});
