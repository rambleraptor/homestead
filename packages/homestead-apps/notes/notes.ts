/**
 * Pure helpers for the notes stream: tags, search, and grouping by day.
 */

import type { Note } from './types';

/** `#word` at the start or after whitespace; letters, digits, `_` and `-`. */
const TAG_PATTERN = /(^|\s)#([\p{L}\p{N}_-]+)/gu;

/** The tags in a note's body, lowercased, in order of first use. */
export function extractTags(body: string): string[] {
  const seen = new Set<string>();
  for (const match of body.matchAll(TAG_PATTERN)) seen.add(match[2]!.toLowerCase());
  return [...seen];
}

export type BodySegment = { text: string } | { tag: string; text: string };

/** A body split into plain text and tags, so the tags can render as links. */
export function splitBody(body: string): BodySegment[] {
  const segments: BodySegment[] = [];
  let last = 0;
  for (const match of body.matchAll(TAG_PATTERN)) {
    const start = match.index! + match[1]!.length;
    if (start > last) segments.push({ text: body.slice(last, start) });
    const text = `#${match[2]}`;
    segments.push({ tag: match[2]!.toLowerCase(), text });
    last = start + text.length;
  }
  if (last < body.length) segments.push({ text: body.slice(last) });
  return segments;
}

/**
 * Whether a note matches a search. Every word must match: `#tag` words match
 * the note's tags exactly, the rest match anywhere in the body, ignoring case.
 */
export function matchesQuery(note: Pick<Note, 'body'>, query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const body = note.body.toLowerCase();
  const tags = extractTags(note.body);
  return words.every((word) =>
    word.startsWith('#') && word.length > 1 ? tags.includes(word.slice(1)) : body.includes(word),
  );
}

export interface DayGroup {
  /** Local calendar day, `YYYY-MM-DD`. */
  key: string;
  label: string;
  notes: Note[];
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

/**
 * Notes oldest → newest, grouped by the local day they were written — the
 * order of a page you write down, with the newest beside the composer.
 */
export function groupByDay(notes: readonly Note[], now: Date = new Date()): DayGroup[] {
  const sorted = [...notes].sort((a, b) => a.create_time.localeCompare(b.create_time));
  const groups: DayGroup[] = [];
  for (const note of sorted) {
    const date = new Date(note.create_time);
    const key = localDayKey(date);
    const current = groups[groups.length - 1];
    if (current?.key === key) current.notes.push(note);
    else groups.push({ key, label: dayLabel(date, now), notes: [note] });
  }
  return groups;
}

/** A note's time of day for the margin, e.g. "9:41 AM". */
export function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
