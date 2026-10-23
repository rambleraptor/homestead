import {
  actorLabel,
  useChangeToasts,
  type RemoteChange,
} from '@rambleraptor/homestead-core/api/remoteChanges';
import type { Todo, TodoStatus } from '../types';

type TodoChange = RemoteChange<Pick<Todo, 'title' | 'status'>>;

const STATUS_SENTENCE: Record<TodoStatus, (who: string, title: string) => string> = {
  completed: (who, title) => `${who} completed ${title}`,
  cancelled: (who, title) => `${who} cancelled ${title}`,
  do_later: (who, title) => `${who} moved ${title} to Do Later`,
  pending: (who, title) => `${who} moved ${title} back to the list`,
};

/** "Sam completed Take out the bins" — the sentence for one change someone else made. */
export function describeTodoChange(change: TodoChange): string | null {
  const who = actorLabel(change);
  const title = change.record?.title ?? change.previous?.title;
  if (!title) return null;
  switch (change.kind) {
    case 'created':
      return `${who} added ${title}`;
    case 'deleted':
      return `${who} removed ${title}`;
    case 'updated': {
      const status = change.record?.status;
      if (status && change.previous && change.previous.status !== status) {
        return STATUS_SENTENCE[status](who, title);
      }
      return `${who} updated ${title}`;
    }
  }
}

/**
 * Narrate the household's shared todos. Personal todos are private, so the
 * only other writer is the same person on another device — not news.
 */
export function useTodoChangeToasts(): void {
  useChangeToasts<Pick<Todo, 'title' | 'status'>>('todo', describeTodoChange);
}
