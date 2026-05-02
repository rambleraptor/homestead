import { describe, it, expect } from 'vitest';
import { applyFilters, deriveEnumOptions, getByPath } from '../applyFilters';
import type { ModuleFilterDecl } from '../types';

interface Person {
  name: string;
  tags?: string[];
  archived?: boolean;
  birthday?: string;
  profile?: { displayName: string };
}

const PEOPLE: Person[] = [
  { name: 'John Doe', tags: ['friend'], archived: false, birthday: '2000-03-15' },
  { name: 'Jane Smith', tags: ['family', 'friend'], archived: false, birthday: '1995-11-02' },
  { name: 'Bob Brown', tags: ['family'], archived: true, birthday: '1980-07-22' },
  { name: 'Alice', profile: { displayName: 'ALICE WONDERLAND' } },
];

describe('applyFilters — text', () => {
  const decls: ModuleFilterDecl[] = [
    { key: 'name', label: 'Name', type: 'text' },
  ];

  it('returns all items when no values are set', () => {
    expect(applyFilters(PEOPLE, decls, {})).toEqual(PEOPLE);
  });

  it('is case-insensitive substring match', () => {
    expect(applyFilters(PEOPLE, decls, { name: 'john' })).toEqual([PEOPLE[0]]);
  });

  it('requires every whitespace term to match', () => {
    expect(applyFilters(PEOPLE, decls, { name: 'j do' })).toEqual([PEOPLE[0]]);
  });

  it('matches any element when the field is an array', () => {
    const tagDecls: ModuleFilterDecl[] = [
      { key: 'tags', label: 'Tags', type: 'text' },
    ];
    expect(applyFilters(PEOPLE, tagDecls, { tags: 'fam' })).toEqual([
      PEOPLE[1],
      PEOPLE[2],
    ]);
  });

  it('ignores empty or whitespace-only values', () => {
    expect(applyFilters(PEOPLE, decls, { name: '   ' })).toEqual(PEOPLE);
    expect(applyFilters(PEOPLE, decls, { name: '' })).toEqual(PEOPLE);
  });

  it('ignores values of the wrong type', () => {
    expect(applyFilters(PEOPLE, decls, { name: 42 as unknown })).toEqual(
      PEOPLE,
    );
  });

  it('resolves a dot-path via `field`', () => {
    const dotDecls: ModuleFilterDecl[] = [
      { key: 'nickname', field: 'profile.displayName', label: 'Nick', type: 'text' },
    ];
    expect(applyFilters(PEOPLE, dotDecls, { nickname: 'wonder' })).toEqual([
      PEOPLE[3],
    ]);
  });
});

describe('applyFilters — enum', () => {
  it('scalar equality on a scalar field', () => {
    interface Row {
      status: string;
    }
    const rows: Row[] = [{ status: 'active' }, { status: 'archived' }];
    const decls: ModuleFilterDecl[] = [
      { key: 'status', label: 'Status', type: 'enum' },
    ];
    expect(applyFilters(rows, decls, { status: 'active' })).toEqual([rows[0]]);
  });

  it('includes() on an array field', () => {
    const decls: ModuleFilterDecl[] = [
      { key: 'tags', label: 'Tags', type: 'enum' },
    ];
    expect(applyFilters(PEOPLE, decls, { tags: 'family' })).toEqual([
      PEOPLE[1],
      PEOPLE[2],
    ]);
  });

  it('multi-select OR-combines on array fields', () => {
    const decls: ModuleFilterDecl[] = [
      { key: 'tags', label: 'Tags', type: 'enum', multi: true },
    ];
    expect(applyFilters(PEOPLE, decls, { tags: ['family', 'friend'] })).toEqual([
      PEOPLE[0],
      PEOPLE[1],
      PEOPLE[2],
    ]);
  });

  it('multi-select with empty array is a no-op', () => {
    const decls: ModuleFilterDecl[] = [
      { key: 'tags', label: 'Tags', type: 'enum', multi: true },
    ];
    expect(applyFilters(PEOPLE, decls, { tags: [] })).toEqual(PEOPLE);
  });

  it('empty string single value is a no-op', () => {
    const decls: ModuleFilterDecl[] = [
      { key: 'tags', label: 'Tags', type: 'enum' },
    ];
    expect(applyFilters(PEOPLE, decls, { tags: '' })).toEqual(PEOPLE);
  });
});

