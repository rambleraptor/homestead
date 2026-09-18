/**
 * Verifies that useDeleteProject batch-clears the `project` and `in_main`
 * fields on every member todo before deleting the project record. The patch
 * pass must complete before the DELETE so a partial failure leaves todos
 * with valid project references.
 *
 * The deleter's own private todos in the list get the same treatment, written
 * through their user-parented path. Other members' private todos are invisible
 * here by design and are handled on the read side (see `filterTodosForScope`).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { useDeleteProject } from '../hooks/useDeleteProject';
import type { PersonalTodo, Todo } from '../types';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

/** The parent path every personal-todo write is addressed through. */
const PERSONAL_PARENT = { parent: ['users', 'test-user-id'] };

function makeTodo(id: string, project?: string, in_main?: boolean): Todo {
  return {
    id,
    path: `todos/${id}`,
    title: `Todo ${id}`,
    status: 'pending',
    create_time: '2025-01-01T00:00:00Z',
    update_time: '2025-01-01T00:00:00Z',
    ...(project ? { project } : {}),
    ...(in_main !== undefined ? { in_main } : {}),
  };
}

function makePersonal(id: string, project?: string): PersonalTodo {
  return {
    id,
    path: `users/test-user-id/personal-todos/${id}`,
    title: `Personal ${id}`,
    status: 'pending',
    create_time: '2025-01-01T00:00:00Z',
    update_time: '2025-01-01T00:00:00Z',
    ...(project ? { project } : {}),
  };
}

/** Route `list` by collection: the hook reads todos and personal-todos. */
function mockLists(todos: Todo[], personal: PersonalTodo[]) {
  vi.mocked(aepbase.list).mockImplementation(async (plural: string) =>
    plural === 'personal-todos' ? personal : todos,
  );
}

describe('useDeleteProject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clears project + in_main on member todos and then removes the project', async () => {
    mockLists(
      [
        makeTodo('a', 'projects/keep'),
        makeTodo('b', 'projects/gone'),
        makeTodo('c', 'projects/gone', true),
        makeTodo('d'), // main only
      ],
      [makePersonal('p1', 'projects/gone'), makePersonal('p2')],
    );
    vi.mocked(aepbase.update).mockResolvedValue({} as Todo);
    vi.mocked(aepbase.remove).mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeleteProject(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync({ projectId: 'gone' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Both member todos got patched — project, in_main, and category cleared
    // so they fall back to main without a dangling category pointer.
    const cleared = { project: '', in_main: false, category: '' };
    expect(aepbase.update).toHaveBeenCalledTimes(3);
    expect(aepbase.update).toHaveBeenCalledWith('todos', 'b', cleared);
    expect(aepbase.update).toHaveBeenCalledWith('todos', 'c', cleared);
    // …and so did the caller's own private todo in that list.
    expect(aepbase.update).toHaveBeenCalledWith(
      'personal-todos',
      'p1',
      cleared,
      PERSONAL_PARENT,
    );
    // Non-member todos were not touched
    const updateCalls = vi.mocked(aepbase.update).mock.calls.map((c) => c[1]);
    expect(updateCalls).not.toContain('a');
    expect(updateCalls).not.toContain('d');
    expect(updateCalls).not.toContain('p2');

    // Project deleted, force-cascading its category children.
    expect(aepbase.remove).toHaveBeenCalledWith('projects', 'gone', {
      force: true,
    });
  });

  it('also clears member todos whose project is stored as the bare id', async () => {
    // The chat/MCP tools write the bare id rather than `projects/{id}`.
    mockLists([makeTodo('a', 'gone'), makeTodo('b', 'keep')], []);
    vi.mocked(aepbase.update).mockResolvedValue({} as Todo);
    vi.mocked(aepbase.remove).mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeleteProject(), {
      wrapper: createWrapper(),
    });
    await result.current.mutateAsync({ projectId: 'gone' });

    expect(aepbase.update).toHaveBeenCalledTimes(1);
    expect(aepbase.update).toHaveBeenCalledWith('todos', 'a', {
      project: '',
      in_main: false,
      category: '',
    });
  });

  it('still removes the project when no todos belong to it', async () => {
    mockLists([makeTodo('x')], [makePersonal('p2')]);
    vi.mocked(aepbase.remove).mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeleteProject(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync({ projectId: 'empty' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(aepbase.update).not.toHaveBeenCalled();
    expect(aepbase.remove).toHaveBeenCalledWith('projects', 'empty', {
      force: true,
    });
  });

  it('deletes member todos instead of moving them when deleteTodos is set', async () => {
    mockLists(
      [
        makeTodo('a', 'projects/keep'),
        makeTodo('b', 'projects/gone'),
        makeTodo('c', 'projects/gone', true),
        makeTodo('d'), // main only
      ],
      [makePersonal('p1', 'projects/gone'), makePersonal('p2')],
    );
    vi.mocked(aepbase.remove).mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeleteProject(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync({ projectId: 'gone', deleteTodos: true });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Member todos are removed outright — no PATCH fallback to main.
    expect(aepbase.update).not.toHaveBeenCalled();
    expect(aepbase.remove).toHaveBeenCalledWith('todos', 'b');
    expect(aepbase.remove).toHaveBeenCalledWith('todos', 'c');
    expect(aepbase.remove).toHaveBeenCalledWith(
      'personal-todos',
      'p1',
      PERSONAL_PARENT,
    );
    // Non-member todos untouched.
    const removedIds = vi.mocked(aepbase.remove).mock.calls.map((c) => c[1]);
    expect(removedIds).not.toContain('a');
    expect(removedIds).not.toContain('d');
    expect(removedIds).not.toContain('p2');
    // Project itself still force-deleted.
    expect(aepbase.remove).toHaveBeenCalledWith('projects', 'gone', {
      force: true,
    });
  });
});
