/**
 * The home: its addresses, and whether the assistant can serve the person on
 * it. The home is the same for everyone; what changes is whether its
 * conversation is there. An instance with no AI provider configured, or a
 * person who can't use Chat, gets the home without it — the chips, the
 * widgets, and a note saying why.
 */

import { getAppById } from '@rambleraptor/homestead-core/apps/registry';
import { useAppVisible } from '@rambleraptor/homestead-core/apps/useAppVisibility';
import { useAiConfigured } from '@rambleraptor/homestead-core/chat/hooks/useAiConfigured';
import { CHAT_APP_ID } from '@rambleraptor/homestead-core/chat/hooks/useConversations';

/** The home's address; it is a new conversation. */
export const HOME_PATH = '/dashboard';

/** A conversation's address on the home. */
export const homeConversationPath = (conversationId: string) =>
  `${HOME_PATH}/c/${conversationId}`;

/**
 * - `available`: the conversation is on the home.
 * - `not-configured`: this instance has no AI provider.
 * - `no-access`: Chat isn't among this person's apps.
 */
export type AssistantAvailability = 'available' | 'not-configured' | 'no-access';

/**
 * Whether the assistant can serve the signed-in person, or `undefined` while
 * the server is still asked whether AI is configured — callers show nothing
 * in its place until then, rather than a note that's about to vanish.
 */
export function useAssistantAvailability(): AssistantAvailability | undefined {
  const configured = useAiConfigured();
  const isVisible = useAppVisible();
  const chatApp = getAppById(CHAT_APP_ID);
  if (!chatApp || !isVisible(chatApp)) return 'no-access';
  if (configured === undefined) return undefined;
  return configured ? 'available' : 'not-configured';
}
