import { useResourceCreate } from '@rambleraptor/homestead-core/api/resourceHooks';
import type { Note, NoteFormData } from '../types';

/**
 * Write a note under `/users/{me}/notes`. Goes through the outbox, so a note
 * written offline is kept on the device and sent when the connection is back.
 * Pass `recordId` to put a deleted note back under its old id.
 */
export function useCreateNote() {
  return useResourceCreate<Note, NoteFormData & { recordId?: string }>('notes', 'note');
}
