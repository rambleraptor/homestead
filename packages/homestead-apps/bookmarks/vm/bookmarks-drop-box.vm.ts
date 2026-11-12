/**
 * "Save from iPhone" through the drop box, on the VM tier: a shortcut leaves
 * a link on a separate public server, and Homestead collects it. The drop box
 * here is the Worker's own code over memory (drop-box-stub.ts), so both
 * directions are the real exchange.
 *
 * The drop box is assumed breakable, so half of this is about what Homestead
 * does with a drop box that lies.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { setAppFlag } from '../../../../tests/e2e/utils/aepbase-helpers';
import { MAX_LINKS_PER_HOUR, boxOf } from '../dropBox';
import { BookmarksPage } from '../e2e/BookmarksPage';
import { listBookmarks } from '../e2e/helpers';
import { DROP_STUB_ORIGIN, DROP_STUB_SECRET, installDropBoxStub, type DropBoxStub } from './drop-box-stub';
import { ARTICLE_TITLE, ARTICLE_URL, installPageStub } from './page-stub';

const realSecret = process.env.BOOKMARKS_DROP_SECRET;

describe('Save from iPhone, through the drop box', () => {
  let h: Harness;
  let bookmarks: BookmarksPage;
  let token: string;
  let drop: DropBoxStub;

  beforeEach(async () => {
    process.env.BOOKMARKS_DROP_SECRET = DROP_STUB_SECRET;
    h = await bootHomestead();
    // The harness serves requests but leaves scheduled pulls off, as the
    // server does until its schema sync has run; collecting needs them.
    await h.app.syncPulls.start();
    installPageStub();
    drop = installDropBoxStub();
    await setAppFlag(h.admin.token, 'bookmarks', 'drop_box_url', DROP_STUB_ORIGIN);
    ({ token } = await h.loginAs(h.member));
    bookmarks = new BookmarksPage(h.driver);
  });

  afterEach(async () => {
    await h.close();
    if (realSecret === undefined) delete process.env.BOOKMARKS_DROP_SECRET;
    else process.env.BOOKMARKS_DROP_SECRET = realSecret;
  });

  /** What the shortcut's "Get Contents of URL" action sends: no headers, one field. */
  const share = (address: string, url: string) =>
    fetch(address, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });

  /** The box behind a shortcut address. */
  const boxBehind = (address: string) => boxOf(address.slice(address.lastIndexOf('/') + 1));

  /** Share once the drop box has heard of the box (registering it follows the inbox's creation). */
  const shareWhenReady = async (address: string, url: string) => {
    const box = await boxBehind(address);
    await expect.poll(() => drop.store.hasBox(box), { timeout: 5000 }).toBe(true);
    expect((await share(address, url)).status).toBe(202);
  };

  test('a link shared to the drop box is collected, privately, as the person', async () => {
    await bookmarks.goto();
    const address = await bookmarks.createIphoneAddress();
    expect(address.startsWith(`${DROP_STUB_ORIGIN}/in/`)).toBe(true);

    await shareWhenReady(address, ARTICLE_URL);
    await bookmarks.finishIphoneSetup();
    await bookmarks.checkIphoneInboxNow();
    await bookmarks.closeDialog();

    await bookmarks.expectBookmark(ARTICLE_TITLE);
    await bookmarks.expectRowVisibility(ARTICLE_TITLE, 'private');
    await bookmarks.expectRowViaPhone(ARTICLE_TITLE);
    // Theirs, and only theirs: collected by the system, but not the system's.
    expect((await listBookmarks(token)).map((b) => b.url)).toEqual([ARTICLE_URL]);
    expect(await listBookmarks(h.householdMember.token)).toEqual([]);
    // Taken once: nothing is left waiting to be filed again.
    await expect.poll(async () => drop.store.countLinks(await boxBehind(address))).toBe(0);
  });

  test('a shortcut set up for the family saves for the family', async () => {
    await bookmarks.goto();
    const address = await bookmarks.createIphoneAddress('household');
    await shareWhenReady(address, ARTICLE_URL);
    await bookmarks.finishIphoneSetup();
    await bookmarks.checkIphoneInboxNow();

    await expect
      .poll(async () => (await listBookmarks(h.householdMember.token)).map((b) => b.url), { timeout: 5000 })
      .toEqual([ARTICLE_URL]);
  });

  test('the drop box holds only a hash of the key, and no key opens a box nobody made', async () => {
    await bookmarks.goto();
    const address = await bookmarks.createIphoneAddress();
    const key = address.slice(address.lastIndexOf('/') + 1);
    const box = await boxBehind(address);
    await expect.poll(() => drop.store.hasBox(box), { timeout: 5000 }).toBe(true);
    expect(box).not.toContain(key);

    expect((await share(`${DROP_STUB_ORIGIN}/in/${'x'.repeat(43)}`, ARTICLE_URL)).status).toBe(404);
  });

  test('removing a shortcut stops its address working', async () => {
    await bookmarks.goto();
    const address = await bookmarks.createIphoneAddress();
    await shareWhenReady(address, 'https://example.com/before');
    await bookmarks.finishIphoneSetup();

    await bookmarks.removeIphoneInbox();

    await expect.poll(async () => (await share(address, ARTICLE_URL)).status, { timeout: 5000 }).toBe(404);
  });

  test('takes only web links from a drop box that lies, and only so many an hour', async () => {
    await bookmarks.goto();
    const address = await bookmarks.createIphoneAddress();
    const box = await boxBehind(address);
    await expect.poll(() => drop.store.hasBox(box), { timeout: 5000 }).toBe(true);

    // Someone in control of the drop box puts what they like in the box.
    const now = Date.now();
    await drop.store.addLink(box, { id: 'junk-1', url: 'javascript:alert(1)' }, now);
    await drop.store.addLink(box, { id: 'junk-2', url: 'file:///etc/passwd' }, now);
    const flood = MAX_LINKS_PER_HOUR + 5;
    for (let i = 0; i < flood; i++) {
      await drop.store.addLink(box, { id: `flood-${i}`, url: `https://example.com/flood/${i}` }, now);
    }

    await bookmarks.finishIphoneSetup();
    await bookmarks.checkIphoneInboxNow();

    await expect.poll(async () => (await listBookmarks(token)).length, { timeout: 8000 }).toBe(MAX_LINKS_PER_HOUR);
    const saved = await listBookmarks(token);
    expect(saved.every((b) => b.url.startsWith('https://example.com/flood/'))).toBe(true);
    expect(saved.every((b) => b.visibility === 'private')).toBe(true);
    // The rest wait where they are; a second look this hour files no more.
    await expect.poll(() => drop.store.countLinks(box)).toBe(5);
    await bookmarks.checkIphoneInboxNow();
    await expect.poll(() => drop.store.countLinks(box)).toBe(5);
    expect(await listBookmarks(token)).toHaveLength(MAX_LINKS_PER_HOUR);
  });
});
