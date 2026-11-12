/**
 * Who sees a bookmark, on the VM tier. One collection holds both kinds: a
 * private bookmark is its saver's alone, a family one is everyone's — and the
 * readable copy under each follows it. Checked through the API as well as the
 * screen, since the rule is the engine's.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { e2eClient } from '../../../../tests/e2e/utils/aepbase-helpers';
import { BookmarksPage } from '../e2e/BookmarksPage';
import { createBookmark, getBookmark, getBookmarkPage, listBookmarks } from '../e2e/helpers';
import { ARTICLE_TITLE, ARTICLE_URL, installPageStub } from './page-stub';

describe('Bookmark visibility', () => {
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

  const titles = async (as: string) => (await listBookmarks(as)).map((b) => b.title).sort();

  test("shows the family's bookmarks and my own private ones, never someone else's private ones", async () => {
    const sam = h.householdMember;
    const samsPrivate = await createBookmark(sam.token, {
      url: 'https://example.com/surprise',
      title: 'Surprise party ideas',
      visibility: 'private',
    });
    await createBookmark(sam.token, {
      url: 'https://example.com/trip',
      title: 'Summer trip plans',
      visibility: 'household',
    });
    await createBookmark(token, { url: 'https://example.com/mine', title: 'My own reading', visibility: 'private' });

    await bookmarks.goto();
    await bookmarks.expectBookmark('Summer trip plans');
    await bookmarks.expectRowVisibility('Summer trip plans', 'shared');
    await bookmarks.expectBookmark('My own reading');
    await bookmarks.expectRowVisibility('My own reading', 'private');
    await bookmarks.expectNoBookmark('Surprise party ideas');

    expect(await titles(token)).toEqual(['My own reading', 'Summer trip plans']);
    expect(await titles(sam.token)).toEqual(['Summer trip plans', 'Surprise party ideas']);
    await expect(getBookmark(token, samsPrivate.id)).rejects.toThrow();
  });

  test('a bookmark saved without saying is private', async () => {
    const saved = await createBookmark(token, { url: 'https://example.com/quiet', title: 'Quiet' });
    expect(saved.visibility).toBe('private');
    expect(await titles(h.householdMember.token)).toEqual([]);
  });

  test("the readable copy follows its bookmark's visibility", async () => {
    const sam = h.householdMember;
    const hidden = await createBookmark(token, { url: ARTICLE_URL, visibility: 'private', status: 'pending' });
    const shared = await createBookmark(token, { url: ARTICLE_URL, visibility: 'household', status: 'pending' });
    await expect.poll(async () => (await getBookmark(token, hidden.id)).status, { timeout: 5000 }).toBe('ready');
    await expect.poll(async () => (await getBookmark(token, shared.id)).status, { timeout: 5000 }).toBe('ready');

    expect((await getBookmarkPage(token, hidden.id))?.content).toContain('Feeding');
    expect((await getBookmarkPage(sam.token, shared.id))?.content).toContain('Feeding');
    await expect(getBookmarkPage(sam.token, hidden.id)).rejects.toThrow();
  });

  test('visibility cannot be changed on a saved bookmark', async () => {
    const saved = await createBookmark(token, { url: 'https://example.com/a', title: 'Mine', visibility: 'private' });
    // The screen offers no way to do this; the API must refuse it too.
    await expect(
      e2eClient(token).collection('bookmarks').record(saved.id).update({ visibility: 'household' }),
    ).rejects.toThrow();
    expect((await getBookmark(token, saved.id)).visibility).toBe('private');
  });

  test('saves a link for the family, and remembers the choice', async () => {
    await bookmarks.goto();
    await bookmarks.chooseVisibility('household');
    await bookmarks.save(ARTICLE_URL);

    await bookmarks.expectBookmark(ARTICLE_TITLE);
    await bookmarks.expectRowVisibility(ARTICLE_TITLE, 'shared');
    await expect.poll(() => titles(h.householdMember.token)).toEqual([ARTICLE_TITLE]);

    await h.driver.reload();
    await h.driver.expect(h.driver.getByTestId('visibility-household')).toHaveAttribute('aria-checked', 'true');
  });

  test('shares a private bookmark with the family by saving it again', async () => {
    const sam = h.householdMember;
    const saved = await createBookmark(token, {
      url: ARTICLE_URL,
      title: 'Starter notes',
      tags: ['baking'],
      visibility: 'private',
    });
    await bookmarks.goto();
    await bookmarks.open('Starter notes');

    await bookmarks.move();

    await bookmarks.expectReaderTitle('Starter notes');
    await bookmarks.expectRowVisibility('Starter notes', 'shared');
    await expect
      .poll(async () =>
        (await listBookmarks(sam.token)).map((b) => ({ title: b.title, tags: b.tags, visibility: b.visibility })),
      )
      .toEqual([{ title: 'Starter notes', tags: ['baking'], visibility: 'household' }]);
    // The private one is gone: there is one bookmark, not two.
    await expect.poll(async () => (await listBookmarks(token)).map((b) => b.id)).not.toContain(saved.id);
    expect(await listBookmarks(token)).toHaveLength(1);
  });

  test('filters the list to private or family bookmarks', async () => {
    await createBookmark(token, { url: 'https://example.com/a', title: 'Just for me', visibility: 'private' });
    await createBookmark(token, { url: 'https://example.com/b', title: 'For everyone', visibility: 'household' });
    await bookmarks.goto();

    await bookmarks.showScope('private');
    await bookmarks.expectBookmark('Just for me');
    await bookmarks.expectNoBookmark('For everyone');

    await bookmarks.showScope('family');
    await bookmarks.expectBookmark('For everyone');
    await bookmarks.expectNoBookmark('Just for me');
  });
});
