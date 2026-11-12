import { describe, expect, it } from 'vitest';
import {
  displayTitle,
  groupByDay,
  hostOf,
  isMine,
  kindFromUrl,
  linkFrom,
  matchesQuery,
  matchesScope,
  matchesShelf,
  normalizeTag,
  parseTags,
  readingTime,
  sourceLabel,
  tagCounts,
} from '../bookmarks';
import type { Bookmark } from '../types';

function bookmark(overrides: Partial<Bookmark> = {}): Bookmark {
  return {
    id: 'b1',
    path: 'bookmarks/b1',
    url: 'https://www.example.com/article',
    create_time: '2026-03-10T12:00:00Z',
    update_time: '2026-03-10T12:00:00Z',
    ...overrides,
  };
}

describe('linkFrom', () => {
  it('takes a pasted address as it is', () => {
    expect(linkFrom('  https://example.com/a?b=1#c ')).toBe('https://example.com/a?b=1#c');
  });

  it('reads a bare host as https', () => {
    expect(linkFrom('example.com/article')).toBe('https://example.com/article');
  });

  it('finds the link in a longer share, without the sentence punctuation', () => {
    expect(linkFrom('Worth a read: https://example.com/long-read.')).toBe('https://example.com/long-read');
    expect(linkFrom('A title\nhttps://example.com/x')).toBe('https://example.com/x');
  });

  it('keeps punctuation that is part of a lone address', () => {
    expect(linkFrom('https://en.wikipedia.org/wiki/Mercury_(planet)')).toBe(
      'https://en.wikipedia.org/wiki/Mercury_(planet)',
    );
  });

  it('refuses what is not a web link', () => {
    expect(linkFrom('remember the milk')).toBeNull();
    expect(linkFrom('')).toBeNull();
    expect(linkFrom('ftp://example.com/file')).toBeNull();
    expect(linkFrom('javascript:alert(1)')).toBeNull();
    expect(linkFrom('https://user:pass@example.com/')).toBeNull();
    expect(linkFrom('http://localhost/admin')).toBeNull();
  });
});

describe('labels', () => {
  it('heads a row with the title, else the address', () => {
    expect(displayTitle(bookmark({ title: ' A title ' }))).toBe('A title');
    expect(displayTitle(bookmark())).toBe('https://www.example.com/article');
  });

  it('names the source by site, else by host without www', () => {
    expect(sourceLabel(bookmark({ site_name: 'Example News' }))).toBe('Example News');
    expect(sourceLabel(bookmark())).toBe('example.com');
    expect(hostOf('not a url')).toBe('not a url');
  });

  it('tells a video or a pdf from its address', () => {
    expect(kindFromUrl('https://www.youtube.com/watch?v=abc')).toBe('video');
    expect(kindFromUrl('https://youtu.be/abc')).toBe('video');
    expect(kindFromUrl('https://example.com/files/Manual.PDF')).toBe('pdf');
    expect(kindFromUrl('https://example.com/article')).toBeUndefined();
  });

  it('gives a reading time from a word count', () => {
    expect(readingTime(1840)).toBe('8 min read');
    expect(readingTime(40)).toBe('1 min read');
    expect(readingTime(0)).toBeNull();
    expect(readingTime(undefined)).toBeNull();
  });
});

describe('tags', () => {
  it('normalizes a tag', () => {
    expect(normalizeTag('#House Projects')).toBe('house-projects');
    expect(normalizeTag('  Travel! ')).toBe('travel');
    expect(normalizeTag('#')).toBe('');
  });

  it('parses a line of tags without repeats', () => {
    expect(parseTags('travel, #Italy  travel')).toEqual(['travel', 'italy']);
  });

  it('counts tags, most used first', () => {
    const counts = tagCounts([
      bookmark({ tags: ['garden', 'diy'] }),
      bookmark({ tags: ['garden'] }),
      bookmark({ tags: ['art'] }),
    ]);
    expect(counts).toEqual([
      { tag: 'garden', count: 2 },
      { tag: 'art', count: 1 },
      { tag: 'diy', count: 1 },
    ]);
  });
});

