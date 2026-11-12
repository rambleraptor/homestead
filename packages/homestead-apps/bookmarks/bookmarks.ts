/**
 * Pure helpers for the bookmarks list: reading a link out of what someone
 * typed or shared, labels, search, filters, and grouping by day.
 */

import type { Bookmark, BookmarkKind, BookmarkVisibility } from './types';

/** The query the installed icon's "Save a link" shortcut opens `/bookmarks` with. */
export const SAVE_PARAM = 'save';

/** Where the save box remembers, per device, who the last link was saved for. */
export const VISIBILITY_DRAFT = 'bookmarks.visibility';

const URL_IN_TEXT = /https?:\/\/[^\s<>"']+/i;
/** `example.com/path` typed without a scheme: a dotted host, then anything. */
const BARE_HOST = /^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?(\/\S*)?$/i;
/** Punctuation a sentence leaves stuck to the end of a link. */
const TRAILING_PUNCTUATION = /[.,;:!?)\]}'"]+$/;

function parseHttp(candidate: string): string | null {
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname.includes('.') || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * The link in what someone typed, pasted or shared — `null` when there isn't
 * one. Takes a bare `example.com/page` (as https), and the first link in a
 * longer text (a share often reads "Title https://…").
 */
export function linkFrom(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  const embedded = URL_IN_TEXT.exec(text)?.[0];
  if (embedded) {
    // A link ending a sentence drags its full stop along; a real path may
    // end in one of these too, so only strip when the link isn't the whole text.
    const candidate = embedded === text ? embedded : embedded.replace(TRAILING_PUNCTUATION, '');
    return parseHttp(candidate);
  }
  return BARE_HOST.test(text) ? parseHttp(`https://${text}`) : null;
}

/** A link's host without `www.`, for a row's source label. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** What a row is headed with: the page's title once known, else its address. */
export function displayTitle(bookmark: Pick<Bookmark, 'title' | 'url'>): string {
  return bookmark.title?.trim() || bookmark.url;
}

/** Where a row says it's from: the site's name, else the host. */
export function sourceLabel(bookmark: Pick<Bookmark, 'site_name' | 'url'>): string {
  return bookmark.site_name?.trim() || hostOf(bookmark.url);
}

const VIDEO_HOSTS = /(^|\.)(youtube\.com|youtu\.be|vimeo\.com|twitch\.tv|dailymotion\.com)$/i;

/** What a link is, as far as its address alone says. */
export function kindFromUrl(url: string): BookmarkKind | undefined {
  try {
    const parsed = new URL(url);
    if (VIDEO_HOSTS.test(parsed.hostname)) return 'video';
    if (/\.pdf$/i.test(parsed.pathname)) return 'pdf';
  } catch {
    // Not an address: nothing to say.
  }
  return undefined;
}

/** A tag as stored: lowercase, no `#`, spaces as dashes. Empty when nothing is left. */
export function normalizeTag(raw: string): string {
  return raw
    .trim()
    .replace(/^#+/, '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}_-]/gu, '');
}

/** Tags typed as one line ("travel, #italy food"), normalized and de-duplicated. */
export function parseTags(input: string): string[] {
  const seen = new Set<string>();
  for (const part of input.split(/[,\s]+/)) {
    const tag = normalizeTag(part);
    if (tag) seen.add(tag);
  }
  return [...seen];
}

/** When it was saved: its own stamp, else when the server got it. */
export function savedAt(bookmark: Pick<Bookmark, 'saved_at' | 'create_time'>): string {
  return bookmark.saved_at || bookmark.create_time;
}

/** Newest first, by when each was saved. */
export function bySavedDesc(a: Bookmark, b: Bookmark): number {
  return savedAt(b).localeCompare(savedAt(a));
}

/** Whose bookmarks a list shows. */
export type BookmarkScope = 'all' | 'private' | 'family';
/** Which of them, by reading state. */
export type BookmarkShelf = 'inbox' | 'read' | 'favorites' | 'everything';

export function visibilityOf(bookmark: Pick<Bookmark, 'visibility'>): BookmarkVisibility {
  return bookmark.visibility === 'household' ? 'household' : 'private';
}

export function matchesScope(bookmark: Pick<Bookmark, 'visibility'>, scope: BookmarkScope): boolean {
  if (scope === 'all') return true;
  return scope === 'family' ? visibilityOf(bookmark) === 'household' : visibilityOf(bookmark) === 'private';
}

export function matchesShelf(bookmark: Pick<Bookmark, 'read' | 'favorite'>, shelf: BookmarkShelf): boolean {
  switch (shelf) {
    case 'inbox':
      return !bookmark.read;
    case 'read':
      return !!bookmark.read;
    case 'favorites':
      return !!bookmark.favorite;
    case 'everything':
      return true;
  }
}

/**
 * Whether a bookmark matches a search. Every word must match: `#tag` words
 * match a tag exactly, the rest match anywhere in the title, site, author,
 * excerpt, address or tags, ignoring case.
 */
export function matchesQuery(bookmark: Bookmark, query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const tags = (bookmark.tags ?? []).map((tag) => tag.toLowerCase());
  const haystack = [
    bookmark.title,
    bookmark.site_name,
    bookmark.author,
    bookmark.excerpt,
    bookmark.url,
    ...tags,
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
  return words.every((word) =>
    word.startsWith('#') && word.length > 1 ? tags.includes(word.slice(1)) : haystack.includes(word),
  );
}

/** Every tag in use, most used first, then by name. */
export function tagCounts(bookmarks: readonly Bookmark[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const bookmark of bookmarks) {
    for (const tag of bookmark.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

export interface DayGroup {
  /** Local calendar day, `YYYY-MM-DD`. */
  key: string;
  label: string;
  bookmarks: Bookmark[];
}

function localDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** "Today", "Yesterday", "Tue, Nov 3", or "Tue, Nov 3, 2025" outside this year. */
export function dayLabel(date: Date, now: Date = new Date()): string {
  const key = localDayKey(date);
  if (key === localDayKey(now)) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (key === localDayKey(yesterday)) return 'Yesterday';
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  });
}

/** Bookmarks newest → oldest, grouped by the local day they were saved. */
export function groupByDay(bookmarks: readonly Bookmark[], now: Date = new Date()): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const bookmark of [...bookmarks].sort(bySavedDesc)) {
    const date = new Date(savedAt(bookmark));
    const key = localDayKey(date);
    const current = groups[groups.length - 1];
    if (current?.key === key) current.bookmarks.push(bookmark);
    else groups.push({ key, label: dayLabel(date, now), bookmarks: [bookmark] });
  }
  return groups;
}

/** "8 min read" from a word count, at an easy reading pace. */
export function readingTime(wordCount: number | undefined): string | null {
  if (!wordCount || wordCount <= 0) return null;
  return `${Math.max(1, Math.round(wordCount / 230))} min read`;
}

/** The id out of a `users/{id}` resource name. */
export function userIdOf(createdBy: string | undefined): string | null {
  if (!createdBy) return null;
  const parts = createdBy.split('/');
  return parts[parts.length - 1] || null;
}

/**
 * Whether `userId` saved this bookmark. `created_by` says so when it's set
 * (the app sets it; a write from elsewhere may not), and a private bookmark
 * with no name on it is its viewer's own — that is what private means.
 */
export function isMine(bookmark: Pick<Bookmark, 'created_by' | 'visibility'>, userId: string): boolean {
  const saver = userIdOf(bookmark.created_by);
  if (saver) return saver === userId;
  return visibilityOf(bookmark) === 'private';
}
