import { describe, expect, it } from 'vitest';
import type { Household } from '../../types';
import {
  formatAddress,
  householdNameFor,
  householdsFor,
  memberIds,
  planMemberships,
} from '../households';

function household(id: string, name: string, members: string[]): Household {
  return { id, name, members };
}

describe('memberIds / householdsFor', () => {
  const homes = [
    household('h2', 'Lake house', ['people/ann']),
    household('h1', 'Main home', ['ann', 'bob']),
    household('h3', 'Cabin', ['cat']),
  ];

  it('normalizes paths to bare ids', () => {
    expect(memberIds(homes[0])).toEqual(['ann']);
  });

  it("lists a person's households by name, from either id spelling", () => {
    expect(householdsFor('ann', homes).map((h) => h.id)).toEqual(['h2', 'h1']);
    expect(householdsFor('dan', homes)).toEqual([]);
  });
});

describe('planMemberships', () => {
  const homes = [
    household('h1', 'Main', ['ann', 'bob']),
    household('h2', 'Lake', ['people/ann']),
    household('h3', 'Cabin', ['cat']),
  ];

  it('adds the person to new households and removes them from dropped ones', () => {
    expect(planMemberships('ann', homes, ['h1', 'h3'])).toEqual([
      { id: 'h2', members: [] },
      { id: 'h3', members: ['cat', 'ann'] },
    ]);
  });

  it('is a no-op when memberships already match', () => {
    expect(planMemberships('ann', homes, ['h1', 'h2'])).toEqual([]);
  });
});

describe('householdNameFor', () => {
  it('joins member names', () => {
    expect(householdNameFor(['Ann'])).toBe('Ann');
    expect(householdNameFor(['Ann', 'Bob'])).toBe('Ann & Bob');
    expect(householdNameFor(['Ann', 'Bob', 'Cat'])).toBe('Ann, Bob & Cat');
    expect(householdNameFor([])).toBe('Household');
  });
});

describe('formatAddress', () => {
  it('joins the non-blank parts', () => {
    expect(formatAddress({ line1: '1 Main St', city: 'Springfield', state: ' ', country: 'US' })).toBe(
      '1 Main St, Springfield, US',
    );
    expect(formatAddress({})).toBe('');
  });
});
