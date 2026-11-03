/**
 * What a chat card can reach in the conversation it sits in. A card in a
 * reply can act through its app's own hooks (a checkbox that updates the
 * record), or carry the conversation on: `send` puts a follow-up into the same
 * conversation, as if the person had typed it. Null outside a conversation
 * (a record card shown somewhere else), so a card offers those actions only
 * where they mean something.
 */

import { createContext, useContext } from 'react';

export interface ChatCardContext {
  conversationId: string | null;
  /** Send a follow-up in this conversation. Rejects while a reply is running. */
  send: (text: string) => Promise<void>;
  /** A reply is running, so `send` has to wait. */
  busy: boolean;
}

const context = createContext<ChatCardContext | null>(null);

/** The conversation a card is in, or null when it isn't in one. */
export function useChatCard(): ChatCardContext | null {
  return useContext(context);
}

/** Provided by `ChatThread` around a conversation's messages. */
export const ChatCardProvider = context.Provider;
