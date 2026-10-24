/**
 * The signed-in user's conversations, most recently active first. The change
 * feed keeps the list current — a turn on another device moves its
 * conversation to the top — and the server's 60-day retention prunes it.
 */

import { useResourceDelete, useResourceList } from '@rambleraptor/homestead-core/api/resourceHooks';
import { CONVERSATIONS } from '../resources';
import type { Conversation } from '../types';

export const CHAT_APP_ID = 'chat';

export function useConversations() {
  return useResourceList<Conversation>(CHAT_APP_ID, 'conversation', CONVERSATIONS, {
    orderBy: '-last_message_at',
  });
}

/** Delete a conversation and its messages. */
export function useDeleteConversation() {
  return useResourceDelete(CHAT_APP_ID, 'conversation');
}
