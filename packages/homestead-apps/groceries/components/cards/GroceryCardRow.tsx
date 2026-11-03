/**
 * One grocery item, as a card shows it: a checkbox that checks it off, its
 * name, and (at `card` size) its store and notes, with a way into the
 * Groceries app. The tick is the same write the Groceries page makes.
 */

import { Link } from 'react-router-dom';
import { Badge } from '@rambleraptor/homestead-core/shared/components/ui/badge';
import { Button } from '@rambleraptor/homestead-core/shared/components/ui/button';
import { Checkbox } from '@rambleraptor/homestead-core/shared/components/ui/checkbox';
import { cn } from '@rambleraptor/homestead-core/shared/lib/utils';
import { useUpdateGroceryItem } from '../../hooks/useUpdateGroceryItem';
import type { GroceryItem } from '../../types';

export type CardGrocery = Pick<GroceryItem, 'id' | 'name' | 'checked' | 'notes' | 'store'>;

/** A store reference as the bare id: the SPA stores the id, the chat tools may write `stores/<id>`. */
export function storeIdOf(store: string | undefined): string | undefined {
  return store ? store.split('/').pop() || undefined : undefined;
}

export interface GroceryCardRowProps {
  item: CardGrocery;
  /** The store's name, when the item has one. */
  storeName?: string;
  /** The item is gone: shown struck through, with nothing to act on. */
  deleted?: boolean;
  size: 'row' | 'card';
}

export function GroceryCardRow({ item, storeName, deleted = false, size }: GroceryCardRowProps) {
  const update = useUpdateGroceryItem();
  const setChecked = async (checked: boolean) => {
    try {
      await update.mutateAsync({ id: item.id, data: { checked } });
    } catch {
      // Shown by the global mutation error toast (queryClient.ts).
    }
  };

  return (
    <div className="min-w-0" data-testid="grocery-card" data-checked={item.checked ? 'true' : 'false'}>
      <div className="flex items-center gap-2">
        {!deleted && (
          <Checkbox
            checked={item.checked}
            disabled={update.isPending}
            onCheckedChange={(checked) => void setChecked(checked === true)}
            aria-label={item.checked ? `Put ${item.name} back on the list` : `Check off ${item.name}`}
            data-testid="grocery-card-check"
          />
        )}
        <span
          className={cn(
            'min-w-0 flex-1 break-words',
            size === 'card' && 'font-medium text-base',
            (item.checked || deleted) && 'line-through text-muted-foreground',
          )}
          data-testid="grocery-card-name"
        >
          {item.name}
        </span>
        {size === 'card' && storeName && !deleted && <Badge variant="secondary">{storeName}</Badge>}
      </div>
      {deleted && <p className="mt-0.5 text-muted-foreground text-xs">Removed</p>}
      {size === 'card' && !deleted && (
        <>
          {item.notes && <p className="mt-1 text-muted-foreground">{item.notes}</p>}
          <div className="mt-2">
            <Button size="sm" variant="ghost" asChild>
              <Link to="/groceries">Open Groceries</Link>
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
