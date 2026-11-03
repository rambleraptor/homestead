/**
 * The todos app's chat card for a list (`AppChatConfig.cards`): the todos a
 * reply looked at, open ones first, each with its checkbox. Rows read from the
 * app's own list query — one request, kept live by the change feed — rather
 * than one read per row; a listed todo that's since gone shows struck through.
 * Any other mode (running, failed) is the generic card.
 */

import type { ChatCardProps } from '@rambleraptor/homestead-core/apps/types';
import { listedRecords } from '@rambleraptor/homestead-core/chat/cards';
import { GenericChatCard } from '@rambleraptor/homestead-core/chat/components/ChatCard';
import {
  CardAppIcon,
  CardHeadline,
  cardHeadline,
} from '@rambleraptor/homestead-core/chat/components/GenericActionCard';
import { ownerOf } from '@rambleraptor/homestead-core/records/owners';
import { usePersonalTodos, useTodos } from '../../hooks/useTodos';
import type { Todo, TodoKind, TodoStatus } from '../../types';
import { TodoCardRow } from './TodoCardRow';

/** Rows shown before the rest are summed up. */
const SHOWN = 10;

const ORDER: Record<TodoStatus, number> = { pending: 0, do_later: 1, completed: 2, cancelled: 3 };

export function TodoListCard(props: ChatCardProps) {
  const listed = props.mode === 'done' ? listedRecords(props.result) : undefined;
  // A list still running, or one whose stored output is only a preview.
  if (!listed) return <GenericChatCard {...props} />;
  const todos = listed.filter((r): r is Todo => typeof (r as Todo | null)?.id === 'string');
  return props.resource.singular === 'todo' ? (
    <FamilyList props={props} listed={todos} />
  ) : (
    <PersonalList props={props} listed={todos} />
  );
}

interface ListProps {
  props: ChatCardProps;
  listed: Todo[];
}

function FamilyList({ props, listed }: ListProps) {
  const live = useTodos();
  return <TodoList props={props} listed={listed} live={live.data} kind="family" />;
}

function PersonalList({ props, listed }: ListProps) {
  const live = usePersonalTodos();
  return <TodoList props={props} listed={listed} live={live.data} kind="personal" />;
}

function TodoList({
  props,
  listed,
  live,
  kind,
}: ListProps & { live: Pick<Todo, 'id' | 'title' | 'status'>[] | undefined; kind: TodoKind }) {
  const owner = ownerOf(props.resource.singular);
  const byId = new Map((live ?? []).map((t) => [t.id, t]));
  const rows = listed
    .map((todo) => ({ todo: byId.get(todo.id) ?? todo, deleted: live !== undefined && !byId.has(todo.id) }))
    .sort((a, b) => Number(a.deleted) - Number(b.deleted) || ORDER[a.todo.status] - ORDER[b.todo.status]);

  return (
    <div data-testid="todo-list-card">
      <CardHeadline icon={owner ? <CardAppIcon app={owner.app} /> : undefined}>{cardHeadline(props)}</CardHeadline>
      {rows.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {rows.slice(0, SHOWN).map(({ todo, deleted }) => (
            <li key={todo.id}>
              <TodoCardRow todo={todo} kind={kind} deleted={deleted} size="row" />
            </li>
          ))}
          {rows.length > SHOWN && (
            <li className="text-muted-foreground">and {rows.length - SHOWN} more</li>
          )}
        </ul>
      )}
    </div>
  );
}
