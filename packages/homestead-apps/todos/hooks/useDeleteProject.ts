/**
 * Deletes a project. By default its member todos fall back to the main
 * project: PATCH each todo to clear `project`, `in_main`, and `category`
 * first, then DELETE the project record (force-cascading its categories).
 * Ordering matters — if a todo PATCH fails we leave the project intact rather
 * than orphaning todos with a dangling `project` reference. Clearing
 * `category` here also avoids a dangling category pointer, since categories
 * live on the project and go with it.
 *
 * When `deleteTodos` is true, the member todos are removed outright instead of
 * being moved to main — again before the project DELETE, so a partial failure
 * never leaves live todos pointing at a deleted project.
 *
 * The caller's *own* private todos in the list get the same treatment. Other
 * members' private todos can't: they're invisible to whoever is deleting, by
 * design. Those are handled on the read side instead — a private todo filed
 * under a list that no longer exists shows up on its owner's main list (see
 * `filterTodosForScope`), rather than being stranded or silently destroyed.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { USERS } from '@rambleraptor/homestead-core/resources/builtins';
import { PERSONAL_TODOS, PROJECTS, TODOS } from '../resources';
import { logger } from '@rambleraptor/homestead-core/utils/logger';
import type { PersonalTodo, Todo } from '../types';
import { projectIdOf } from './useTodos';

interface DeleteProjectVars {
  projectId: string;
  /** When true, delete the list's todos instead of moving them to main. */
  deleteTodos?: boolean;
}

export function useDeleteProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      deleteTodos = false,
    }: DeleteProjectVars): Promise<void> => {
      const inProject = (t: { project?: string }) => projectIdOf(t) === projectId;
      const userId = aepbase.getCurrentUser()?.id;

      const todos = await aepbase.list<Todo>(TODOS);
      const members = todos.filter(inProject);
      const personal = userId
        ? (
            await aepbase.list<PersonalTodo>(PERSONAL_TODOS, {
              parent: [USERS, userId],
            })
          ).filter(inProject)
        : [];
      const personalParent = { parent: [USERS, userId ?? ''] };

      if (deleteTodos) {
        await Promise.all([
          ...members.map((t) => aepbase.remove(TODOS, t.id)),
          ...personal.map((t) =>
            aepbase.remove(PERSONAL_TODOS, t.id, personalParent),
          ),
        ]);
      } else {
        const cleared = { project: '', in_main: false, category: '' };
        await Promise.all([
          ...members.map((t) => aepbase.update<Todo>(TODOS, t.id, cleared)),
          ...personal.map((t) =>
            aepbase.update<PersonalTodo>(
              PERSONAL_TODOS,
              t.id,
              cleared,
              personalParent,
            ),
          ),
        ]);
      }
      // Force-cascade so the project's category children are removed with it.
      await aepbase.remove(PROJECTS, projectId, { force: true });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.app('todos').all(),
      });
      await queryClient.refetchQueries({
        queryKey: queryKeys.app('todos').all(),
      });
    },
    onError: (error) => logger.error('Project delete mutation error', error),
  });
}
