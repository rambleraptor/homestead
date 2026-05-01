/**
 * Resets every non-pending todo back to `pending`. This is the action
 * behind the "reset progress" link at the bottom of the screen.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { logger } from '@/core/utils/logger';
import type { Todo } from '../types';

export function useResetTodos() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<number> => {
      const todos = await aepbase.list<Todo>(AepCollections.TODOS);
      const stale = todos.filter((t) => t.status !== 'pending');
      await Promise.all(
        stale.map((t) =>
          aepbase.update<Todo>(AepCollections.TODOS, t.id, {
            status: 'pending',
          }),
        ),
      );
      return stale.length;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.module('todos').all(),
      });
      await queryClient.refetchQueries({
        queryKey: queryKeys.module('todos').all(),
      });
    },
    onError: (error) => logger.error('Todo reset error', error),
  });
}
