/**
 * The todos app's record cards (`AppConfig.records`): a shared todo and a
 * private one, read live by id. Shown wherever Homestead shows a todo it
 * doesn't otherwise know how to draw — a todo the assistant added, changed or
 * looked up, in a reply.
 */

import type { RecordCardProps } from '@rambleraptor/homestead-core/apps/types';
import { useCardRecord } from '@rambleraptor/homestead-core/records/useCardRecord';
import { RecordTitleLine } from '@rambleraptor/homestead-core/records/components/RecordCard';
import { PERSONAL_TODOS, TODOS } from '../../resources';
import type { Todo, TodoKind } from '../../types';
import { TodoCardRow } from './TodoCardRow';

const COLLECTIONS: Record<TodoKind, { singular: string; plural: string }> = {
  family: { singular: 'todo', plural: TODOS },
  personal: { singular: 'personal-todo', plural: PERSONAL_TODOS },
};

function TodoRecordCard({ kind, id, snapshot, size, parent }: RecordCardProps & { kind: TodoKind }) {
  const { record, deleted, error } = useCardRecord<Todo>({
    appId: 'todos',
    ...COLLECTIONS[kind],
    id,
    snapshot,
    parent,
  });
  if (!record) {
    if (error) {
      return (
        <p className="text-destructive text-sm" role="alert">
          Couldn't load this todo: {error.message}
        </p>
      );
    }
    return <RecordTitleLine snapshot={snapshot} struck={deleted} />;
  }
  return <TodoCardRow todo={record} kind={kind} deleted={deleted} size={size} />;
}

/** A shared (`todo`) todo. */
export function FamilyTodoCard(props: RecordCardProps) {
  return <TodoRecordCard kind="family" {...props} />;
}

/** A private (`personal-todo`) todo. */
export function PersonalTodoCard(props: RecordCardProps) {
  return <TodoRecordCard kind="personal" {...props} />;
}