describe('filters', () => {
  it('searches title, site, author, excerpt, address and tags', () => {
    const b = bookmark({
      title: 'Growing tomatoes',
      site_name: 'Garden Weekly',
      author: 'Pat Green',
      excerpt: 'Stake them early.',
      tags: ['garden'],
    });
    expect(matchesQuery(b, 'TOMATO')).toBe(true);
    expect(matchesQuery(b, 'weekly pat')).toBe(true);
    expect(matchesQuery(b, 'stake')).toBe(true);
    expect(matchesQuery(b, 'example.com')).toBe(true);
    expect(matchesQuery(b, 'garden')).toBe(true);
    expect(matchesQuery(b, 'tomato basil')).toBe(false);
    expect(matchesQuery(b, '')).toBe(true);
  });

  it('matches a #tag word exactly', () => {
    const b = bookmark({ title: 'Gardening', tags: ['garden'] });
    expect(matchesQuery(b, '#garden')).toBe(true);
    expect(matchesQuery(b, '#gard')).toBe(false);
  });

  it('sorts by reading state', () => {
    expect(matchesShelf(bookmark(), 'inbox')).toBe(true);
    expect(matchesShelf(bookmark({ read: true }), 'inbox')).toBe(false);
    expect(matchesShelf(bookmark({ read: true }), 'read')).toBe(true);
    expect(matchesShelf(bookmark({ favorite: true }), 'favorites')).toBe(true);
    expect(matchesShelf(bookmark(), 'favorites')).toBe(false);
    expect(matchesShelf(bookmark({ read: true }), 'everything')).toBe(true);
  });

  it('sorts by who can see it, reading no visibility as private', () => {
    expect(matchesScope(bookmark({ visibility: 'household' }), 'family')).toBe(true);
    expect(matchesScope(bookmark({ visibility: 'household' }), 'private')).toBe(false);
    expect(matchesScope(bookmark(), 'private')).toBe(true);
    expect(matchesScope(bookmark(), 'all')).toBe(true);
  });
});

describe('isMine', () => {
  it('goes by who saved it when that is recorded', () => {
    expect(isMine(bookmark({ created_by: 'users/me', visibility: 'household' }), 'me')).toBe(true);
    expect(isMine(bookmark({ created_by: 'users/sam', visibility: 'household' }), 'me')).toBe(false);
    expect(isMine(bookmark({ created_by: 'users/sam', visibility: 'private' }), 'me')).toBe(false);
  });

  it('takes an unsigned private bookmark as its viewer’s own, a family one as not', () => {
    expect(isMine(bookmark({ visibility: 'private' }), 'me')).toBe(true);
    expect(isMine(bookmark({ visibility: 'household' }), 'me')).toBe(false);
  });
});

describe('groupByDay', () => {
  it('groups newest first by the day each was saved', () => {
    const now = new Date(2026, 2, 10, 15, 0, 0);
    const at = (day: number, hour: number) => new Date(2026, 2, day, hour).toISOString();
    const groups = groupByDay(
      [
        bookmark({ id: 'old', saved_at: at(3, 9) }),
        bookmark({ id: 'morning', saved_at: at(10, 8) }),
        bookmark({ id: 'yesterday', saved_at: at(9, 20) }),
        bookmark({ id: 'noon', saved_at: at(10, 12) }),
      ],
      now,
    );
    expect(groups.map((g) => g.label).slice(0, 2)).toEqual(['Today', 'Yesterday']);
    expect(groups.map((g) => g.bookmarks.map((b) => b.id))).toEqual([['noon', 'morning'], ['yesterday'], ['old']]);
  });

  it('falls back to when the server got it', () => {
    const groups = groupByDay([bookmark({ create_time: new Date(2026, 2, 10, 9).toISOString() })], new Date(2026, 2, 10, 15));
    expect(groups[0]?.label).toBe('Today');
  });
});
