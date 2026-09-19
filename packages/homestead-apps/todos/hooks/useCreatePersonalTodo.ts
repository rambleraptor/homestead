import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { USERS } from '@rambleraptor/homestead-core/resources/builtins';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { PERSONAL_TODOS } from '../resources';
import type { PersonalTodo, TodoStatus } from '../types';

interface CreatePersonalTodoBody {
  title: string;
  status: TodoStatus;
  /** 'projects/{id}' — omit to file it on the main list. */
  project?: string;
  /** Category record id within the project. */
  category?: string;
}

/**
 * Create a private todo under the current user's `/users/{me}/personal-todos`
 * collection. User-parented resources can't ride the generic mutation-defaults
 * machinery (it doesn't resolve the built-in `user` root), so this writes
 * through the raw client with an explicit parent — the same pattern the
 * notification-subscription hooks use — and invalidates the whole todos app so
 * the merged list, widget, and list counts refresh together.
 */
export function useCreatePersonalTodo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreatePersonalTodoBody) => {
      const userId = aepbase.getCurrentUser()?.id;
      if (!userId) throw new Error('User not authenticated');
      return aepbase.create<PersonalTodo>(
        PERSONAL_TODOS,
        body as unknown as Record<string, unknown>,
        { parent: [USERS, userId] },
      );
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.app('todos').all() }),
  });
}
