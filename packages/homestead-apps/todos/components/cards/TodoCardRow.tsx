/**
 * One todo, as a card shows it: a checkbox that checks it off, its title, and
 * where it stands (later, cancelled, private). At `card` size it also offers
 * "Do later" and a way into the Todos app. Writes go through the app's own
 * hooks, so a tick here is the same write as a tick on the Todos page.
 */

import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { Badge } from '@rambleraptor/homestead-core/shared/components/ui/badge';
import { Button } from '@rambleraptor/homestead-core/shared/components/ui/button';
import { Checkbox } from '@rambleraptor/homestead-core/shared/components/ui/checkbox';
import { cn } from '@rambleraptor/homestead-core/shared/lib/utils';
import { useUpdateTodo } from '../../hooks/useUpdateTodo';
import { useUpdatePersonalTodo } from '../../hooks/useUpdatePersonalTodo';
import { isDone } from '../../hooks/useTodos';
import type { Todo, TodoKind, TodoStatus } from '../../types';

export interface TodoCardRowProps {
  todo: Pick<Todo, 'id' | 'title' | 'status'>;
  kind: TodoKind;
  /** The todo is gone: shown struck through, with nothing to act on. */
  deleted?: boolean;
  size: 'row' | 'card';
}

export function TodoCardRow({ todo, kind, deleted = false, size }: TodoCardRowProps) {
  const updateFamily = useUpdateTodo();
  const updatePersonal = useUpdatePersonalTodo();
  const update = kind === 'family' ? updateFamily : updatePersonal;

  const setStatus = async (status: TodoStatus) => {
    try {
      await update.mutateAsync({ id: todo.id, data: { status } });
    } catch {
      // Shown by the global mutation error toast (queryClient.ts).
    }
  };

  const done = isDone(todo.status);
  const busy = update.isPending;

  return (
    <div className="min-w-0" data-testid="todo-card" data-kind={kind} data-status={todo.status}>
      <div className="flex items-center gap-2">
        {!deleted && (
          <Checkbox
            checked={todo.status === 'completed'}
            disabled={busy || todo.status === 'cancelled'}
            onCheckedChange={(checked) => void setStatus(checked === true ? 'completed' : 'pending')}
            aria-label={todo.status === 'completed' ? `Mark ${todo.title} not done` : `Mark ${todo.title} done`}
            data-testid="todo-card-check"
          />
        )}
        <span
          className={cn(
            'min-w-0 flex-1 break-words',
            size === 'card' && 'font-medium text-base',
            (done || deleted) && 'line-through text-muted-foreground',
          )}
          data-testid="todo-card-title"
        >
          {todo.title}
        </span>
        {kind === 'personal' && (
          <Lock className="size-3.5 shrink-0 text-muted-foreground" aria-label="Private — only you can see it" />
        )}
        {todo.status === 'do_later' && !deleted && (
          <Badge variant="secondary" data-testid="todo-card-later">
            Later
          </Badge>
        )}
        {todo.status === 'cancelled' && !deleted && <Badge variant="outline">Cancelled</Badge>}
      </div>
      {deleted && (
        <p className="mt-0.5 text-muted-foreground text-xs" data-testid="todo-card-removed">
          Removed
        </p>
      )}
      {size === 'card' && !deleted && (
        <div className="mt-2 flex flex-wrap gap-2">
          {!done && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void setStatus(todo.status === 'do_later' ? 'pending' : 'do_later')}
              data-testid="todo-card-toggle-later"
            >
              {todo.status === 'do_later' ? 'Back to the list' : 'Do later'}
            </Button>
          )}
          <Button size="sm" variant="ghost" asChild>
            <Link to="/todos">Open Todos</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
