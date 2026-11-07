/**
 * `#todo` in a note also files that line as a personal todo.
 *
 * A resource sync on `note` (server-side, after the write commits), so it
 * covers every way a note is written — the Notes page, the dashboard widget,
 * the assistant, a note written offline that syncs later. Only lines new to
 * this change make todos (`newTodoTitles`); the todo is its own thing after
 * that.
 *
 * Idempotent without storing anything: a todo's id is derived from the note
 * and the line, so a retried firing — or the same line added again — finds
 * its todo already there (409) instead of making a second one.
 */

import type { SyncHandler } from '@rambleraptor/homestead-core/apps/sync';
import { serverClient } from '@rambleraptor/homestead-core/server/client';
import { newTodoTitles } from '../notes';
import type { Note } from '../types';

/** The personal todo a note's line makes always has the same id. */
export async function todoIdFor(noteId: string, title: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${noteId}\n${title}`));
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  return `nt${hex.slice(0, 30)}`;
}

function errorCode(error: unknown): number | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'number' ? code : undefined;
}

const handler: SyncHandler = async (ctx) => {
  const note = ctx.record as unknown as Note | null;
  const titles = newTodoTitles(note, ctx.previous as unknown as Note | null);
  if (!note || titles.length === 0) return { created: 0 };

  // `users/{uid}/notes/{id}`: the todo goes to the note's writer.
  const [root, userId] = note.path.split('/');
  if (root !== 'users' || !userId) throw new Error(`unexpected note path "${note.path}"`);
  const todos = serverClient(ctx.token)
    .collection('users')
    .record(userId)
    .collection('personal-todos');

  let created = 0;
  for (const title of titles) {
    try {
      await todos.create({ title, status: 'pending' }, { id: await todoIdFor(ctx.recordId, title) });
      created += 1;
    } catch (error) {
      const code = errorCode(error);
      // Already made by an earlier firing.
      if (code === 409) continue;
      // The Todos app isn't installed here: nothing to file into.
      if (code === 404) return { created, skipped: 'todos not installed' };
      throw error;
    }
  }
  await ctx.log(`filed ${created} todo${created === 1 ? '' : 's'}`);
  return { created };
};

export default handler;
