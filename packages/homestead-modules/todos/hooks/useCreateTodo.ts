import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { aepbase, AepCollections } from '@rambleraptor/homestead-core/api/aepbase';
import { logger } from '@rambleraptor/homestead-core/utils/logger';
import type { Todo, TodoFormData } from '../types';

export function useCreateTodo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: TodoFormData): Promise<Todo> => {
      const userId = aepbase.getCurrentUser()?.id;
      const createdBy = userId ? `users/${userId}` : undefined;
      return aepbase.create<Todo>(AepCollections.TODOS, {
        title: data.title,
        status: 'pending',
        ...(createdBy ? { created_by: createdBy } : {}),
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
    onError: (error) => logger.error('Todo create mutation error', error),
  });
}
