/**
 * Notes, on the VM tier: writing, recalling (search and tags), editing,
 * crossing out, deleting with undo, the device draft, and privacy. Each test
 * boots from a fresh copy of the template database, so there is no cleanup.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { NotesPage } from '../e2e/NotesPage';
import { createNote, listNotes } from '../e2e/helpers';

describe('Notes', () => {
  let h: Harness;
  let notes: NotesPage;
  let token: string;
  let userId: string;

  beforeEach(async () => {
    h = await bootHomestead();
    ({ token } = await h.loginAs(h.member));
    userId = h.member.id;
    notes = new NotesPage(h.driver);
  });

  afterEach(async () => {
    await h.close();
  });

  test('writes a note from the composer, privately under the writer', async () => {
    await notes.goto();
    await notes.expectEmptyState();

    await notes.write('Plumber: Dave, 555-0142 #house');

    await notes.expectNote('Plumber: Dave, 555-0142');
    await notes.expectComposerValue('');
    await expect.poll(async () => (await listNotes(token, userId)).map((n) => n.body)).toEqual([
      'Plumber: Dave, 555-0142 #house',
    ]);
  });

  test('saves with Ctrl+Enter', async () => {
    await notes.goto();
    await notes.writeWithShortcut('Library books due Thursday');
    await notes.expectNote('Library books due Thursday');
  });

  test('keeps an unsaved draft across a reload', async () => {
    await notes.goto();
    await h.driver.getByTestId('notes-composer-input').fill('Half a thought');
    await h.driver.reload();
    await notes.expectComposerValue('Half a thought');
  });

  test('recalls notes by search and by tag', async () => {
    await createNote(token, userId, { body: 'Plumber Dave 555-0142 #house' });
    await createNote(token, userId, { body: 'Gift idea for Mom: blue scarf #gifts' });
    await createNote(token, userId, { body: 'Paint color for the hall #house' });
    await notes.goto();

    await notes.search('scarf');
    await notes.expectNote('blue scarf');
    await notes.expectNoNote('Plumber Dave');
    await notes.expectMatchCount('1 note matches');

    await notes.clearSearch();
    await notes.clickTag('Plumber Dave', 'house');
    await notes.expectMatchCount('2 notes match');
    await notes.expectNote('Paint color');
    await notes.expectNoNote('blue scarf');
  });

  test('edits and crosses out a note', async () => {
    await createNote(token, userId, { body: 'Call insurance' });
    await notes.goto();

    await notes.edit('Call insurance', 'Call insurance about the roof');
    await notes.expectNote('Call insurance about the roof');

    await notes.toggleStruck('Call insurance about the roof');
    await notes.expectStruck('Call insurance about the roof');
    await expect.poll(async () => (await listNotes(token, userId))[0]?.struck).toBe(true);
  });

  test('deletes a note and puts it back with undo', async () => {
    const seeded = await createNote(token, userId, { body: 'Wifi guy comes Tuesday' });
    await notes.goto();

    await notes.delete('Wifi guy comes Tuesday');
    await notes.expectNoNote('Wifi guy comes Tuesday');
    await expect.poll(async () => (await listNotes(token, userId)).length).toBe(0);

    await notes.undo();
    await notes.expectNote('Wifi guy comes Tuesday');
    await expect.poll(async () => (await listNotes(token, userId)).map((n) => n.id)).toEqual([seeded.id]);
  });

  test("never shows another person's notes", async () => {
    const other = h.householdMember;
    await createNote(other.token, other.id, { body: "Sam's secret note" });
    await createNote(token, userId, { body: 'My own note' });
    await notes.goto();

    await notes.expectNote('My own note');
    await notes.expectNoNote("Sam's secret note");
    await expect(listNotes(token, other.id)).rejects.toThrow();
  });
});