describe('applyFilters — boolean', () => {
  const decls: ModuleFilterDecl[] = [
    { key: 'archived', label: 'Archived', type: 'boolean' },
  ];

  it('matches exact boolean', () => {
    expect(applyFilters(PEOPLE, decls, { archived: true })).toEqual([PEOPLE[2]]);
    expect(applyFilters(PEOPLE, decls, { archived: false })).toEqual([
      PEOPLE[0],
      PEOPLE[1],
    ]);
  });

  it('accepts string aliases', () => {
    expect(applyFilters(PEOPLE, decls, { archived: 'true' })).toEqual([PEOPLE[2]]);
  });

  it('ignores mismatched values', () => {
    expect(applyFilters(PEOPLE, decls, { archived: 'maybe' })).toEqual(PEOPLE);
  });
});

describe('applyFilters — dateRange', () => {
  const decls: ModuleFilterDecl[] = [
    { key: 'birthday', label: 'Birthday', type: 'dateRange' },
  ];

  it('applies start bound only', () => {
    expect(
      applyFilters(PEOPLE, decls, { birthday: { start: '1990-01-01' } }),
    ).toEqual([PEOPLE[0], PEOPLE[1]]);
  });

  it('applies end bound only', () => {
    expect(
      applyFilters(PEOPLE, decls, { birthday: { end: '1990-01-01' } }),
    ).toEqual([PEOPLE[2]]);
  });

  it('applies both bounds', () => {
    expect(
      applyFilters(PEOPLE, decls, {
        birthday: { start: '1990-01-01', end: '2001-01-01' },
      }),
    ).toEqual([PEOPLE[0], PEOPLE[1]]);
  });

  it('empty bounds are a no-op', () => {
    expect(applyFilters(PEOPLE, decls, { birthday: {} })).toEqual(PEOPLE);
  });
});

describe('applyFilters — combinations', () => {
  it('AND-combines clauses across decls', () => {
    const decls: ModuleFilterDecl[] = [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'tags', label: 'Tags', type: 'enum' },
    ];
    expect(applyFilters(PEOPLE, decls, { name: 'a', tags: 'family' })).toEqual([
      PEOPLE[1],
    ]);
  });

  it('unknown keys in values are ignored', () => {
    const decls: ModuleFilterDecl[] = [
      { key: 'name', label: 'Name', type: 'text' },
    ];
    expect(applyFilters(PEOPLE, decls, { bogus: 'x' })).toEqual(PEOPLE);
  });

  it('undefined and null values are treated as unset', () => {
    const decls: ModuleFilterDecl[] = [
      { key: 'name', label: 'Name', type: 'text' },
    ];
    expect(
      applyFilters(PEOPLE, decls, { name: undefined as unknown }),
    ).toEqual(PEOPLE);
    expect(applyFilters(PEOPLE, decls, { name: null as unknown })).toEqual(
      PEOPLE,
    );
  });
});

describe('deriveEnumOptions', () => {
  it('flattens array-of-string fields uniquely and sorts', () => {
    const decl: ModuleFilterDecl = { key: 'tags', label: 'Tags', type: 'enum' };
    expect(deriveEnumOptions(PEOPLE, decl)).toEqual(['family', 'friend']);
  });

  it('returns scalar string values for scalar fields', () => {
    const decl: ModuleFilterDecl = { key: 'name', label: 'Name', type: 'enum' };
    const names = deriveEnumOptions(PEOPLE, decl);
    expect(names).toContain('John Doe');
    expect(names).toContain('Alice');
    expect(names).toEqual([...names].sort());
  });

  it('respects the `field` override', () => {
    const decl: ModuleFilterDecl = {
      key: 'nickname',
      field: 'profile.displayName',
      label: 'Nick',
      type: 'enum',
    };
    expect(deriveEnumOptions(PEOPLE, decl)).toEqual(['ALICE WONDERLAND']);
  });
});

describe('getByPath', () => {
  it('walks dotted segments', () => {
    expect(getByPath({ a: { b: { c: 1 } } }, 'a.b.c')).toBe(1);
  });

  it('returns undefined for missing segments', () => {
    expect(getByPath({ a: {} }, 'a.b.c')).toBeUndefined();
  });

  it('returns undefined on non-objects', () => {
    expect(getByPath(null, 'x')).toBeUndefined();
    expect(getByPath(42, 'x')).toBeUndefined();
  });
});
