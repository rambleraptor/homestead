/**
 * The notes widget in one line, for the agentic home's strip. Always there —
 * it's a place to write, so it shouldn't vanish on a day with nothing written
 * yet — and never urgent.
 */

import type { WidgetSummary } from '@rambleraptor/homestead-core/apps/types';
import { notesWrittenToday } from '../notes';
import { useNotes } from './useNotes';

export default function useNotesSummary(): WidgetSummary | null | undefined {
  const { data, isLoading } = useNotes();
  if (isLoading) return undefined;
  const today = notesWrittenToday(data ?? []);
  if (today === 0) return { headline: 'Jot something down' };
  return { headline: today === 1 ? '1 note today' : `${today} notes today` };
}
