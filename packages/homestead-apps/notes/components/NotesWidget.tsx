import { NotebookPen } from 'lucide-react';
import { WidgetCard } from '@rambleraptor/homestead-core/shared/components/WidgetCard';
import { useCreateNote } from '../hooks/useCreateNote';
import { useNotes } from '../hooks/useNotes';
import { timeLabel, writtenAt } from '../notes';
import { NoteComposer } from './NoteComposer';

/** How many recent notes the widget shows under the write box. */
const RECENT = 3;

/**
 * Write a note without leaving the dashboard: the same write box as the Notes
 * page (and the same draft), with the last few notes under it.
 */
export function NotesWidget() {
  const notes = useNotes();
  const createNote = useCreateNote();
  const recent = (notes.data ?? []).slice(0, RECENT);

  return (
    <WidgetCard icon={NotebookPen} title="Notes" href="/notes">
      <div data-testid="notes-widget">
        <NoteComposer
          onSave={(body) => createNote.mutateAsync({ body })}
          className="border-t-0 bg-transparent px-0 pt-0 pb-2 lg:px-0"
        />
        {recent.length > 0 && (
          <ul className="space-y-1">
            {recent.map((note) => (
              <li key={note.id} className="flex gap-2 text-sm" data-testid="notes-widget-note">
                <time className="w-16 shrink-0 text-right text-xs tabular-nums text-text-muted">
                  {timeLabel(writtenAt(note))}
                </time>
                <span className="min-w-0 flex-1 truncate font-body text-text-main">
                  {note.body.split('\n', 1)[0]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </WidgetCard>
  );
}
