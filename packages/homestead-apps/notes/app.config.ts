/**
 * Notes App Configuration
 *
 * Quick, private notes in one long stream — like writing on paper. No titles,
 * folders or notebooks: write a line, and find it again by scrolling,
 * searching, or tapping a #tag.
 */

import type { AppConfig } from '@rambleraptor/homestead-core/apps/types';
import { newTodoTitles } from './notes';
import { notesResources } from './resources';
import type { Note } from './types';

export const notesApp: AppConfig = {
  id: 'notes',
  name: 'Notes',
  description: 'Quick private notes in one long list, like writing on paper.',
  resources: notesResources,
  chat: {
    instructions: [
      "Notes are the speaker's own private jottings (the notes tool, user-scoped via user_id). " +
        'When someone asks to note, jot or write something down, create a note with their words as the body. ' +
        'To recall something they wrote, list their notes with a filter such as body.contains("plumber") ' +
        '(try a few likely words), newest first; #words in a body are tags.',
      'A line of a note with #todo is also added to the writer\'s personal todos automatically — ' +
        'don\'t create the todo separately.',
    ],
  },
  // `#todo` on a line of a note also files it as a personal todo.
  syncs: [
    {
      id: 'notes-todo-tag',
      resource: 'note',
      title: 'File #todo lines as todos',
      on: ['create', 'update'],
      // Most notes have no #todo: skip them without starting an operation.
      when: ({ record, previous }) =>
        newTodoTitles(record as Note | null, previous as Note | null).length > 0,
      load: () => import('./syncs/note-todos'),
    },
  ],
  web: {
    icon: () => import('lucide-react').then((m) => m.NotebookPen),
    basePath: '/notes',
    homeScreenIcon: '/app-icons/notes.png',
    routes: [
      {
        path: '',
        index: true,
        component: () => import('./components/NotesHome').then((m) => m.NotesHome),
      },
    ],
    // Long-press the installed icon → straight into a new note.
    shortcuts: [{ name: 'New note', path: '?compose' }],
    // Share a link or a highlighted sentence from any app into a note (Android).
    shareTarget: { text: true },
    showInNav: true,
    navOrder: 6,
    section: 'Tasks',
    widgets: [
      {
        id: 'notes-capture',
        label: 'Notes',
        summary: () => import('./hooks/useNotesSummary'),
        component: () => import('./components/NotesWidget').then((m) => m.NotesWidget),
        order: 7,
      },
    ],
  },
};
