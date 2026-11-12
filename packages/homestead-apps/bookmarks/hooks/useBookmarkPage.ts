import { AepbaseError } from '@rambleraptor/homestead-core/api/aepbase';
import { useResourceItem } from '@rambleraptor/homestead-core/api/resourceHooks';
import { BOOKMARKS, BOOKMARK_PAGES } from '../resources';
import type { BookmarkPage } from '../types';

/**
 * The readable copy of a bookmark's page, read only when the reader opens —
 * lists never carry article text. `missing` is a page Homestead fetched but
 * found nothing to read on (there is no copy), as opposed to a failed read.
 */
export function useBookmarkPage(bookmarkId: string | null, enabled: boolean) {
  const query = useResourceItem<BookmarkPage>(
    'bookmarks',
    'bookmark-page',
    BOOKMARK_PAGES,
    enabled ? bookmarkId : null,
    {
      parent: [BOOKMARKS, bookmarkId ?? ''],
      // "No copy" is an answer, not something to retry.
      retry: (count, error) => !(error instanceof AepbaseError && error.code === 404) && count < 2,
    },
  );
  const missing = query.error instanceof AepbaseError && query.error.code === 404;
  return { ...query, missing };
}
