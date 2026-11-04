/**
 * A word when a completion made in this tab carries the streak to a
 * milestone (7 days, 30 days).
 *
 * Called from the completion's own success handler rather than watched from
 * the data: another device's completion, or a reload on the right day, can
 * also put the streak at 7, and neither is a moment this tab earned. The
 * streak is read from the cache as it stands, with the todo just completed
 * counted as finished now — a personal todo's update isn't optimistic, so its
 * row may still say `pending` when the server has already said otherwise.
 *
 * Once per person, per milestone, per day (`localStorage`): the second tick
 * on the day the streak reached 7 is just another tick.
 */

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { useToast } from '@rambleraptor/homestead-core/shared/components/ToastProvider';
import { computeMomentum, localDayKey, milestoneKey, STREAK_MILESTONES } from '../momentum';
import type { PersonalTodo, Todo } from '../types';
import { completionTimes } from './useMomentum';

const MILESTONE_WORDS: Record<number, string> = {
  7: 'Something finished every day for a week',
  30: 'A whole month without a day missed',
};

/** Whether this milestone was already celebrated today; remembers it if not. */
function claimMilestone(userId: string, milestone: number, day: string): boolean {
  const key = milestoneKey(userId, milestone, day);
  try {
    if (localStorage.getItem(key)) return false;
    localStorage.setItem(key, '1');
    return true;
  } catch {
    // Storage blocked (private mode, quota): celebrate anyway rather than never.
    return true;
  }
}

export function useStreakMilestone(): (completedId: string) => void {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useCallback(
    (completedId: string) => {
      const todos = queryClient.getQueryData<Todo[]>(queryKeys.app('todos').resource('todo').list()) ?? [];
      const personal =
        queryClient.getQueryData<PersonalTodo[]>(
          queryKeys.app('todos').resource('personal-todo').list(),
        ) ?? [];
      const now = new Date();
      const others = [...todos, ...personal].filter((todo) => todo.id !== completedId);
      const { streak } = computeMomentum([...completionTimes(others), now], now);
      if (!STREAK_MILESTONES.includes(streak)) return;

      const userId = aepbase.getCurrentUser()?.id ?? 'anonymous';
      if (!claimMilestone(userId, streak, localDayKey(now))) return;
      toast.celebrate(`${streak}-day streak!`, { description: MILESTONE_WORDS[streak] });
    },
    [queryClient, toast],
  );
}
