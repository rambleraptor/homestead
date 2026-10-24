import { describe, expect, it } from 'vitest';
import type { PersonRelationship } from '../../types';
import { canonicalLink, planRelationships, relativesFor } from '../relationships';

const names = new Map([
  ['mom', 'Mom'],
  ['dad', 'Dad'],
  ['ann', 'Ann'],
  ['bob', 'Bob'],
  ['cat', 'Cat'],
  ['dan', 'Dan'],
]);

function row(id: string, kind: PersonRelationship['kind'], a: string, b: string): PersonRelationship {
  return { id, kind, person_a: a, person_b: b };
}

describe('canonicalLink', () => {
  it('orders symmetric kinds and keeps parent direction', () => {
    expect(canonicalLink('partner', 'z', 'a')).toEqual({ kind: 'partner', person_a: 'a', person_b: 'z' });
    expect(canonicalLink('sibling', 'people/z', 'a')).toEqual({ kind: 'sibling', person_a: 'a', person_b: 'z' });
    expect(canonicalLink('parent', 'z', 'a')).toEqual({ kind: 'parent', person_a: 'z', person_b: 'a' });
  });
});

describe('relativesFor', () => {
  const rows = [
    row('r1', 'partner', 'dad', 'mom'),
    row('r2', 'parent', 'mom', 'ann'),
    row('r3', 'parent', 'people/mom', 'people/bob'),
    row('r4', 'sibling', 'ann', 'cat'),
    row('r5', 'parent', 'ann', 'dan'),
    row('r6', 'parent', 'mom', 'gone'), // person no longer exists
  ];

  it('reads partner, parents and children from either side', () => {
    expect(relativesFor('mom', rows, names)).toEqual({
      partner: { id: 'dad', name: 'Dad' },
      parents: [],
      children: [
        { id: 'ann', name: 'Ann' },
        { id: 'bob', name: 'Bob' },
      ],
      siblings: [],
    });
  });

  it('lists stored siblings first, then siblings inferred from a shared parent', () => {
    const ann = relativesFor('ann', rows, names);
    expect(ann.parents).toEqual([{ id: 'mom', name: 'Mom' }]);
    expect(ann.children).toEqual([{ id: 'dan', name: 'Dan' }]);
    expect(ann.siblings).toEqual([
      { id: 'cat', name: 'Cat' },
      { id: 'bob', name: 'Bob', inferred: true },
    ]);
  });
});

describe('planRelationships', () => {
  it('creates new links and removes dropped ones', () => {
    const rows = [row('r1', 'parent', 'mom', 'ann'), row('r2', 'sibling', 'ann', 'cat')];
    const plan = planRelationships('ann', rows, { parentIds: ['mom', 'dad'], childIds: ['dan'] });
    expect(plan.remove).toEqual(['r2']);
    expect(plan.create).toEqual([
      { kind: 'parent', person_a: 'dad', person_b: 'ann' },
      { kind: 'parent', person_a: 'ann', person_b: 'dan' },
    ]);
  });

  it('is a no-op when stored links already match, in either spelling', () => {
    const rows = [row('r1', 'partner', 'people/mom', 'dad')];
    expect(planRelationships('dad', rows, { partnerId: 'people/mom' })).toEqual({
      create: [],
      remove: [],
    });
  });

  it("unlinks the new partner's previous partner and drops duplicates", () => {
    const rows = [
      row('r1', 'partner', 'bob', 'cat'),
      row('r2', 'sibling', 'ann', 'dan'),
      row('r3', 'sibling', 'dan', 'ann'),
      row('r4', 'parent', 'mom', 'bob'), // not Ann's, not a partner row
    ];
    const plan = planRelationships('ann', rows, { partnerId: 'bob', siblingIds: ['dan'] });
    expect(plan.remove).toEqual(['r1', 'r3']);
    expect(plan.create).toEqual([{ kind: 'partner', person_a: 'ann', person_b: 'bob' }]);
  });

  it('ignores links to the person themselves', () => {
    expect(planRelationships('ann', [], { siblingIds: ['ann'] }).create).toEqual([]);
  });
});
