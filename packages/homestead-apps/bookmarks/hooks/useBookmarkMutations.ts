import {
  useResourceCreate,
  useResourceDelete,
  useResourceUpdate,
} from '@rambleraptor/homestead-core/api/resourceHooks';
import type { Bookmark, BookmarkFormData } from '../types';

/**
 * Save a link. Goes through the outbox, so one saved offline is kept on the
 * device and sent — and fetched — when the connection is back. Pass
 * `recordId` to choose the new bookmark's id.
 */
export function useCreateBookmark() {
  return useResourceCreate<Bookmark, BookmarkFormData & { recordId?: string }>('bookmarks', 'bookmark');
}

export function useUpdateBookmark() {
  return useResourceUpdate<Bookmark, Partial<BookmarkFormData>>('bookmarks', 'bookmark');
}

export function useDeleteBookmark() {
  return useResourceDelete('bookmarks', 'bookmark');
}
