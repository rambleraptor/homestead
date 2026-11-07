import { useRef, type FormEvent, type KeyboardEvent } from 'react';
import { ArrowUp } from 'lucide-react';
import { Button } from '@rambleraptor/homestead-core/shared/components/ui/button';
import { Textarea } from '@rambleraptor/homestead-core/shared/components/ui/textarea';
import { useNoteDraft } from '../hooks/useNoteDraft';

interface NoteComposerProps {
  onSave: (body: string) => Promise<unknown>;
}

/**
 * The write box, docked at the bottom like a chat composer. Enter makes a new
 * line (notes are often lists); Ctrl/Cmd+Enter or the button saves. The box
 * clears and keeps focus, so the next note can follow straight away.
 */
export function NoteComposer({ onSave }: NoteComposerProps) {
  const [draft, setDraft] = useNoteDraft();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const canSave = draft.trim().length > 0;

  const save = async () => {
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    inputRef.current?.focus();
    try {
      await onSave(body);
    } catch {
      // The global mutation handler toasts the failure; give the text back so
      // nothing typed is lost.
      setDraft(body);
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void save();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void save();
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      className="flex items-end gap-2 border-t border-gray-200 bg-surface-white px-4 py-3 lg:px-6"
      data-testid="notes-composer"
    >
      <Textarea
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Write a note…"
        aria-label="New note"
        rows={1}
        className="max-h-48 min-h-[44px] resize-none [field-sizing:content]"
        data-testid="notes-composer-input"
      />
      <Button
        type="submit"
        size="icon"
        aria-label="Save note"
        disabled={!canSave}
        className="shrink-0 rounded-full"
        data-testid="notes-composer-submit"
      >
        <ArrowUp className="size-4" aria-hidden />
      </Button>
    </form>
  );
}
