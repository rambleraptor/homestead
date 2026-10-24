import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDistanceToNowStrict } from 'date-fns';
import { Loader2, MessageSquarePlus, Trash2 } from 'lucide-react';
import { Button } from '@rambleraptor/homestead-core/shared/components/ui/button';
import { ConfirmDialog } from '@rambleraptor/homestead-core/shared/components/ConfirmDialog';
import { cn } from '@rambleraptor/homestead-core/shared/lib/utils';
import { useConversations, useDeleteConversation } from '../hooks/useConversations';
import { forgetConversation } from '../hooks/useConversation';
import type { Conversation } from '../types';

function when(conversation: Conversation): string {
  const at = conversation.last_message_at || conversation.update_time;
  if (!at) return '';
  const date = new Date(at);
  return Number.isNaN(date.getTime()) ? '' : formatDistanceToNowStrict(date, { addSuffix: true });
}

export interface ConversationListProps {
  activeId: string | null;
  /** After the open conversation is deleted. */
  onDeletedActive: () => void;
  className?: string;
}

/** The user's conversations, newest activity first, with a way to start another. */
export function ConversationList({ activeId, onDeletedActive, className }: ConversationListProps) {
  const conversations = useConversations();
  const remove = useDeleteConversation();
  const [pendingDelete, setPendingDelete] = useState<Conversation | null>(null);

  const confirmDelete = async () => {
    const target = pendingDelete;
    if (!target) return;
    try {
      await remove.mutateAsync(target.id);
      forgetConversation(target.id);
      if (target.id === activeId) onDeletedActive();
    } catch {
      // The mutation cache's error handler has already shown a toast.
    } finally {
      setPendingDelete(null);
    }
  };

  return (
    <nav className={cn('flex min-h-0 flex-col gap-2', className)} aria-label="Conversations">
      <Button asChild variant="outline" size="sm" className="justify-start gap-2">
        <Link to="/chat" data-testid="chat-new">
          <MessageSquarePlus className="size-4" />
          New chat
        </Link>
      </Button>

      {conversations.isError ? (
        <p className="px-2 text-sm text-destructive" role="alert">
          Couldn't load conversations: {conversations.error.message}
        </p>
      ) : (
        <ul className="flex min-h-0 flex-col gap-0.5 overflow-y-auto" data-testid="chat-conversations">
          {(conversations.data ?? []).map((c) => (
            <li
              key={c.id}
              className="group relative"
              data-testid="chat-conversation"
              data-status={c.status ?? 'idle'}
            >
              <Link
                to={`/chat/${c.id}`}
                aria-current={c.id === activeId ? 'page' : undefined}
                className={cn(
                  'flex flex-col rounded-md px-2 py-1.5 pr-9 text-sm hover:bg-muted',
                  c.id === activeId && 'bg-muted font-medium',
                )}
              >
                <span className="truncate">{c.title || 'Untitled conversation'}</span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  {c.status === 'running' && (
                    <Loader2 className="size-3 animate-spin" aria-label="Working" />
                  )}
                  {when(c)}
                </span>
              </Link>
              <Button
                variant="ghost"
                size="icon-sm"
                className="absolute top-1/2 right-1 -translate-y-1/2 opacity-60 hover:opacity-100"
                aria-label={`Delete ${c.title || 'conversation'}`}
                data-testid="chat-conversation-delete"
                onClick={() => setPendingDelete(c)}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        isOpen={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => void confirmDelete()}
        title="Delete conversation?"
        message="The conversation and all of its messages will be deleted. This can't be undone."
        confirmLabel="Delete"
        variant="danger"
        isLoading={remove.isPending}
      />
    </nav>
  );
}
