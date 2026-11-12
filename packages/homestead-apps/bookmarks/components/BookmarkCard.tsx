/**
 * The bookmarks app's record card (`AppConfig.records`): one saved link, read
 * live by id. Shown wherever Homestead shows a bookmark it doesn't otherwise
 * know how to draw — one the assistant saved or found, in a reply.
 */

import { Link } from 'react-router-dom';
import type { RecordCardProps } from '@rambleraptor/homestead-core/apps/types';
import { VisibilityBadge } from '@rambleraptor/homestead-core/permissions/components/VisibilityBadge';
import { RecordTitleLine } from '@rambleraptor/homestead-core/records/components/RecordCard';
import { useCardRecord } from '@rambleraptor/homestead-core/records/useCardRecord';
import { QueryError } from '@rambleraptor/homestead-core/shared/components/QueryError';
import { cn } from '@rambleraptor/homestead-core/shared/lib/utils';
import { displayTitle, sourceLabel } from '../bookmarks';
import { BOOKMARKS } from '../resources';
import type { Bookmark } from '../types';

export function BookmarkCard({ id, snapshot, size }: RecordCardProps) {
  const { record, deleted, error } = useCardRecord<Bookmark>({
    appId: 'bookmarks',
    singular: 'bookmark',
    plural: BOOKMARKS,
    id,
    snapshot,
  });
  if (!record) {
    if (error) {
      return (
        <QueryError compact error={error} title="Couldn’t load this bookmark" data-testid="bookmark-card-error" />
      );
    }
    return <RecordTitleLine snapshot={snapshot} struck={deleted} />;
  }
  const title = displayTitle(record);
  return (
    <div className="min-w-0" data-testid="bookmark-card">
      {deleted ? (
        <span className="break-words text-muted-foreground line-through">{title}</span>
      ) : (
        <Link
          to={`/bookmarks/${record.id}`}
          className={cn('break-words hover:underline', size === 'card' && 'text-base font-medium')}
          data-testid="bookmark-card-open"
        >
          {title}
        </Link>
      )}
      <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
        <span>{sourceLabel(record)}</span>
        <VisibilityBadge singular="bookmark" record={{ ...record }} showShared />
      </div>
      {size === 'card' && record.excerpt && !deleted && (
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{record.excerpt}</p>
      )}
    </div>
  );
}
