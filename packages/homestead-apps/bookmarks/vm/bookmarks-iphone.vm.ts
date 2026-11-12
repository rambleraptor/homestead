/**
 * "Save from iPhone", on the VM tier. The steps hand an Apple Shortcut an
 * address and a key; these send what the shortcut would and check the result:
 * the link is saved as the person, and the key reaches nothing but bookmarks.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { e2eClient } from '../../../../tests/e2e/utils/aepbase-helpers';
import { BookmarksPage } from '../e2e/BookmarksPage';
import { createBookmark, listBookmarks } from '../e2e/helpers';
import { ARTICLE_TITLE, ARTICLE_URL, installPageStub } from './page-stub';

describe('Save from iPhone', () => {
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

  /** What the shortcut's "Get Contents of URL" action sends. */
  const share = (request: { url: string; authorization: string }, body: Record<string, string>) =>
    fetch(request.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: request.authorization },
      body: JSON.stringify(body),
    });

  test('a link sent the way the steps describe is saved, privately, as the person', async () => {
    await bookmarks.goto();
    await bookmarks.createIphoneKey();
    await bookmarks.expectNoIphoneBodyVisibility();
    const request = await bookmarks.iphoneShortcutRequest();
    expect(request.url).toMatch(/\/api\/aep\/bookmarks$/);
    expect(request.authorization).toMatch(/^Bearer hsd_pat_[0-9a-f]+$/);

    const res = await share(request, { url: ARTICLE_URL });
    expect(res.ok).toBe(true);

    await bookmarks.closeDialog();
    await bookmarks.expectBookmark(ARTICLE_TITLE);
    await bookmarks.expectRowVisibility(ARTICLE_TITLE, 'private');
    expect((await listBookmarks(token)).map((b) => b.url)).toEqual([ARTICLE_URL]);
    expect(await listBookmarks(h.householdMember.token)).toEqual([]);
  });

  test('a shortcut set up for the family saves for the family', async () => {
    await bookmarks.goto();
    await bookmarks.createIphoneKey();
    await bookmarks.chooseIphoneVisibility('household');
    await bookmarks.expectIphoneBodyVisibility('household');

    const res = await share(await bookmarks.iphoneShortcutRequest(), { url: ARTICLE_URL, visibility: 'household' });
    expect(res.ok).toBe(true);
    await expect.poll(async () => (await listBookmarks(h.householdMember.token)).map((b) => b.url)).toEqual([
      ARTICLE_URL,
    ]);
  });

  test('the key reaches bookmarks and nothing else', async () => {
    await bookmarks.goto();
    await bookmarks.createIphoneKey();
    const { url, authorization } = await bookmarks.iphoneShortcutRequest();
    const get = (path: string) => fetch(url.replace(/\/bookmarks$/, path), { headers: { Authorization: authorization } });

    // The person has a todo and a bookmark; the key sees only the bookmark.
    await e2eClient(token).collection('todos').create({ title: 'Call the plumber', status: 'pending' });
    await createBookmark(token, { url: 'https://example.com/a', title: 'Mine' });
    const rows = async (path: string) => {
      const res = await get(path);
      return res.ok ? ((await res.json()) as { results?: unknown[] }).results ?? [] : [];
    };
    expect(await rows('/todos')).toEqual([]);
    expect(await rows('/bookmarks')).toHaveLength(1);

    // And it can write a bookmark, but not a todo.
    const post = (path: string, body: Record<string, string>) =>
      fetch(url.replace(/\/bookmarks$/, path), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: authorization },
        body: JSON.stringify(body),
      });
    expect((await post('/todos', { title: 'Sneaky', status: 'pending' })).status).toBe(403);
    expect((await post('/bookmarks', { url: 'https://example.com/b' })).ok).toBe(true);
    // Nor can it make itself a wider key.
    const mint = await fetch(url.replace(/\/api\/aep\/bookmarks$/, '/api/tokens'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authorization },
      body: JSON.stringify({ name: 'wider', scopes: [{ capability: 'manage', target_scope: 'all' }] }),
    });
    expect(mint.ok).toBe(false);
  });
});
