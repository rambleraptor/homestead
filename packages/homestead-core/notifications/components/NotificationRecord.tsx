/**
 * The record a notification is about (`source_collection` + `source_id`),
 * under its message, when that record's app draws one (`AppConfig.records`):
 * a reminder about a todo carries the todo, checkbox and all. Nothing for a
 * source with no record card, or one the registry doesn't know.
 */

import { RecordCard } from '@rambleraptor/homestead-core/records/components/RecordCard';
import { ownerOfCollection, parentFromPath, recordCardOf } from '@rambleraptor/homestead-core/records/owners';

export function NotificationRecord({ collection, id }: { collection?: string; id?: string }) {
  if (!collection || !id) return null;
  const owner = ownerOfCollection(collection);
  if (!owner || !recordCardOf(owner)) return null;
  // A bare id, or a full resource name for a nested record.
  const bareId = id.split('/').pop();
  if (!bareId) return null;
  return (
    <div className="mt-2" data-testid="notification-record">
      <RecordCard singular={owner.def.singular} id={bareId} parent={parentFromPath(id)} size="row" />
    </div>
  );
}
