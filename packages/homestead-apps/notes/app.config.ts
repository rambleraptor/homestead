/**
 * Notes App Configuration
 *
 * Quick, private notes in one long stream — like writing on paper. No titles,
 * folders or notebooks: write a line, and find it again by scrolling,
 * searching, or tapping a #tag.
 */

import type { AppConfig } from '@rambleraptor/homestead-core/apps/types';
import { notesResources } from './resources';

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
    ],
  },
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
    showInNav: true,
    navOrder: 6,
    section: 'Tasks',
  },
};
