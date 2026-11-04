/**
 * One bucket's rows, choreographed.
 *
 * The rows present when the list is first drawn cascade in; a row added later
 * rises on its own; a row checked off or struck out collapses before it goes.
 * The data behind the list moves ahead of the rows — the optimistic update
 * takes a completed todo out of the bucket at once — so the list keeps
 * rendering a leaving row from its last-known record until the collapse has
 * played (see `useLeavingRows`). A todo that comes back (the undo toast) just
 * stops leaving.
 *
 * Only a status that takes the todo off the list for good is an exit. Moving
 * one to Do Later, or back, is a move between two buckets on the same screen:
 * it goes at once and rises into its new section, which is where the eye
 * follows it to.
 */

import { haptic } from '@rambleraptor/homestead-core/shared/haptics';
import { isDone } from '../hooks/useTodos';
import { cascadeDelayMs, useLeavingRows } from '@rambleraptor/homestead-core/shared/hooks/useLeavingRows';
import type { TodoItem, TodoStatus } from '../types';
import { TodoRow, type TodoRowVariant } from './TodoRow';

type RowProps = Omit<
  React.ComponentProps<typeof TodoRow>,
  'todo' | 'variant' | 'enterDelayMs' | 'exiting' | 'onExited'
>;

interface TodoRowsProps {
  todos: TodoItem[];
  variant: TodoRowVariant;
  /** Per-row wiring; `onSetStatus` is wrapped so an exit plays before it lands. */
  rowProps: (todo: TodoItem) => RowProps;
  /**
   * How many rows the caller draws ahead of these (synthetic todos), so the
   * cascade continues from them rather than restarting.
   */
  indexOffset?: number;
}

export function TodoRows({ todos, variant, rowProps, indexOffset = 0 }: TodoRowsProps) {
  const { rows, leave, release } = useLeavingRows(todos);

  return (
    <>
      {rows.map(({ item, exiting, firstPaint }, index) => {
        const props = rowProps(item);
        const onSetStatus = (status: TodoStatus) => {
          if (isDone(status)) {
            leave(item);
            // Felt before it is seen: a tick on the phone in the hand.
            if (status === 'completed') haptic('tap');
          }
          props.onSetStatus(status);
        };
        return (
          <TodoRow
            key={item.id}
            todo={item}
            variant={variant}
            {...props}
            onSetStatus={onSetStatus}
            enterDelayMs={firstPaint ? cascadeDelayMs(index + indexOffset) : 0}
            exiting={exiting}
            onExited={() => release(item.id)}
          />
        );
      })}
    </>
  );
}
