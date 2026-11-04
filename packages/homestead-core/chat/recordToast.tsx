/**
 * Making the assistant visible when it acts out of sight. A turn can finish
 * while the person is on another screen (they asked, then went to Groceries);
 * the change still lands in the data, but nothing says so. `useConversation`
 * calls this for a turn that ends with its page unmounted, and each record the
 * turn added or changed gets a toast with the record in it, the way someone
 * else's change does (`useChangeToasts`): "The assistant added Milk" over the
 * record's card. A deleted record has no card left to show, so it gets a plain
 * line. Past three changes, one toast counts them and opens the conversation.
 *
 * `assistantChangeToasts` is the pure mapping (tested without React); the
 * sonner calls mirror `ToastProvider.record`, which lives outside React and so
 * can't be reached from the chat session.
 */

import type { ToolUIPart } from 'ai';
import { toast as sonnerToast } from 'sonner';
import { RecordToast, type RecordToastProps } from '@rambleraptor/homestead-core/shared/components/RecordToast';
import { recordParent } from '../records/owners';
import { recordTitle, resourceLabel } from '../resources/display';
import { cardActionOf, cardMode, cardRecordId, ownerForTool, recordCardFor, toolOutcome } from './cards';
import { AssistantChangesToast } from './components/AssistantChangesToast';
import type { HomesteadUIMessage } from './types';

/** As long as an undo toast (`ToastProvider`): there's a record to act on. */
const RECORD_TOAST_MS = 8000;
/** Past this many changes, one toast counts them instead. */
export const MAX_RECORD_TOASTS = 3;

export type AssistantChangeToast =
  /** One record the assistant added or changed, with its card. */
  | { kind: 'record'; message: string; card: RecordToastProps['card'] }
  /** One record the assistant removed: nothing left to show but the line. */
  | { kind: 'line'; message: string }
  /** Several changes, counted, with the conversation to open. */
  | { kind: 'summary'; message: string; href: string | null };

const VERBS = { create: 'added', update: 'updated', delete: 'deleted' } as const;
type WriteAction = keyof typeof VERBS;

const isWrite = (action: string | null): action is WriteAction => action !== null && action in VERBS;

/** The home's address for a conversation (`dashboard/home.ts` owns the route; the path is the contract). */
export function conversationHref(conversationId: string | null): string | null {
  return conversationId ? `/dashboard/c/${conversationId}` : null;
}

/** One write the assistant made, as a toast — or null when the part isn't one. */
function changeToast(part: ToolUIPart): AssistantChangeToast | null {
  if (part.state !== 'output-available' || cardMode(part) !== 'done') return null;
  const action = cardActionOf(part.input);
  if (!isWrite(action)) return null;
  const owner = ownerForTool(part.type);
  if (!owner || !recordCardFor(owner)) return null;

  const input = (part.input ?? {}) as Record<string, unknown>;
  const { result, previous } = toolOutcome(part);
  const title =
    recordTitle(result) ?? recordTitle(previous) ?? recordTitle(input.fields) ??
    `a ${resourceLabel(owner.def).toLowerCase()}`;
  const message = `The assistant ${VERBS[action]} ${title}`;
  if (action === 'delete') return { kind: 'line', message };

  const id = cardRecordId(input, result);
  if (!id) return { kind: 'line', message };
  return {
    kind: 'record',
    message,
    card: {
      singular: owner.def.singular,
      id,
      snapshot: result,
      parent: recordParent(owner.def, input, result),
    },
  };
}

/**
 * The toasts for a finished reply: one per record it added, changed or
 * removed, or a single count past {@link MAX_RECORD_TOASTS}.
 */
export function assistantChangeToasts(
  message: HomesteadUIMessage,
  conversationId: string | null,
): AssistantChangeToast[] {
  const toasts: AssistantChangeToast[] = [];
  for (const part of message.parts) {
    if (!part.type.startsWith('tool-') || !('state' in part)) continue;
    const toast = changeToast(part as ToolUIPart);
    if (toast) toasts.push(toast);
  }
  if (toasts.length > MAX_RECORD_TOASTS) {
    return [
      {
        kind: 'summary',
        message: `The assistant changed ${toasts.length} things`,
        href: conversationHref(conversationId),
      },
    ];
  }
  return toasts;
}

/** Show them, as `ToastProvider.record` would. */
export function showAssistantChanges(toasts: AssistantChangeToast[]): void {
  for (const t of toasts) {
    switch (t.kind) {
      case 'record':
        sonnerToast.custom(() => <RecordToast message={t.message} card={t.card} />, {
          duration: RECORD_TOAST_MS,
          className: 'w-full',
        });
        break;
      case 'line':
        sonnerToast.info(t.message);
        break;
      case 'summary':
        sonnerToast.custom(
          (id) => <AssistantChangesToast message={t.message} href={t.href} onOpen={() => sonnerToast.dismiss(id)} />,
          { duration: RECORD_TOAST_MS, className: 'w-full' },
        );
        break;
    }
  }
}
