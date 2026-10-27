/**
 * The one place `ResourceAccess` turns into enforcement.
 *
 * `householdCollections` decides what filter (if any) the seeded household
 * roles put on each collection grant, and the engine unions that filter with
 * the caller's own `_owner` rows. Getting the filter wrong doesn't error — it
 * silently hides rows — so it's asserted here rather than left to a boot log.
 */

import { describe, it, expect } from 'vitest';
import {
  OWN_ROWS_FILTER,
  householdCollections,
  householdFilterFor,
} from '../household';
import type { ResourceDefinition } from '../../resources/types';

const base = (over: Partial<ResourceDefinition>): ResourceDefinition => ({
  singular: 'thing',
  plural: 'things',
  fields: { name: { type: 'string' } },
  ...over,
});

describe('householdFilterFor', () => {
  it('leaves a shared collection unfiltered', () => {
    expect(householdFilterFor(base({}))).toBeUndefined();
    expect(householdFilterFor(base({ access: { model: 'shared' } }))).toBeUndefined();
  });

  it('scopes a private collection to the caller’s own rows', () => {
    expect(householdFilterFor(base({ access: { model: 'private' } }))).toBe(
      OWN_ROWS_FILTER,
    );
  });

  it('compares the declared field to the shared value', () => {
    const filter = householdFilterFor(
      base({
        access: {
          model: 'per-record',
          field: 'visibility',
          sharedValue: 'household',
          privateValue: 'private',
        },
      }),
    );
    expect(filter).toBe("visibility == 'household'");
  });

  it('uses the declared names, not hardcoded ones', () => {
    const filter = householdFilterFor(
      base({
        access: {
          model: 'per-record',
          field: 'audience',
          sharedValue: 'everyone',
          privateValue: 'owner',
        },
      }),
    );
    expect(filter).toBe("audience == 'everyone'");
  });
});

describe('householdCollections', () => {
  const find = (cols: ReturnType<typeof householdCollections>, name: string) =>
    cols.find((c) => c.resource_type === name);

  it('emits a filtered grant for a per-record collection', () => {
    const cols = householdCollections([
      base({
        singular: 'thing',
        plural: 'things',
        access: {
          model: 'per-record',
          field: 'visibility',
          sharedValue: 'household',
          privateValue: 'private',
        },
      }),
    ]);
    expect(find(cols, 'thing')).toEqual({
      resource_type: 'thing',
      filter: "visibility == 'household'",
    });
  });

  it('emits an unfiltered grant for an ordinary collection', () => {
    const cols = householdCollections([base({ singular: 'event', plural: 'events' })]);
    expect(find(cols, 'event')).toEqual({ resource_type: 'event' });
  });

  it('filters a private collection to the member’s own rows', () => {
    const cols = householdCollections([
      base({ singular: 'document', plural: 'documents', access: { model: 'private' } }),
    ]);
    expect(find(cols, 'document')).toEqual({
      resource_type: 'document',
      filter: OWN_ROWS_FILTER,
    });
  });

  it('gives a superusers-only collection no household grant at all', () => {
    const cols = householdCollections([
      base({ singular: 'credential', plural: 'credentials', access: { model: 'superusers' } }),
      base({ singular: 'event', plural: 'events' }),
    ]);
    expect(find(cols, 'credential')).toBeUndefined();
    expect(find(cols, 'event')).toEqual({ resource_type: 'event' });
  });

  it('names no app resource of its own — scoping comes only from the declaration', () => {
    // The regression guard for deleting PRIVATE_COLLECTIONS: a resource that
    // used to be hardcoded as private is now shared unless it says otherwise.
    const cols = householdCollections([
      base({ singular: 'document', plural: 'documents' }),
    ]);
    expect(find(cols, 'document')).toEqual({ resource_type: 'document' });
  });
});
