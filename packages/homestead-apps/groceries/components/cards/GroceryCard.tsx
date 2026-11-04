/**
 * The groceries app's record card (`AppConfig.records`): one item, read live
 * by id, with its checkbox — shown wherever Homestead shows a grocery item it
 * doesn't otherwise draw, such as an item the assistant just added.
 */

import type { RecordCardProps } from '@rambleraptor/homestead-core/apps/types';
import { useCardRecord } from '@rambleraptor/homestead-core/records/useCardRecord';
import { RecordTitleLine } from '@rambleraptor/homestead-core/records/components/RecordCard';
import { QueryError } from '@rambleraptor/homestead-core/shared/components/QueryError';
import { useStores } from '../../hooks/useStores';
import { GROCERIES } from '../../resources';
import { GroceryCardRow, storeIdOf, type CardGrocery } from './GroceryCardRow';

export function GroceryCard({ id, snapshot, size }: RecordCardProps) {
  const { record, deleted, error } = useCardRecord<CardGrocery>({
    appId: 'groceries',
    singular: 'grocery',
    plural: GROCERIES,
    id,
    snapshot,
  });
  const stores = useStores();
  if (!record) {
    if (error) {
      return (
        <QueryError
          compact
          error={error}
          title="Couldn’t load this item"
          data-testid="grocery-card-error"
        />
      );
    }
    return <RecordTitleLine snapshot={snapshot} struck={deleted} />;
  }
  const storeId = storeIdOf(record.store);
  const storeName = storeId ? stores.data?.find((s) => s.id === storeId)?.name : undefined;
  return <GroceryCardRow item={record} storeName={storeName} deleted={deleted} size={size} />;
}
