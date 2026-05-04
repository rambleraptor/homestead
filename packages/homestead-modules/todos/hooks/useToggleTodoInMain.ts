import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { aepbase, AepCollections } from '@rambleraptor/homestead-core/api/aepbase';
import { logger } from '@rambleraptor/homestead-core/utils/logger';
import type { Todo } from '../types';

export function useToggleTodoInMain() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      inMain,
    }: {
      id: string;
      inMain: boolean;
    }): Promise<Todo> => {
      return aepbase.update<Todo>(AepCollections.TODOS, id, {
        in_main: inMain,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.module('todos').all(),
      });
      await queryClient.refetchQueries({
        queryKey: queryKeys.module('todos').all(),
      });
    },
    onError: (error) => logger.error('Todo pin-to-main error', error),
  });
}
