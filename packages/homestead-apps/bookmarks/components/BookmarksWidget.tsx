import { Link } from 'react-router-dom';
import { Bookmark as BookmarkIcon } from 'lucide-react';
import { WidgetCard } from '@rambleraptor/homestead-core/shared/components/WidgetCard';
import { displayTitle, sourceLabel } from '../bookmarks';
import { useCreateBookmark } from '../hooks/useBookmarkMutations';
import { useBookmarks } from '../hooks/useBookmarks';
import { SaveBox } from './SaveBox';

/** How many unread links the widget shows under the save box. */
const SHOWN = 3;

/**
 * Save a link without leaving the dashboard, with the next few to read under
 * the box.
 */
export function BookmarksWidget() {
  const bookmarks = useBookmarks();
  const createBookmark = useCreateBookmark();
  const unread = (bookmarks.data ?? []).filter((bookmark) => !bookmark.read);

  return (
    <WidgetCard icon={BookmarkIcon} title="Bookmarks" href="/bookmarks">
      <div data-testid="bookmarks-widget">
        <SaveBox
          compact
          onSave={(url, visibility) => createBookmark.mutateAsync({ url, visibility })}
          className="pb-2"
        />
        {unread.length > 0 && (
          <ul className="space-y-1">
            {unread.slice(0, SHOWN).map((bookmark) => (
              <li key={bookmark.id} className="flex items-baseline gap-2 text-sm" data-testid="bookmarks-widget-item">
                <Link
                  to={`/bookmarks/${bookmark.id}`}
                  className="min-w-0 flex-1 truncate font-body text-text-main hover:underline"
                >
                  {displayTitle(bookmark)}
                </Link>
                <span className="shrink-0 truncate text-xs text-text-muted">{sourceLabel(bookmark)}</span>
              </li>
            ))}
          </ul>
        )}
        {unread.length > SHOWN && (
          <p className="pt-1 text-xs text-text-muted">and {unread.length - SHOWN} more to read</p>
        )}
      </div>
    </WidgetCard>
  );
}
