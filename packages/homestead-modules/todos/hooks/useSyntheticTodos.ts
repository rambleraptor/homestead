/**
 * Synthetic todos derived from other modules' state.
 *
 * Unlike real todos, these don't live in aepbase — they're rendered into the
 * active bucket as a read-only nudge and disappear when the source state is
 * empty. They have no controls (no pause, no cancel, no complete) and
 * "complete" implicitly when the underlying count hits zero.
 */

import { useMemo } from 'react';
import { useGroceries } from '../../groceries/hooks/useGroceries';
import type { Todo } from '../types';

export const SYNTHETIC_TODO_GROCERIES_ID = 'synthetic:groceries';

export function useSyntheticTodos(): Todo[] {
  const { data: groceries = [] } = useGroceries();

  return useMemo(() => {
    const synthetic: Todo[] = [];
    const unchecked = groceries.filter((item) => !item.checked).length;
    if (unchecked > 0) {
      synthetic.push({
        id: SYNTHETIC_TODO_GROCERIES_ID,
        path: SYNTHETIC_TODO_GROCERIES_ID,
        title: `Buy ${unchecked} ${unchecked === 1 ? 'grocery' : 'groceries'}`,
        status: 'pending',
        create_time: '',
        update_time: '',
      });
    }
    return synthetic;
  }, [groceries]);
}
