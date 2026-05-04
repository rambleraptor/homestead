/**
 * Verifies that useDeleteProject batch-clears the `project` and `in_main`
 * fields on every member todo before deleting the project record. The patch
 * pass must complete before the DELETE so a partial failure leaves todos
 * with valid project references.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { useDeleteProject } from '../hooks/useDeleteProject';
import type { Todo } from '../types';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

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

describe('useDeleteProject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clears project + in_main on member todos and then removes the project', async () => {
    const todos: Todo[] = [
      makeTodo('a', 'projects/keep'),
      makeTodo('b', 'projects/gone'),
      makeTodo('c', 'projects/gone', true),
      makeTodo('d'), // main only
    ];
    vi.mocked(aepbase.list).mockResolvedValue(todos);
    vi.mocked(aepbase.update).mockResolvedValue({} as Todo);
    vi.mocked(aepbase.remove).mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeleteProject(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync('gone');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Both member todos got patched
    expect(aepbase.update).toHaveBeenCalledTimes(2);
    expect(aepbase.update).toHaveBeenCalledWith('todos', 'b', {
      project: '',
      in_main: false,
    });
    expect(aepbase.update).toHaveBeenCalledWith('todos', 'c', {
      project: '',
      in_main: false,
    });
    // Non-member todos were not touched
    const updateCalls = vi.mocked(aepbase.update).mock.calls.map((c) => c[1]);
    expect(updateCalls).not.toContain('a');
    expect(updateCalls).not.toContain('d');

    // Project deleted
    expect(aepbase.remove).toHaveBeenCalledWith('projects', 'gone');
  });

  it('still removes the project when no todos belong to it', async () => {
    vi.mocked(aepbase.list).mockResolvedValue([makeTodo('x')]);
    vi.mocked(aepbase.remove).mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeleteProject(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync('empty');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(aepbase.update).not.toHaveBeenCalled();
    expect(aepbase.remove).toHaveBeenCalledWith('projects', 'empty');
  });
});
