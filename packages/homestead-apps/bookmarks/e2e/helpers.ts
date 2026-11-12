/**
 * Bookmarks seed helpers — write bookmarks straight through the shared client.
 */

import { e2eClient, isNotFound } from '../../../../tests/e2e/utils/aepbase-helpers';

export interface BookmarkRecord {
  id: string;
  path: string;
  url: string;
  visibility?: 'household' | 'private';
  title?: string;
  site_name?: string;
  author?: string;
  excerpt?: string;
  kind?: string;
  tags?: string[];
  read?: boolean;
  favorite?: boolean;
  status?: 'pending' | 'ready' | 'failed';
  fetch_error?: string;
  saved_at?: string;
  create_time: string;
}

export interface BookmarkPageRecord {
  id: string;
  content?: string;
  word_count?: number;
  source_url?: string;
}

export type BookmarkSeed = Partial<Omit<BookmarkRecord, 'id' | 'path' | 'create_time'>> & { url: string };

function bookmarks(token: string) {
  return e2eClient(token).collection<BookmarkRecord>('bookmarks');
}

/**
 * Seed a bookmark as already fetched (`status: 'ready'`) unless the seed says
 * otherwise, so a spec about the list doesn't wait on — or need — a page.
 */
export async function createBookmark(token: string, data: BookmarkSeed): Promise<BookmarkRecord> {
  return bookmarks(token).create({ status: 'ready', ...data });
}

export async function listBookmarks(token: string): Promise<BookmarkRecord[]> {
  return bookmarks(token).listAll();
}

export async function getBookmark(token: string, id: string): Promise<BookmarkRecord> {
  return bookmarks(token).record(id).get();
}

/** The readable copy kept for a bookmark, or `null` when there is none. */
export async function getBookmarkPage(token: string, bookmarkId: string): Promise<BookmarkPageRecord | null> {
  try {
    return await bookmarks(token)
      .record(bookmarkId)
      .collection<BookmarkPageRecord>('pages')
      .record(bookmarkId)
      .get();
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}
