'use client';

import { useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useTodoBuckets } from '../hooks/useTodos';
import { useProjects } from '../hooks/useProjects';
import { useCreateTodo } from '../hooks/useCreateTodo';
import { useUpdateTodoStatus } from '../hooks/useUpdateTodoStatus';
import { useToggleTodoInMain } from '../hooks/useToggleTodoInMain';
import { useSyntheticTodos } from '../hooks/useSyntheticTodos';
import {
  MAIN_PROJECT_ID,
  type ProjectScope,
  type Todo,
  type TodoStatus,
} from '../types';
import { TodoHeader } from './TodoHeader';
import { TodoProgressBar } from './TodoProgressBar';
import { AddTodoInput } from './AddTodoInput';
import { TodoRow } from './TodoRow';
import { CollapsibleSection } from './CollapsibleSection';
import { ResetProgressButton } from './ResetProgressButton';
import { ProjectSwitcher } from './ProjectSwitcher';

export function TodosHome() {
  const [scope, setScope] = useState<ProjectScope>(MAIN_PROJECT_ID);
  const {
    buckets,
    progress,
    isLoading,
    isError,
    error,
  } = useTodoBuckets(scope);
  const projectsQuery = useProjects();
  const synthetic = useSyntheticTodos();
  const create = useCreateTodo();
  const update = useUpdateTodoStatus();
  const togglePin = useToggleTodoInMain();

  const isMain = scope === MAIN_PROJECT_ID;
  const projectsById = new Map(
    (projectsQuery.data ?? []).map((p) => [p.id, p]),
  );

  const handleAdd = async (title: string) => {
    await create.mutateAsync({
      title,
      projectId: isMain ? undefined : scope,
    });
  };

  const handleSetStatus = (id: string, status: TodoStatus) => {
    update.mutate({ id, status });
  };

  const handleTogglePin = (id: string, inMain: boolean) => {
    togglePin.mutate({ id, inMain });
  };

  const originLabelFor = (todo: Todo): string | undefined => {
    if (!isMain) return undefined;
    if (!todo.project) return undefined;
    const id = todo.project.replace(/^projects\//, '');
    return projectsById.get(id)?.name;
  };

  const togglePinHandlerFor = (todo: Todo) => {
    if (isMain) {
      // On main: only show the pin control for todos that originate in a
      // project (so users can unpin them). Native main-only todos shouldn't
      // expose the action.
      if (!todo.project) return undefined;
      return (inMain: boolean) => handleTogglePin(todo.id, inMain);
    }
    return (inMain: boolean) => handleTogglePin(todo.id, inMain);
  };

  // Synthetic todos only belong on the main view.
  const showSynthetic = isMain;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <TodoHeader />

      <ProjectSwitcher scope={scope} onChange={setScope} />

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
          <div data-testid="todos-section-active">
            {buckets.active.length === 0 &&
            (!showSynthetic || synthetic.length === 0) ? (
              <div className="bg-white rounded-lg border border-gray-200 px-4 py-6 text-center">
                <p className="text-sm text-text-muted font-body italic">
                  Nothing pending — add an item above to get started.
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden divide-y divide-gray-100">
                {showSynthetic &&
                  synthetic.map((todo) => (
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
                    onTogglePin={togglePinHandlerFor(todo)}
                    pinnedFromLabel={originLabelFor(todo)}
                  />
                ))}
              </div>
            )}
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
                  onTogglePin={togglePinHandlerFor(todo)}
                  pinnedFromLabel={originLabelFor(todo)}
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
                  onTogglePin={togglePinHandlerFor(todo)}
                  pinnedFromLabel={originLabelFor(todo)}
                />
              ))}
            </CollapsibleSection>
          )}
        </>
      )}

      <div className="flex justify-center pt-2">
        <ResetProgressButton disabled={isLoading} scope={scope} />
      </div>
    </div>
  );
}
