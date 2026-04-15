import { describe, it, expect } from 'vitest';
import { parseFallback, matchModule } from '../parseFallback';
import type { ManifestModule } from '../manifest';

const manifest: ManifestModule[] = [
  {
    moduleId: 'people',
    name: 'People',
    description: 'Manage contact information',
    synonyms: ['people', 'contacts', 'birthday'],
    filters: [],
    forms: [],
  },
  {
    moduleId: 'groceries',
    name: 'Groceries',
    description: 'Manage your grocery list',
    synonyms: ['groceries', 'grocery', 'food'],
    filters: [],
    forms: [],
  },
  {
    moduleId: 'settings',
    name: 'Settings',
    description: 'Manage your preferences',
    synonyms: ['settings', 'preferences', 'config'],
    filters: [],
    forms: [],
  },
];

describe('matchModule', () => {
  it('matches on a synonym token', () => {
    expect(matchModule('show me my people', manifest)?.moduleId).toBe('people');
  });

  it('matches on module id directly', () => {
    expect(matchModule('groceries please', manifest)?.moduleId).toBe(
      'groceries',
    );
  });

  it('returns null when nothing matches', () => {
    expect(matchModule('quantum chromodynamics', manifest)).toBeNull();
  });

  it('picks the best-scoring match when several hit', () => {
    const res = matchModule('birthday contacts', manifest);
    expect(res?.moduleId).toBe('people');
  });
});

describe('parseFallback', () => {
  it('produces a list intent for a known synonym', () => {
    const intent = parseFallback('open settings', manifest);
    expect(intent).not.toBeNull();
    expect(intent!.kind).toBe('list');
    expect(intent!.moduleId).toBe('settings');
    expect(intent!.confidence).toBeLessThan(0.5);
  });

  it('returns null for an empty query', () => {
    expect(parseFallback('   ', manifest)).toBeNull();
  });

  it('returns null when no module matches', () => {
    expect(parseFallback('zzz zzz', manifest)).toBeNull();
  });
});
