import {
  actorLabel,
  useChangeToasts,
  type RemoteChange,
} from '@rambleraptor/homestead-core/api/remoteChanges';
import type { GroceryItem } from '../types';

type GroceryChange = RemoteChange<Pick<GroceryItem, 'name' | 'checked'>>;

/** "Sam checked off Milk" — the sentence for one change someone else made. */
export function describeGroceryChange(change: GroceryChange): string | null {
  const who = actorLabel(change);
  const name = change.record?.name ?? change.previous?.name;
  if (!name) return null;
  switch (change.kind) {
    case 'created':
      return `${who} added ${name}`;
    case 'deleted':
      return `${who} removed ${name}`;
    case 'updated': {
      const checked = change.record?.checked;
      if (change.previous && change.previous.checked !== checked) {
        return checked ? `${who} checked off ${name}` : `${who} unchecked ${name}`;
      }
      return `${who} updated ${name}`;
    }
  }
}

export function summarizeGroceryChanges(changes: GroceryChange[]): string {
  const people = new Set(changes.map(actorLabel));
  const who = people.size === 1 ? [...people][0] : 'Others';
  return `${who} made ${changes.length} changes to the list`;
}

/** Narrate the shared list: toast what other people do to it. */
export function useGroceryChangeToasts(): void {
  useChangeToasts<Pick<GroceryItem, 'name' | 'checked'>>('grocery', describeGroceryChange, {
    summarize: summarizeGroceryChanges,
  });
}
