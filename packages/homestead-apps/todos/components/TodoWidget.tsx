/**
 * Dashboard widget showing the active (pending) todos, excluding do_later,
 * completed, and cancelled. Registered via `todosApp.widgets`.
 */

import { Link } from 'react-router-dom';
import { CheckCheck, ListTodo } from 'lucide-react';
import { EmptyState } from '@rambleraptor/homestead-core/shared/components/EmptyState';
import { QueryError } from '@rambleraptor/homestead-core/shared/components/QueryError';
import { SkeletonList } from '@rambleraptor/homestead-core/shared/components/Skeleton';
import { WidgetCard } from '@rambleraptor/homestead-core/shared/components/WidgetCard';
import { cn } from '@rambleraptor/homestead-core/shared/lib/utils';
import { TODO_KIND_RAIL_BASE, TODO_KIND_STYLE } from '../kindStyles';
import type { TodoKind } from '../types';
import { useTodoBuckets } from '../hooks/useTodos';
import {
  SYNTHETIC_TODO_GROCERIES_ID,
  useSyntheticTodos,
} from '../hooks/useSyntheticTodos';

export function TodoWidget() {
  const { buckets, isLoading, isError, error, refetch } = useTodoBuckets();
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
        <SkeletonList
          rows={3}
          label="Loading todos"
          data-testid="todos-widget-loading"
        />
      ) : isError && buckets.active.length === 0 ? (
        <QueryError
          compact
          error={error}
          onRetry={() => void refetch()}
          title="Couldn’t load todos"
          data-testid="todos-widget-error"
        />
      ) : !hasItems ? (
        <EmptyState
          compact
          icon={CheckCheck}
          title="You’re all caught up"
          description="Nothing active right now."
          assistantPrompt="Add a todo to call the plumber tomorrow"
          data-testid="todos-widget-empty"
        />
      ) : (
        <ul className="divide-y divide-gray-50" data-testid="todos-widget-list">
          {active.map((todo) => {
            const href =
              todo.id === SYNTHETIC_TODO_GROCERIES_ID ? '/groceries' : null;
            // Synthetic rows (derived from another app's state) have no kind
            // and so get no rail — there is no personal/family choice behind
            // them to communicate.
            const kind: TodoKind | undefined =
              'kind' in todo && (todo.kind === 'family' || todo.kind === 'personal')
                ? todo.kind
                : undefined;
            const label = todo.title;
            return (
              <li
                key={todo.id}
                data-testid={`todos-widget-item-${todo.id}`}
                className="relative flex items-center gap-3 py-3"
              >
                {kind && (
                  // Pulled out to the card's own edge — the body is padded by
                  // the same `px-4`, so the negative inset lands the rail flush
                  // with the card while the row's dividers stay inset. Same
                  // edge-not-object reading as the list rows.
                  <span
                    title={TODO_KIND_STYLE[kind].label}
                    className={cn(
                      TODO_KIND_RAIL_BASE,
                      '-left-4',
                      TODO_KIND_STYLE[kind].rail,
                    )}
                  >
                    <span className="sr-only">{TODO_KIND_STYLE[kind].label}</span>
                  </span>
                )}
                {href ? (
                  <Link
                    to={href}
                    data-testid={`todos-widget-item-${todo.id}-link`}
                    className="flex-1 font-display text-lg text-text-main truncate hover:text-accent-terracotta transition-colors"
                  >
                    {label}
                  </Link>
                ) : (
                  <span className="flex-1 font-display text-lg text-text-main truncate">
                    {label}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </WidgetCard>
  );
}
