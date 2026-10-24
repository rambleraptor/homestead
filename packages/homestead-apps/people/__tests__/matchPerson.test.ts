import { describe, it, expect } from 'vitest';
import { matchPersonByName } from '../utils/matchPerson';
import type { Person } from '../types';

function person(id: string, name: string, aliases: string[] = []): Person {
  return {
    id,
    name,
    aliases,
    households: [],
    parents: [],
    children: [],
    siblings: [],
    created_by: 'user-1',
    created: '',
    updated: '',
  };
}

describe('matchPersonByName', () => {
  const people = [
    person('1', 'Robert Smith', ['Bob Smith', 'Bob Jones']),
    person('2', 'Jane Doe'),
  ];

  it('matches on the primary name (case- and space-insensitive)', () => {
    expect(matchPersonByName('  robert   smith ', people)?.id).toBe('1');
  });

  it('matches on an alias', () => {
    expect(matchPersonByName('Bob Jones', people)?.id).toBe('1');
  });

  it('returns undefined when nothing matches', () => {
    expect(matchPersonByName('Someone Else', people)).toBeUndefined();
  });

  it('returns undefined for an empty name', () => {
    expect(matchPersonByName('   ', people)).toBeUndefined();
  });

  it('returns undefined when the name is ambiguous', () => {
    const ambiguous = [person('1', 'Sam'), person('2', 'sam', ['Samuel'])];
    expect(matchPersonByName('Sam', ambiguous)).toBeUndefined();
  });

  describe('tokenSubset', () => {
    const directory = [person('1', 'Jane Doe'), person('2', 'John Smith')];

    it('is off by default: a longer printed name does not fold in', () => {
      expect(matchPersonByName('Jane Marie Doe', directory)).toBeUndefined();
    });

    it('folds a longer printed name into the person it contains', () => {
      expect(matchPersonByName('Jane Marie Doe', directory, { tokenSubset: true })?.id).toBe('1');
      // Punctuation and case are ignored on both sides.
      expect(matchPersonByName('JOHN A. SMITH', directory, { tokenSubset: true })?.id).toBe('2');
    });

    it('folds via an alias, not just the primary name', () => {
      const withAlias = [person('1', 'Robert Smith', ['Bob Smith'])];
      expect(matchPersonByName('Bob A Smith', withAlias, { tokenSubset: true })?.id).toBe('1');
    });

    it('still prefers an exact match over a subset one', () => {
      const both = [person('1', 'Jane Doe'), person('2', 'Jane Marie Doe')];
      // "Jane Doe" is a subset of "Jane Marie Doe", but the exact hit wins.
      expect(matchPersonByName('Jane Marie Doe', both, { tokenSubset: true })?.id).toBe('2');
    });

    it('stays unambiguous: a subset that fits two people yields no match', () => {
      const twins = [person('1', 'John Smith'), person('2', 'Adam Smith')];
      // "John Adam Smith" contains both "John Smith" and "Adam Smith".
      expect(matchPersonByName('John Adam Smith', twins, { tokenSubset: true })).toBeUndefined();
    });

    it('never lets a one-word directory name vacuum up unrelated full names', () => {
      const firstNameOnly = [person('1', 'Sam')];
      expect(matchPersonByName('Sam Carter', firstNameOnly, { tokenSubset: true })).toBeUndefined();
    });

    it('does not fold when the directory name is longer than the printed one', () => {
      // Subset only absorbs longer printed names; a shorter print is left alone.
      expect(matchPersonByName('Jane', directory, { tokenSubset: true })).toBeUndefined();
    });
  });
});
