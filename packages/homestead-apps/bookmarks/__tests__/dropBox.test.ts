import { describe, expect, it } from 'vitest';
import { boxOf as workerBoxOf } from '../../../homestead-drop/src/app';
import {
  BOX_ID,
  bookmarkIdFor,
  boxOf,
  budgetAt,
  collectedLink,
  dropAddress,
  dropBoxBase,
  inboxOwner,
  newDropKey,
} from '../dropBox';

describe('drop keys', () => {
  it('makes a long, URL-safe key, different every time', () => {
    const a = newDropKey();
    const b = newDropKey();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });

  it('agrees with the drop box on which box a key opens', async () => {
    const key = newDropKey();
    const box = await boxOf(key);
    expect(box).toMatch(BOX_ID);
    expect(box).toBe(await workerBoxOf(key));
  });

  it('builds the one address a shortcut needs', () => {
    expect(dropAddress('https://drop.example', 'abc')).toBe('https://drop.example/in/abc');
  });
});

describe('dropBoxBase', () => {
  it('tidies a configured address', () => {
    expect(dropBoxBase(' https://drop.example.workers.dev/ ')).toBe('https://drop.example.workers.dev');
    expect(dropBoxBase('https://example.com/drop/')).toBe('https://example.com/drop');
  });

  it('is null when nothing usable is configured', () => {
    for (const value of ['', '   ', undefined, null, 'drop.example', 'ftp://drop.example', 42]) {
      expect(dropBoxBase(value)).toBeNull();
    }
  });
});

describe('collectedLink', () => {
  it('keeps a web link', () => {
    expect(collectedLink(' https://example.com/a?b=1 ')).toBe('https://example.com/a?b=1');
  });

  it('refuses anything else the drop box might hand over', () => {
    for (const value of [
      'javascript:alert(1)',
      'file:///etc/passwd',
      'data:text/html,<script>',
      'http://localhost/admin',
      'https://user:pass@example.com/',
      `https://example.com/${'a'.repeat(2100)}`,
      'not a link',
      '',
      42,
      null,
      { url: 'https://example.com' },
    ]) {
      expect(collectedLink(value), String(value).slice(0, 30)).toBeNull();
    }
  });
});

describe('bookmarkIdFor', () => {
  it('is the same for the same link, and differs across links and boxes', async () => {
    const id = await bookmarkIdFor('box-a', 'link-1');
    expect(id).toMatch(/^bd[0-9a-f]{30}$/);
    expect(await bookmarkIdFor('box-a', 'link-1')).toBe(id);
    expect(await bookmarkIdFor('box-a', 'link-2')).not.toBe(id);
    expect(await bookmarkIdFor('box-b', 'link-1')).not.toBe(id);
  });
});

describe('inboxOwner', () => {
  it('reads the user out of an inbox’s resource name', () => {
    expect(inboxOwner('users/u1/bookmark-inboxes/i1')).toBe('u1');
  });

  it('is null for anything that isn’t an inbox under a user', () => {
    expect(inboxOwner('bookmark-inboxes/i1')).toBeNull();
    expect(inboxOwner('users/u1/notes/n1')).toBeNull();
    expect(inboxOwner(undefined)).toBeNull();
  });
});

describe('budgetAt', () => {
  const hour = 3_600_000;

  it('carries the count within the hour', () => {
    const now = 500_000 * hour + 1000;
    expect(budgetAt(JSON.stringify({ hour: 500_000, count: 12 }), now)).toEqual({ hour: 500_000, count: 12 });
  });

  it('starts again in a new hour, or with no usable cursor', () => {
    const now = 500_001 * hour;
    expect(budgetAt(JSON.stringify({ hour: 500_000, count: 30 }), now)).toEqual({ hour: 500_001, count: 0 });
    expect(budgetAt(null, now)).toEqual({ hour: 500_001, count: 0 });
    expect(budgetAt('not json', now)).toEqual({ hour: 500_001, count: 0 });
    expect(budgetAt(JSON.stringify({ hour: 500_001, count: -5 }), now)).toEqual({ hour: 500_001, count: 0 });
  });
});
