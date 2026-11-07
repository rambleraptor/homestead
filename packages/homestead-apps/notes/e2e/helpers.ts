/**
 * Notes seed helpers — write notes straight through the shared client.
 */

import { e2eClient } from '../../../../tests/e2e/utils/aepbase-helpers';

export interface NoteRecord {
  id: string;
  path: string;
  body: string;
  struck?: boolean;
  written_at?: string;
  create_time: string;
}

/** A person's private notes live under `/users/{userId}/notes`. */
function notes(token: string, userId: string) {
  return e2eClient(token).collection('users').record(userId).collection<NoteRecord>('notes');
}

export async function createNote(
  token: string,
  userId: string,
  data: { body: string; struck?: boolean },
): Promise<NoteRecord> {
  return notes(token, userId).create(data);
}

export async function listNotes(token: string, userId: string): Promise<NoteRecord[]> {
  return notes(token, userId).listAll();
}

export async function updateNote(
  token: string,
  userId: string,
  noteId: string,
  data: { body?: string; struck?: boolean },
): Promise<NoteRecord> {
  return notes(token, userId).record(noteId).update(data);
}

/** The writer's personal todos — where a note's `#todo` lines are filed. */
export async function listPersonalTodoTitles(token: string, userId: string): Promise<string[]> {
  const todos = await e2eClient(token)
    .collection('users')
    .record(userId)
    .collection<{ title: string }>('personal-todos')
    .listAll();
  return todos.map((t) => t.title).sort();
}
