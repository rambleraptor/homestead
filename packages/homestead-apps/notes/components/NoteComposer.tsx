import { useEffect, useRef, type FormEvent, type KeyboardEvent } from 'react';
import { ArrowUp } from 'lucide-react';
import { Button } from '@rambleraptor/homestead-core/shared/components/ui/button';
import { Textarea } from '@rambleraptor/homestead-core/shared/components/ui/textarea';
import { cn } from '@rambleraptor/homestead-core/shared/lib/utils';
import { useDeviceDraft } from '@rambleraptor/homestead-core/shared/hooks/useDeviceDraft';
import { haptic } from '@rambleraptor/homestead-core/shared/haptics';
import { COMPOSE_DRAFT } from '../notes';

interface NoteComposerProps {
  onSave: (body: string) => Promise<unknown>;
  /** Put the cursor in the box on mount (a "New note" launch). */
  autoFocus?: boolean;
  className?: string;
}

/**
 * The write box, docked at the bottom like a chat composer. Enter makes a new
 * line (notes are often lists); Ctrl/Cmd+Enter or the button saves. The box
 * clears and keeps focus, so the next note can follow straight away.
 */
export function NoteComposer({ onSave, autoFocus = false, className }: NoteComposerProps) {
  const [draft, setDraft] = useDeviceDraft(COMPOSE_DRAFT);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!autoFocus) return;
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    // At the end of any draft, ready to keep writing.
    input.setSelectionRange(input.value.length, input.value.length);
  }, [autoFocus]);
  const canSave = draft.trim().length > 0;

  const save = async () => {
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    inputRef.current?.focus();
    haptic('tap');
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
      className={cn(
        'flex items-end gap-2 border-t border-gray-200 bg-surface-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:px-6',
        className,
      )}
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
