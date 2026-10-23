import { describe, it, expect } from 'vitest';
import type { RemoteChange } from '@rambleraptor/homestead-core/api/remoteChanges';
import type { GroceryItem } from '../../types';
import { describeGroceryChange, summarizeGroceryChanges } from '../useGroceryChangeToasts';

type Row = Pick<GroceryItem, 'name' | 'checked'>;

function change(overrides: Partial<RemoteChange<Row>>): RemoteChange<Row> {
  return {
    kind: 'updated',
    resource: 'grocery',
    id: 'g1',
    path: 'groceries/g1',
    actor: 'users/sam',
    actorName: 'Sam',
    byMe: false,
    time: '2026-10-22T00:00:00Z',
    ...overrides,
  };
}

describe('describeGroceryChange', () => {
  it('says what happened to the item', () => {
    const milk = { name: 'Milk', checked: false };
    expect(describeGroceryChange(change({ kind: 'created', record: milk }))).toBe('Sam added Milk');
    expect(
      describeGroceryChange(
        change({ record: { ...milk, checked: true }, previous: milk }),
      ),
    ).toBe('Sam checked off Milk');
    expect(
      describeGroceryChange(
        change({ record: milk, previous: { ...milk, checked: true } }),
      ),
    ).toBe('Sam unchecked Milk');
    expect(
      describeGroceryChange(change({ record: { ...milk, name: 'Oat milk' }, previous: milk })),
    ).toBe('Sam updated Oat milk');
  });

  it('names a deleted item from the copy this tab had', () => {
    expect(
      describeGroceryChange(change({ kind: 'deleted', previous: { name: 'Milk', checked: false } })),
    ).toBe('Sam removed Milk');
  });

  it('stays quiet when there is nothing to name', () => {
    expect(describeGroceryChange(change({ kind: 'deleted' }))).toBeNull();
  });
});

describe('summarizeGroceryChanges', () => {
  it('credits one person, or "Others" for several', () => {
    const sam = change({});
    const kim = change({ actorName: 'Kim', actor: 'users/kim' });
    expect(summarizeGroceryChanges([sam, sam, sam])).toBe('Sam made 3 changes to the list');
    expect(summarizeGroceryChanges([sam, kim])).toBe('Others made 2 changes to the list');
  });
});
