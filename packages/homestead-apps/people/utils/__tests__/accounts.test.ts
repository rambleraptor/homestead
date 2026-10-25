import { describe, expect, it } from 'vitest';
import { accountIdOf, otherLinks, personForAccount } from '../accounts';
import { suggestSelf } from '../whoAmI';

describe('account links', () => {
  const people = [
    { id: 'p1', name: 'Alex', user: 'users/u1', update_time: '2026-01-01' },
    { id: 'p2', name: 'Al', user: 'u1', update_time: '2025-01-01' },
    { id: 'p3', name: 'Sam' },
  ];

  it('reads a link stored either way', () => {
    expect(accountIdOf('users/u1')).toBe('u1');
    expect(accountIdOf('u1')).toBe('u1');
    expect(accountIdOf(null)).toBeUndefined();
  });

  it('takes the most recently updated person when two hold one account', () => {
    expect(personForAccount(people, 'u1')?.id).toBe('p1');
    expect(personForAccount(people, 'u9')).toBeUndefined();
  });

  it('finds the other people to unlink when an account moves', () => {
    expect(otherLinks(people, 'u1', 'p3').map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(otherLinks(people, 'u1', 'p1').map((p) => p.id)).toEqual(['p2']);
  });
});

describe('suggestSelf', () => {
  const people = [{ name: 'Alex Stephen' }, { name: 'Sam Stephen' }, { name: 'Sam Rivera' }];

  it('matches a whole name, ignoring case and spacing', () => {
    expect(suggestSelf(people, ' alex  stephen ')?.name).toBe('Alex Stephen');
  });

  it('matches a first name when only one person has it', () => {
    expect(suggestSelf(people, 'Alex')?.name).toBe('Alex Stephen');
    expect(suggestSelf(people, 'Sam')).toBeUndefined();
    expect(suggestSelf(people, '')).toBeUndefined();
  });
});
