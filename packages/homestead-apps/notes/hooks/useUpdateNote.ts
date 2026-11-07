import { useResourceUpdate } from '@rambleraptor/homestead-core/api/resourceHooks';
import type { Note, NoteFormData } from '../types';

export function useUpdateNote() {
  return useResourceUpdate<Note, Partial<NoteFormData>>('notes', 'note');
}
