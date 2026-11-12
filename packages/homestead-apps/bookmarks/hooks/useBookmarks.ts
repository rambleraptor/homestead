import { useResourceItem, useResourceList } from '@rambleraptor/homestead-core/api/resourceHooks';
import { bySavedDesc } from '../bookmarks';
import { BOOKMARKS } from '../resources';
import type { Bookmark } from '../types';

/**
 * Every bookmark the signed-in person can see — their own private ones and
 * the household's — newest first. One collection, so search and the filters
 * run over both. Kept on the device (`offline: 'keep'`).
 */
export function useBookmarks() {
  return useResourceList<Bookmark>('bookmarks', 'bookmark', BOOKMARKS, {
    orderBy: '-create_time',
    // By when each was saved, which for one saved offline is earlier than
    // when the server got it.
    sort: bySavedDesc,
  });
}

/** One bookmark by id, for an address opened directly. */
export function useBookmark(id: string | null) {
  return useResourceItem<Bookmark>('bookmarks', 'bookmark', BOOKMARKS, id);
}
