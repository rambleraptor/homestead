/**
 * `#todo` in a note also files the line as a personal todo, on the VM tier.
 * The filing is a server-side resource sync, so these check what lands in the
 * writer's personal todos, polling while the sync runs after the write.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { NotesPage } from '../e2e/NotesPage';
import { createNote, listPersonalTodoTitles, updateNote } from '../e2e/helpers';

describe('#todo in a note', () => {
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

  test('a note written with #todo lines files each as a personal todo', async () => {
    await notes.goto();
    await notes.write('Weekend\n- call the plumber #todo\nbuy paint #todo');
    await expect
      .poll(() => listPersonalTodoTitles(token, userId), { timeout: 5000 })
      .toEqual(['buy paint', 'call the plumber']);
  });

  test('an edit files only the lines it adds, once', async () => {
    const note = await createNote(token, userId, { body: 'call the plumber #todo' });
    await expect
      .poll(() => listPersonalTodoTitles(token, userId), { timeout: 5000 })
      .toEqual(['call the plumber']);

    await updateNote(token, userId, note.id, { body: 'call the plumber #todo\nfix the gate #todo' });
    await expect
      .poll(() => listPersonalTodoTitles(token, userId), { timeout: 5000 })
      .toEqual(['call the plumber', 'fix the gate']);
  });

  test('a note without #todo files nothing', async () => {
    await createNote(token, userId, { body: 'just a thought #idea' });
    await notes.goto();
    await notes.expectNote('just a thought');
    expect(await listPersonalTodoTitles(token, userId)).toEqual([]);
  });
});
