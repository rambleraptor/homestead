'use client';

/**
 * Dashboard widget showing the active todos (pending + in_progress),
 * excluding do_later, completed, and cancelled. Registered via
 * `todosModule.widgets`.
 */

import { ListTodo, Loader2 } from 'lucide-react';
import { WidgetCard } from '@rambleraptor/homestead-core/shared/components/WidgetCard';
import { cn } from '@rambleraptor/homestead-core/shared/lib/utils';
import { useTodoBuckets } from '../hooks/useTodos';
import { useSyntheticTodos } from '../hooks/useSyntheticTodos';

export function TodoWidget() {
  const { buckets, isLoading } = useTodoBuckets();
  const synthetic = useSyntheticTodos();
  const active = [...synthetic, ...buckets.active];
  const hasItems = !isLoading && active.length > 0;

  return (
    <WidgetCard
      icon={ListTodo}
      title="Todos"
      href="/todos"
      data-testid="todos-widget"
      bodyClassName={hasItems ? 'px-4 py-0' : undefined}
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-6 h-6 text-text-muted animate-spin" />
        </div>
      ) : !hasItems ? (
        <p className="font-body text-text-muted py-2">
          Nothing active — you're all caught up.
        </p>
      ) : (
        <ul className="divide-y divide-gray-50" data-testid="todos-widget-list">
          {active.map((todo) => {
            const isInProgress = todo.status === 'in_progress';
            return (
              <li
                key={todo.id}
                data-testid={`todos-widget-item-${todo.id}`}
                className={cn(
                  'flex items-center gap-3 py-3',
                  isInProgress && 'border-l-4 border-l-yellow-400 pl-2',
                )}
              >
                <span className="flex-1 font-display text-lg text-text-main truncate">
                  {todo.title}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </WidgetCard>
  );
}
