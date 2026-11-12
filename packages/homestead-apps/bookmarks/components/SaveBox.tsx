import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { VisibilityPicker } from '@rambleraptor/homestead-core/permissions/components/VisibilityPicker';
import { Button } from '@rambleraptor/homestead-core/shared/components/ui/button';
import { Input } from '@rambleraptor/homestead-core/shared/components/ui/input';
import { cn } from '@rambleraptor/homestead-core/shared/lib/utils';
import { haptic } from '@rambleraptor/homestead-core/shared/haptics';
import { linkFrom } from '../bookmarks';
import { useSaveVisibility } from '../hooks/useSaveVisibility';
import type { BookmarkVisibility } from '../types';

interface SaveBoxProps {
  onSave: (url: string, visibility: BookmarkVisibility) => Promise<unknown>;
  /** Put the cursor in the box on mount (a "Save a link" launch). */
  autoFocus?: boolean;
  /** The picker as icons only, for the dashboard widget. */
  compact?: boolean;
  className?: string;
}

/**
 * Paste a link, say who it's for, save. The box clears and keeps focus so the
 * next link can follow; who it's for is remembered on this device.
 */
export function SaveBox({ onSave, autoFocus = false, compact = false, className }: SaveBoxProps) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [visibility, setVisibility] = useSaveVisibility();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const typed = value.trim();
    if (!typed) return;
    const url = linkFrom(typed);
    if (!url) {
      setError('That doesn’t look like a link. Paste a web address, like https://example.com/article.');
      return;
    }
    setError(null);
    setValue('');
    inputRef.current?.focus();
    haptic('tap');
    try {
      await onSave(url, visibility);
    } catch {
      // The global mutation handler toasts the failure; give the link back so
      // it can be saved again.
      setValue(typed);
    }
  };

  return (
    <form onSubmit={onSubmit} className={cn('space-y-1', className)} data-testid="bookmark-save-box" noValidate>
      <div className="flex items-center gap-2">
        <Input
          ref={inputRef}
          type="url"
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          placeholder="Paste a link to save…"
          aria-label="Link to save"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'bookmark-save-error' : undefined}
          className="min-w-0 flex-1"
          data-testid="bookmark-save-input"
        />
        <VisibilityPicker singular="bookmark" value={visibility} onChange={setVisibility} compact={compact} />
        <Button
          type="submit"
          size={compact ? 'icon' : 'default'}
          aria-label={compact ? 'Save link' : undefined}
          disabled={!value.trim()}
          className="shrink-0"
          data-testid="bookmark-save-submit"
        >
          {compact ? <Plus className="size-4" aria-hidden /> : 'Save'}
        </Button>
      </div>
      {error && (
        <p id="bookmark-save-error" role="alert" className="text-sm text-red-600" data-testid="bookmark-save-error">
          {error}
        </p>
      )}
    </form>
  );
}
