/**
 * Quick-add with duplicate detection.
 *
 * Typing "milk" when milk is already on the list used to make a second row —
 * the shopper had no way to know, and the household ended up buying it twice
 * or wondering which row to tick. Quick-add now checks the list first, the
 * same case-insensitive name match the recipe import uses:
 *
 *   - a match that is still outstanding is left alone (nothing to add);
 *   - a match that was crossed off is unchecked instead — "we need milk
 *     again" is what re-typing a bought item means;
 *   - no match creates the item as before.
 *
 * Everything reads from the query cache and rides the ordinary create/update
 * mutations, so it is optimistic and offline-safe like the rest of the list.
 */

import { useGroceries } from './useGroceries';
import { useCreateGroceryItem } from './useCreateGroceryItem';
import { useUpdateGroceryItem } from './useUpdateGroceryItem';
import type { GroceryItem } from '../types';

export type QuickAddOutcome =
  | { kind: 'created' }
  /** An outstanding item with this name is already on the list. */
  | { kind: 'already-listed'; item: GroceryItem }
  /** A crossed-off item with this name was put back on the list. */
  | { kind: 'unchecked'; item: GroceryItem };

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Find the item on the list that `name` duplicates, if any. Names match
 * case-insensitively, ignoring surrounding whitespace. When both an
 * outstanding and a crossed-off copy exist, the outstanding one wins — it is
 * the row the shopper will actually see and act on.
 */
export function findExistingGrocery(
  items: readonly GroceryItem[],
  name: string,
): GroceryItem | undefined {
  const key = normalizeName(name);
  if (!key) return undefined;
  const matches = items.filter((item) => normalizeName(item.name) === key);
  return matches.find((item) => !item.checked) ?? matches[0];
}

export function useQuickAddGrocery() {
  const { data: items = [] } = useGroceries();
  const createMutation = useCreateGroceryItem();
  const updateMutation = useUpdateGroceryItem();

  // Fire-and-forget on purpose: the optimistic onMutate handlers update the
  // cache synchronously, and awaiting would deadlock the input while offline
  // (a paused mutation only settles on reconnect).
  const quickAdd = (name: string, store?: string): QuickAddOutcome => {
    const existing = findExistingGrocery(items, name);

    if (existing && !existing.checked) {
      return { kind: 'already-listed', item: existing };
    }

    if (existing) {
      updateMutation.mutate({ id: existing.id, data: { checked: false } });
      return { kind: 'unchecked', item: existing };
    }

    createMutation.mutate({ name: name.trim(), store });
    return { kind: 'created' };
  };

  return { quickAdd, createMutation };
}
