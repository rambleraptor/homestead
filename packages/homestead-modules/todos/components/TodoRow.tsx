'use client';

import { Check, Moon, Pause, Undo2, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@rambleraptor/homestead-core/shared/lib/utils';
import type { Todo, TodoStatus } from '../types';

export type TodoRowVariant = 'active' | 'doLater' | 'completed';

interface TodoRowProps {
  todo: Todo;
  variant: TodoRowVariant;
  onSetStatus: (status: TodoStatus) => void;
  disabled?: boolean;
  /**
   * Read-only rows render no action buttons. Used for synthetic todos that
   * are derived from other modules' state (e.g. "Buy N groceries") and
   * complete implicitly when the source state is empty.
   */
  readOnly?: boolean;
}

interface ActionConfig {
  testId: string;
  label: string;
  icon: LucideIcon;
  color: string;
  status: TodoStatus;
}

function actionsForVariant(variant: TodoRowVariant, todo: Todo): ActionConfig[] {
  if (variant === 'active') {
    const isInProgress = todo.status === 'in_progress';
    return [
      {
        testId: 'cancel',
        label: 'Cancel',
        icon: X,
        color: 'text-red-500 hover:bg-red-500/10',
        status: 'cancelled',
      },
      {
        testId: 'inprogress',
        label: isInProgress ? 'Move back to pending' : 'Mark in progress',
        icon: Pause,
        color: cn(
          'text-yellow-500 hover:bg-yellow-500/10',
          isInProgress && 'bg-yellow-500/15',
        ),
        status: isInProgress ? 'pending' : 'in_progress',
      },
      {
        testId: 'dolater',
        label: 'Move to do later',
        icon: Moon,
        color: 'text-brand-navy hover:bg-brand-navy/10',
        status: 'do_later',
      },
      {
        testId: 'complete',
        label: 'Mark complete',
        icon: Check,
        color: 'text-green-500 hover:bg-green-500/10',
        status: 'completed',
      },
    ];
  }

  if (variant === 'doLater') {
    return [
      {
        testId: 'cancel',
        label: 'Cancel',
        icon: X,
        color: 'text-red-500 hover:bg-red-500/10',
        status: 'cancelled',
      },
      {
        testId: 'restore',
        label: 'Move back to active',
        icon: Undo2,
        color: 'text-brand-navy hover:bg-brand-navy/10',
        status: 'pending',
      },
      {
        testId: 'complete',
        label: 'Mark complete',
        icon: Check,
        color: 'text-green-500 hover:bg-green-500/10',
        status: 'completed',
      },
    ];
  }

  return [
    {
      testId: 'undo',
      label: 'Undo',
      icon: Undo2,
      color: 'text-brand-navy hover:bg-brand-navy/10',
      status: 'pending',
    },
  ];
}

export function TodoRow({ todo, variant, onSetStatus, disabled, readOnly }: TodoRowProps) {
  const actions = readOnly ? [] : actionsForVariant(variant, todo);
  const isInProgress = variant === 'active' && todo.status === 'in_progress';
  const isCancelled = todo.status === 'cancelled';

  return (
    <div
      data-testid={`todo-row-${todo.id}`}
      className={cn(
        'group flex items-center gap-3 rounded-2xl border bg-surface-white px-4 py-3 shadow-sm transition-colors',
        'border-gray-100 hover:border-gray-200',
        isInProgress && 'border-l-4 border-l-yellow-400 pl-3',
        variant === 'completed' && 'bg-bg-pearl',
      )}
    >
      <span
        className={cn(
          'flex-1 font-body text-base text-text-main',
          variant === 'completed' && 'text-text-muted',
          isCancelled && 'line-through',
        )}
      >
        {todo.title}
      </span>
      <div className="flex items-center gap-1">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.testId}
              type="button"
              onClick={() => onSetStatus(action.status)}
              disabled={disabled}
              aria-label={`${action.label}: ${todo.title}`}
              data-testid={`todo-row-${todo.id}-${action.testId}`}
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-full transition-colors',
                action.color,
                'disabled:opacity-40 disabled:cursor-not-allowed',
              )}
            >
              <Icon className="w-5 h-5" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
