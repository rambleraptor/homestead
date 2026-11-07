import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { useResourceList } from '@rambleraptor/homestead-core/api/resourceHooks';
import { USERS } from '@rambleraptor/homestead-core/resources/builtins';
import { NOTES } from '../resources';
import type { Note } from '../types';

/**
 * Every note the signed-in person has written, newest first. The whole
 * collection is read (the client follows pagination): notes are short, and
 * holding them all makes search instant and keeps it working offline.
 */
export function useNotes() {
  const userId = aepbase.getCurrentUser()?.id ?? '';
  return useResourceList<Note>('notes', 'note', NOTES, {
    parent: [USERS, userId],
    orderBy: '-create_time',
  });
}
