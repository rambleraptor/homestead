/**
 * Fetching a saved page, on the VM tier. The capture is a server-side resource
 * sync that runs after the save, so these poll for what it writes: the
 * bookmark's title and site, and the readable copy the reader shows. The pages
 * themselves are stubs served in-process (page-stub.ts).
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { BookmarksPage } from '../e2e/BookmarksPage';
import { createBookmark, getBookmark, getBookmarkPage } from '../e2e/helpers';
import {
  ARTICLE_TITLE,
  ARTICLE_URL,
  BROKEN_URL,
  PDF_URL,
  installPageStub,
  type PageStub,
} from './page-stub';

describe('Bookmark capture', () => {
  let h: Harness;
  let bookmarks: BookmarksPage;
  let token: string;
  let stub: PageStub;

  beforeEach(async () => {
    h = await bootHomestead();
    stub = installPageStub();
    ({ token } = await h.loginAs(h.member));
    bookmarks = new BookmarksPage(h.driver);
  });

  afterEach(async () => {
    await h.close();
  });

  const settled = (id: string) =>
    expect.poll(async () => (await getBookmark(token, id)).status, { timeout: 5000 });

  test('fills in a saved link from its page and keeps a readable copy', async () => {
    const saved = await createBookmark(token, { url: ARTICLE_URL, status: 'pending' });
    await settled(saved.id).toBe('ready');

    expect(await getBookmark(token, saved.id)).toMatchObject({
      title: ARTICLE_TITLE,
      site_name: 'The Daily Loaf',
      author: 'Rosa Baker',
      kind: 'article',
    });
    const page = await getBookmarkPage(token, saved.id);
    expect(page?.content).toContain('## Feeding');
    // The title heads the reader already, so the copy doesn't repeat it.
    expect(page?.content).not.toContain(ARTICLE_TITLE);
    expect(page?.content).toContain('- Use a clean jar');
    // Links are kept, made absolute; the page's furniture and scripts are not.
    expect(page?.content).toContain('(http://93.184.216.34/troubleshooting)');
    expect(page?.content).not.toContain('banana bread');
    expect(page?.content).not.toContain('tracked');
    expect(page?.word_count).toBeGreaterThan(100);
  });

  test('shows the saved copy in the reader and marks it read', async () => {
    await bookmarks.goto();
    await bookmarks.save(ARTICLE_URL);
    await bookmarks.open(ARTICLE_TITLE);

    await bookmarks.expectReaderTitle(ARTICLE_TITLE);
    await bookmarks.expectReaderText('A starter is a small pet that lives in a jar');
    await bookmarks.expectReaderMeta('The Daily Loaf · Rosa Baker');
    await bookmarks.expectRowRead(ARTICLE_TITLE, true);
  });

  test('keeps a title the person gave it', async () => {
    const saved = await createBookmark(token, { url: ARTICLE_URL, title: 'Starter notes', status: 'pending' });
    await settled(saved.id).toBe('ready');
    expect((await getBookmark(token, saved.id)).title).toBe('Starter notes');
  });

  test('a page that cannot be read leaves a working link, marked failed', async () => {
    const saved = await createBookmark(token, { url: BROKEN_URL, status: 'pending' });
    await settled(saved.id).toBe('failed');
    expect((await getBookmark(token, saved.id)).fetch_error).toContain('404');
    expect(await getBookmarkPage(token, saved.id)).toBeNull();

    await bookmarks.goto();
    await bookmarks.expectRowFailed(BROKEN_URL);
    await bookmarks.open(BROKEN_URL);
    await bookmarks.expectReaderFailed();
  });

  test('a link that is not a web page is kept as what it is', async () => {
    const saved = await createBookmark(token, { url: PDF_URL, status: 'pending' });
    await settled(saved.id).toBe('failed');
    expect((await getBookmark(token, saved.id)).kind).toBe('pdf');
  });

  test('refuses an address inside the home network', async () => {
    const saved = await createBookmark(token, { url: 'http://192.168.1.1/admin', status: 'pending' });
    await settled(saved.id).toBe('failed');
    expect((await getBookmark(token, saved.id)).fetch_error).toMatch(/non-public/);
  });

  test('fetches the page again when asked', async () => {
    const saved = await createBookmark(token, { url: ARTICLE_URL, status: 'pending' });
    await settled(saved.id).toBe('ready');
    expect(stub.hits.get('/sourdough')).toBe(1);

    await bookmarks.goto();
    await bookmarks.showShelf('everything');
    await bookmarks.open(ARTICLE_TITLE);
    await bookmarks.fetchAgain();

    await expect.poll(() => stub.hits.get('/sourdough'), { timeout: 5000 }).toBe(2);
    await settled(saved.id).toBe('ready');
    await bookmarks.expectReaderText('A starter is a small pet that lives in a jar');
  });
});
