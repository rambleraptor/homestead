import { useState, type KeyboardEvent } from 'react';
import { Button } from '@rambleraptor/homestead-core/shared/components/ui/button';
import { Textarea } from '@rambleraptor/homestead-core/shared/components/ui/textarea';
import {
  readDeviceDraft,
  writeDeviceDraft,
} from '@rambleraptor/homestead-core/shared/hooks/useDeviceDraft';
import { cn } from '@rambleraptor/homestead-core/shared/lib/utils';
import {
  PendingSyncBadge,
  pendingSyncClass,
} from '@rambleraptor/homestead-core/shared/components/PendingSyncBadge';
import { splitBody, timeLabel, writtenAt } from '../notes';
import type { Note, NoteFormData } from '../types';

interface NoteRowProps {
  note: Note;
  /** Saved on this device, waiting for a connection. */
  pending?: boolean;
  onTag: (tag: string) => void;
  onUpdate: (id: string, data: Partial<NoteFormData>) => Promise<unknown>;
  onDelete: (note: Note) => void;
}

/**
 * One note as a line on the page: its time in the margin, its text as typed.
 * Tap the text to open it for editing, where it can also be crossed out or
 * deleted.
 */
export function NoteRow({ note, pending = false, onTag, onUpdate, onDelete }: NoteRowProps) {
  const draftKey = `notes.edit.${note.id}`;
  // An edit left half-done (the tab closed, the phone locked) reopens as it was.
  const [editing, setEditing] = useState(() => readDeviceDraft(draftKey) !== '');
  const [text, setTextState] = useState(() => readDeviceDraft(draftKey) || note.body);

  const setText = (value: string) => {
    setTextState(value);
    writeDeviceDraft(draftKey, value === note.body ? '' : value);
  };

  const close = () => {
    writeDeviceDraft(draftKey, '');
    setEditing(false);
  };

  const open = () => {
    setTextState(readDeviceDraft(draftKey) || note.body);
    setEditing(true);
  };

  const save = async () => {
    const body = text.trim();
    if (!body) return;
    if (body === note.body) {
      close();
      return;
    }
    try {
      await onUpdate(note.id, { body });
      close();
    } catch {
      // Toasted by the global mutation handler; stay open with the text.
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void save();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  };

  return (
    <li
      className={cn(
        'group flex gap-3 border-b border-dashed border-gray-200 py-2 last:border-b-0',
        pendingSyncClass(pending),
      )}
      data-testid="note-row"
      data-note-id={note.id}
      data-struck={note.struck ? 'true' : undefined}
    >
      <div className="flex w-16 shrink-0 items-start justify-end gap-1 pt-0.5">
        {pending && <PendingSyncBadge iconOnly className="pt-0.5" />}
        <time dateTime={writtenAt(note)} className="text-right text-xs tabular-nums text-text-muted">
          {timeLabel(writtenAt(note))}
        </time>
      </div>
      {editing ? (
        <div className="min-w-0 flex-1 space-y-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            autoFocus
            aria-label="Edit note"
            className="min-h-[60px] resize-none [field-sizing:content]"
            data-testid="note-edit-input"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => void save()} disabled={!text.trim()} data-testid="note-edit-save">
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={close} data-testid="note-edit-cancel">
              Cancel
            </Button>
            <div className="flex-1" />
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                close();
                void onUpdate(note.id, { struck: !note.struck }).catch(() => {
                  // Toasted by the global mutation handler.
                });
              }}
              data-testid="note-toggle-struck"
            >
              {note.struck ? 'Restore' : 'Cross out'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-red-600 hover:text-red-700"
              onClick={() => {
                close();
                onDelete(note);
              }}
              data-testid="note-delete"
            >
              Delete
            </Button>
          </div>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          onClick={open}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              open();
            }
          }}
          aria-label="Edit note"
          className={cn(
            'min-w-0 flex-1 cursor-text whitespace-pre-wrap break-words font-body text-text-main',
            note.struck && 'text-text-muted line-through',
          )}
          data-testid="note-body"
        >
          {splitBody(note.body).map((segment, i) =>
            'tag' in segment ? (
              <button
                key={i}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onTag(segment.tag);
                }}
                className="font-medium text-accent-terracotta hover:underline"
                data-testid={`note-tag-${segment.tag}`}
              >
                {segment.text}
              </button>
            ) : (
              <span key={i}>{segment.text}</span>
            ),
          )}
        </div>
      )}
    </li>
  );
}
