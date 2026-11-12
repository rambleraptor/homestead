/**
 * Fetch a saved link and fill the bookmark in: title, site, author, excerpt,
 * and the readable copy the reader shows (the bookmark's `page`).
 *
 * A resource sync on `bookmark` (server-side, after the write commits), so it
 * covers every way a link is saved — the save box, the share sheet, the
 * assistant, one saved offline that syncs later. It runs for a bookmark whose
 * `status` is `pending`: a new one, or one someone asked to fetch again.
 *
 * The page is someone else's server, so the fetch goes through `safeFetchHtml`
 * (public addresses only, bounded time and size). A page that can't be read is
 * not an error to retry for hours: the bookmark is marked `failed` with the
 * reason and still works as a link. Only a failure to write to Homestead
 * itself throws, which the dispatcher retries.
 *
 * Idempotent: the page takes its bookmark's id, so a re-run overwrites it.
 */

import type { SyncHandler } from '@rambleraptor/homestead-core/apps/sync';
import { serverClient } from '@rambleraptor/homestead-core/server/client';
import {
  UnsafeUrlError,
  safeFetchHtml,
} from '@rambleraptor/homestead-core/server/net/safe-fetch';
import { kindFromUrl } from '../bookmarks';
import { extractPage, type ExtractedPage } from '../extract/extractPage';
import { BOOKMARKS, BOOKMARK_PAGES } from '../resources';
import type { Bookmark } from '../types';

/** Articles with many inline images run large; still bounded. */
const MAX_PAGE_BYTES = 5 * 1024 * 1024;

function errorCode(error: unknown): number | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'number' ? code : undefined;
}

/** Why a page couldn't be read, in words fit to show the person who saved it. */
function reason(error: unknown): string {
  if (error instanceof UnsafeUrlError) return error.message;
  return `Could not read the page: ${error instanceof Error ? error.message : String(error)}`;
}

/** The fields the page fills in. What the person already wrote stays theirs. */
function filledIn(bookmark: Bookmark, page: ExtractedPage): Partial<Bookmark> {
  return {
    ...(bookmark.title?.trim() ? {} : page.title ? { title: page.title } : {}),
    ...(page.site_name ? { site_name: page.site_name } : {}),
    ...(page.author ? { author: page.author } : {}),
    ...(page.excerpt ? { excerpt: page.excerpt } : {}),
    ...(page.image_url ? { image_url: page.image_url } : {}),
    kind: page.kind,
  };
}

const handler: SyncHandler = async (ctx) => {
  const bookmark = ctx.record as unknown as Bookmark | null;
  if (!bookmark || bookmark.status !== 'pending') return { skipped: 'not pending' };

  const client = serverClient(ctx.token, undefined, { origin: ctx.writeOrigin });
  const record = client.collection(BOOKMARKS).record(ctx.recordId);

  /** Patch the bookmark; `false` when it was deleted while we were fetching. */
  const patch = async (data: Record<string, unknown>): Promise<boolean> => {
    try {
      await record.update(data);
      return true;
    } catch (error) {
      if (errorCode(error) === 404) return false;
      throw error;
    }
  };

  let page: ExtractedPage;
  try {
    const { html, url } = await safeFetchHtml(bookmark.url, { maxBytes: MAX_PAGE_BYTES });
    page = extractPage(html, url);
    if (page.content) {
      const pages = record.collection(BOOKMARK_PAGES);
      const body = { content: page.content, word_count: page.word_count, source_url: url };
      try {
        await pages.create(body, { id: ctx.recordId });
      } catch (error) {
        const code = errorCode(error);
        if (code === 404) return { skipped: 'deleted' };
        // Fetched before: replace the earlier copy.
        if (code !== 409) throw error;
        await pages.record(ctx.recordId).update(body);
      }
    }
  } catch (error) {
    if (errorCode(error) !== undefined) throw error;
    const message = reason(error);
    const kind = kindFromUrl(bookmark.url);
    const kept = await patch({ status: 'failed', fetch_error: message, ...(kind ? { kind } : {}) });
    await ctx.log(`could not read ${bookmark.url}: ${message}`);
    return kept ? { failed: message } : { skipped: 'deleted' };
  }

  const kept = await patch({ ...filledIn(bookmark, page), status: 'ready', fetch_error: '' });
  if (!kept) return { skipped: 'deleted' };
  await ctx.log(page.content ? `read ${page.word_count} words` : 'no readable text on the page');
  return { words: page.word_count };
};

export default handler;
