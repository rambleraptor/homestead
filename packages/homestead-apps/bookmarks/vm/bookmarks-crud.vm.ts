/**
 * Bookmarks, on the VM tier: saving a link, finding it again (search, tags,
 * the shelves), reading state, tags, and deleting with undo. Each test boots
 * from a fresh copy of the template database, so there is no cleanup.
 *
 * Seeded bookmarks are already `ready`, so nothing here waits on a page; the
 * capture path has its own spec (bookmarks-capture.vm.ts).
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { BookmarksPage } from '../e2e/BookmarksPage';
import { createBookmark, getBookmark, listBookmarks } from '../e2e/helpers';
import { ARTICLE_TITLE, ARTICLE_URL, installPageStub } from './page-stub';

describe('Bookmarks', () => {
  let h: Harness;
  let bookmarks: BookmarksPage;
  let token: string;

  beforeEach(async () => {
    h = await bootHomestead();
    installPageStub();
    ({ token } = await h.loginAs(h.member));
    bookmarks = new BookmarksPage(h.driver);
  });

  afterEach(async () => {
    await h.close();
  });

  test('saves a pasted link, privately by default', async () => {
    await bookmarks.goto();
    await bookmarks.expectEmptyState();

    await bookmarks.save(ARTICLE_URL);

    await bookmarks.expectBookmark(ARTICLE_TITLE);
    await bookmarks.expectRowVisibility(ARTICLE_TITLE, 'private');
    await bookmarks.expectSaveInputValue('');
    const [saved] = await listBookmarks(token);
    expect(saved).toMatchObject({ url: ARTICLE_URL, visibility: 'private' });
  });

  test('says so when what was typed is not a link', async () => {
    await bookmarks.goto();
    await bookmarks.save('remember the milk');

    await bookmarks.expectSaveError();
    await bookmarks.expectSaveInputValue('remember the milk');
    expect(await listBookmarks(token)).toEqual([]);
  });

  test('finds bookmarks by search and by tag', async () => {
    await createBookmark(token, { url: 'https://example.com/tomatoes', title: 'Growing tomatoes', tags: ['garden'] });
    await createBookmark(token, { url: 'https://example.com/compost', title: 'Compost basics', tags: ['garden'] });
    await createBookmark(token, { url: 'https://example.com/rome', title: 'Three days in Rome', tags: ['travel'] });
    await bookmarks.goto();

    await bookmarks.search('rome');
    await bookmarks.expectBookmark('Three days in Rome');
    await bookmarks.expectNoBookmark('Growing tomatoes');
    await bookmarks.expectMatchCount('1 bookmark matches');

    await bookmarks.clearSearch();
    await bookmarks.filterByTag('garden');
    await bookmarks.expectMatchCount('2 bookmarks match');
    await bookmarks.expectBookmark('Compost basics');
    await bookmarks.expectNoBookmark('Three days in Rome');
  });

  test('marks a bookmark read and moves it off the to-read shelf', async () => {
    const seeded = await createBookmark(token, { url: 'https://example.com/a', title: 'Long read' });
    await bookmarks.goto();

    await bookmarks.toggleRead('Long read');
    await bookmarks.expectNoBookmark('Long read');
    await expect.poll(async () => (await getBookmark(token, seeded.id)).read).toBe(true);

    await bookmarks.showShelf('read');
    await bookmarks.expectBookmark('Long read');
    await bookmarks.expectRowRead('Long read', true);
  });

  test('keeps favorites on their own shelf', async () => {
    const seeded = await createBookmark(token, { url: 'https://example.com/a', title: 'Keeper' });
    await createBookmark(token, { url: 'https://example.com/b', title: 'Passing interest' });
    await bookmarks.goto();

    await bookmarks.toggleFavorite('Keeper');
    await expect.poll(async () => (await getBookmark(token, seeded.id)).favorite).toBe(true);

    await bookmarks.showShelf('favorites');
    await bookmarks.expectBookmark('Keeper');
    await bookmarks.expectNoBookmark('Passing interest');
  });

  test('tags a bookmark from the reader', async () => {
    const seeded = await createBookmark(token, { url: 'https://example.com/a', title: 'Paint colors' });
    await bookmarks.goto();
    await bookmarks.open('Paint colors');

    await bookmarks.addTag('House Projects');

    await bookmarks.expectReaderTag('house-projects');
    await expect.poll(async () => (await getBookmark(token, seeded.id)).tags).toEqual(['house-projects']);
  });

  test('deletes a bookmark and puts it back with undo', async () => {
    const seeded = await createBookmark(token, {
      url: 'https://example.com/a',
      title: 'Wifi router reviews',
      tags: ['house'],
    });
    await bookmarks.goto();
    await bookmarks.open('Wifi router reviews');

    await bookmarks.delete();
    await bookmarks.expectNoBookmark('Wifi router reviews');
    await expect.poll(async () => (await listBookmarks(token)).length).toBe(0);

    await bookmarks.undo();
    await bookmarks.expectBookmark('Wifi router reviews');
    await expect
      .poll(async () => (await listBookmarks(token)).map((b) => ({ id: b.id, tags: b.tags })))
      .toEqual([{ id: seeded.id, tags: ['house'] }]);
  });

  test('says so when a bookmark is not there', async () => {
    await bookmarks.gotoBookmark('does-not-exist');
    await bookmarks.expectMissing();
  });
});
