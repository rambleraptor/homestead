'use client';

import { AlertCircle, Loader2 } from 'lucide-react';
import { useTodoBuckets } from '../hooks/useTodos';
import { useCreateTodo } from '../hooks/useCreateTodo';
import { useUpdateTodoStatus } from '../hooks/useUpdateTodoStatus';
import { useSyntheticTodos } from '../hooks/useSyntheticTodos';
import type { TodoStatus } from '../types';
import { TodoHeader } from './TodoHeader';
import { TodoProgressBar } from './TodoProgressBar';
import { AddTodoInput } from './AddTodoInput';
import { TodoRow } from './TodoRow';
import { CollapsibleSection } from './CollapsibleSection';
import { ResetProgressButton } from './ResetProgressButton';

export function TodosHome() {
  const {
    buckets,
    progress,
    isLoading,
    isError,
    error,
  } = useTodoBuckets();
  const synthetic = useSyntheticTodos();
  const create = useCreateTodo();
  const update = useUpdateTodoStatus();

  const handleAdd = async (title: string) => {
    await create.mutateAsync({ title });
  };

  const handleSetStatus = (id: string, status: TodoStatus) => {
    update.mutate({ id, status });
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <TodoHeader />

      <TodoProgressBar progress={progress} />

      <AddTodoInput onSubmit={handleAdd} disabled={create.isPending} />

      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 text-accent-terracotta animate-spin" />
        </div>
      )}

      {isError && (
        <div className="bg-red-50/50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <p className="text-sm text-red-700">
            {error instanceof Error ? error.message : 'Failed to load todos'}
          </p>
        </div>
      )}

      {!isLoading && !isError && (
        <>
          <div className="space-y-2" data-testid="todos-section-active">
            {buckets.active.length === 0 && synthetic.length === 0 && (
              <p className="text-sm text-text-muted font-body italic">
                Nothing pending — add an item above to get started.
              </p>
            )}
            {synthetic.map((todo) => (
              <TodoRow
                key={todo.id}
                todo={todo}
                variant="active"
                onSetStatus={() => undefined}
                readOnly
              />
            ))}
            {buckets.active.map((todo) => (
              <TodoRow
                key={todo.id}
                todo={todo}
                variant="active"
                onSetStatus={(status) => handleSetStatus(todo.id, status)}
                disabled={update.isPending}
              />
            ))}
          </div>

          {buckets.doLater.length > 0 && (
            <CollapsibleSection
              title="Do Later"
              testId="todos-section-dolater"
              count={buckets.doLater.length}
            >
              {buckets.doLater.map((todo) => (
                <TodoRow
                  key={todo.id}
                  todo={todo}
                  variant="doLater"
                  onSetStatus={(status) => handleSetStatus(todo.id, status)}
                  disabled={update.isPending}
                />
              ))}
            </CollapsibleSection>
          )}

          {buckets.completed.length > 0 && (
            <CollapsibleSection
              title="Completed"
              testId="todos-section-completed"
              count={buckets.completed.length}
              defaultOpen={false}
            >
              {buckets.completed.map((todo) => (
                <TodoRow
                  key={todo.id}
                  todo={todo}
                  variant="completed"
                  onSetStatus={(status) => handleSetStatus(todo.id, status)}
                  disabled={update.isPending}
                />
              ))}
            </CollapsibleSection>
          )}
        </>
      )}

      <div className="flex justify-center pt-2">
        <ResetProgressButton disabled={isLoading} />
      </div>
    </div>
  );
}
