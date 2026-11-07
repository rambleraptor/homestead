import { describe, expect, it } from 'vitest';
import {
  byWrittenDesc,
  dayLabel,
  extractTags,
  groupByDay,
  matchesQuery,
  newTodoTitles,
  notesWrittenToday,
  todoTitles,
  splitBody,
  writtenAt,
} from '../notes';
import type { Note } from '../types';

function note(id: string, body: string, create_time: string): Note {
  return { id, path: `users/u/notes/${id}`, body, create_time, update_time: create_time };
}

describe('extractTags', () => {
  it('finds #words, lowercased and unique, in order', () => {
    expect(extractTags('Call #Plumber about the #sink, then #plumber again')).toEqual(['plumber', 'sink']);
  });

  it('ignores a # inside a word or alone', () => {
    expect(extractTags('issue#12 and # nothing')).toEqual([]);
  });
});

describe('splitBody', () => {
  it('splits text and tags, keeping every character', () => {
    const segments = splitBody('Dave 555-0142 #house\nnext');
    expect(segments).toEqual([{ text: 'Dave 555-0142 ' }, { tag: 'house', text: '#house' }, { text: '\nnext' }]);
    expect(segments.map((s) => s.text).join('')).toBe('Dave 555-0142 #house\nnext');
  });
});

describe('matchesQuery', () => {
  const n = note('1', 'Plumber Dave 555-0142 #house', '2026-11-07T10:00:00Z');

  it('matches every word, ignoring case', () => {
    expect(matchesQuery(n, 'dave plumber')).toBe(true);
    expect(matchesQuery(n, 'dave electrician')).toBe(false);
  });

  it('matches #tags exactly', () => {
    expect(matchesQuery(n, '#house')).toBe(true);
    expect(matchesQuery(n, '#hous')).toBe(false);
  });

  it('matches everything on an empty query', () => {
    expect(matchesQuery(n, '  ')).toBe(true);
  });
});

describe('groupByDay', () => {
  const now = new Date(2026, 10, 7, 12, 0);

  it('groups oldest → newest by local day, with friendly labels', () => {
    const groups = groupByDay(
      [
        note('c', 'today late', new Date(2026, 10, 7, 9, 30).toISOString()),
        note('a', 'yesterday', new Date(2026, 10, 6, 20, 0).toISOString()),
        note('b', 'today early', new Date(2026, 10, 7, 8, 0).toISOString()),
      ],
      now,
    );
    expect(groups.map((g) => g.label)).toEqual(['Yesterday', 'Today']);
    expect(groups[1]!.notes.map((x) => x.id)).toEqual(['b', 'c']);
  });

  it('adds the year only outside the current one', () => {
    expect(dayLabel(new Date(2026, 9, 3), now)).not.toMatch(/2026/);
    expect(dayLabel(new Date(2025, 9, 3), now)).toMatch(/2025/);
  });
});

describe('written time', () => {
  it('prefers the time the note was written over when the server got it', () => {
    const offline = { ...note('a', 'x', '2026-11-07T17:00:00Z'), written_at: '2026-11-07T09:00:00.000Z' };
    const online = note('b', 'y', '2026-11-07T12:00:00Z');
    expect(writtenAt(offline)).toBe('2026-11-07T09:00:00.000Z');
    expect([offline, online].sort(byWrittenDesc).map((n) => n.id)).toEqual(['b', 'a']);
  });

  it('counts the notes written today', () => {
    const now = new Date(2026, 10, 7, 12, 0);
    expect(
      notesWrittenToday(
        [
          note('a', 'x', new Date(2026, 10, 7, 8, 0).toISOString()),
          note('b', 'y', new Date(2026, 10, 6, 8, 0).toISOString()),
        ],
        now,
      ),
    ).toBe(1);
  });
});

describe('#todo lines', () => {
  it('makes one todo per tagged line, without the tag or a list marker', () => {
    const body = 'Weekend\n- call the plumber #todo\n#todo buy paint\nhallway is #todo-ish\n[ ] Fix gate #Todo';
    expect(todoTitles({ body })).toEqual(['call the plumber', 'buy paint', 'Fix gate']);
  });

  it('asks for nothing from a crossed-out note, or a bare tag', () => {
    expect(todoTitles({ body: 'call the plumber #todo', struck: true })).toEqual([]);
    expect(todoTitles({ body: '#todo' })).toEqual([]);
  });

  it('adds only the lines new to a change', () => {
    const before = { body: 'call the plumber #todo' };
    const after = { body: 'call the plumber #todo\nbuy paint #todo' };
    expect(newTodoTitles(after, before)).toEqual(['buy paint']);
    expect(newTodoTitles(before, before)).toEqual([]);
    expect(newTodoTitles(before, null)).toEqual(['call the plumber']);
    // Restoring a crossed-out note doesn't bring back todos dealt with since.
    expect(newTodoTitles(before, { ...before, struck: true })).toEqual([]);
  });
});
