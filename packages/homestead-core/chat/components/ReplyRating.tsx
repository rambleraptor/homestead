/**
 * Thumbs up / down on an assistant reply. A tap rates it at once, filing the
 * conversation so far as an eval case for the household's superusers (the
 * `:rate` method); tapping the same thumb again takes it back. After a thumbs
 * down, an optional line says what the reply should have done.
 */

import { useState, type FormEvent } from 'react';
import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { MessageAction } from '@rambleraptor/homestead-core/shared/components/ai-elements/message';
import { Button } from '@rambleraptor/homestead-core/shared/components/Button';
import { Input } from '@rambleraptor/homestead-core/shared/components/Input';
import { cn } from '@rambleraptor/homestead-core/shared/lib/utils';
import { useRateReply } from '../hooks/useRateReply';
import type { ReplyRating as Rating } from '../types';

export interface ReplyRatingProps {
  conversationId: string;
  messageId: string;
  /** The stored rating, if any. */
  rating?: Rating;
}

export function ReplyRating({ conversationId, messageId, rating }: ReplyRatingProps) {
  const rate = useRateReply(conversationId);
  // What the person last chose, shown until the stored message catches up.
  const [chosen, setChosen] = useState<Rating | null | undefined>(undefined);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');
  const [noteSent, setNoteSent] = useState(false);
  const current = chosen !== undefined ? chosen : (rating ?? null);

  const choose = async (next: Rating) => {
    const value = current === next ? null : next;
    setChosen(value);
    setNoteOpen(value === 'down');
    setNoteSent(false);
    try {
      await rate.mutateAsync({ messageId, rating: value });
    } catch {
      // Error surfaced by the global mutation error toast (queryClient.ts).
      setChosen(undefined);
      setNoteOpen(false);
    }
  };

  const sendNote = async (event: FormEvent) => {
    event.preventDefault();
    if (!note.trim()) return;
    try {
      await rate.mutateAsync({ messageId, rating: 'down', note: note.trim() });
      setNoteOpen(false);
      setNoteSent(true);
    } catch {
      // Error surfaced by the global mutation error toast (queryClient.ts); the note stays to retry.
    }
  };

  return (
    <>
      <MessageAction
        tooltip="Good reply"
        label="Good reply"
        aria-pressed={current === 'up'}
        disabled={rate.isPending}
        onClick={() => void choose('up')}
        data-testid="chat-rate-up"
      >
        <ThumbsUp className={cn('size-3.5', current === 'up' && 'fill-current')} />
      </MessageAction>
      <MessageAction
        tooltip="Bad reply"
        label="Bad reply"
        aria-pressed={current === 'down'}
        disabled={rate.isPending}
        onClick={() => void choose('down')}
        data-testid="chat-rate-down"
      >
        <ThumbsDown className={cn('size-3.5', current === 'down' && 'fill-current')} />
      </MessageAction>
      {current && (
        <div className="basis-full text-xs text-muted-foreground" data-testid="chat-rating-notice">
          {noteSent ? 'Thanks — your note was added. ' : ''}
          Shared with your Homestead’s admins, with this conversation so far, to improve the
          assistant. Tap the thumb again to take it back.
        </div>
      )}
      {noteOpen && current === 'down' && (
        <form onSubmit={(e) => void sendNote(e)} className="flex basis-full gap-2" data-testid="chat-rating-note-form">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={1000}
            placeholder="What should it have done? (optional)"
            aria-label="What should it have done?"
            className="h-8 text-sm"
            data-testid="chat-rating-note"
          />
          <Button type="submit" size="sm" disabled={!note.trim() || rate.isPending} data-testid="chat-rating-note-send">
            Send
          </Button>
        </form>
      )}
    </>
  );
}
