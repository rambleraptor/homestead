import { useMutation } from '@tanstack/react-query';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import {
  useResourceCreate,
  useResourceDelete,
  useResourceList,
} from '@rambleraptor/homestead-core/api/resourceHooks';
import { USERS } from '@rambleraptor/homestead-core/resources/builtins';
import { BOOKMARK_INBOXES } from '../resources';
import type { BookmarkInbox, BookmarkVisibility } from '../types';

/** The signed-in person's inboxes: one per shortcut they've set up, newest first. */
export function useBookmarkInboxes() {
  const userId = aepbase.getCurrentUser()?.id ?? '';
  return useResourceList<BookmarkInbox>('bookmarks', 'bookmark-inbox', BOOKMARK_INBOXES, {
    parent: [USERS, userId],
    orderBy: '-create_time',
  });
}

export function useCreateBookmarkInbox() {
  return useResourceCreate<BookmarkInbox, { name: string; box: string; visibility: BookmarkVisibility }>(
    'bookmarks',
    'bookmark-inbox',
  );
}

/** Deleting an inbox is how its shortcut's key is revoked. */
export function useDeleteBookmarkInbox() {
  return useResourceDelete('bookmarks', 'bookmark-inbox');
}

/** Collect from the drop box now, without waiting for the next minute's round. */
export function useCheckInboxNow() {
  return useMutation({
    mutationFn: (inboxId: string) =>
      aepbase.customMethod(BOOKMARK_INBOXES, 'sync', undefined, {
        id: inboxId,
        parent: [USERS, aepbase.getCurrentUser()?.id ?? ''],
      }),
  });
}
