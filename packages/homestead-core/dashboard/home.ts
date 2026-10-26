/**
 * The home: its addresses, which home a person gets, and whether the assistant
 * can serve them on it. The assistant's home is the default; the
 * `dashboard.classic_home` flag gives its audience the classic widget stack
 * instead. Either way, an instance with no AI provider configured, or a person
 * who can't use Chat, gets the home without the conversation.
 */

import { getAppById } from '@rambleraptor/homestead-core/apps/registry';
import { useAppVisible } from '@rambleraptor/homestead-core/apps/useAppVisibility';
import { useAiConfigured } from '@rambleraptor/homestead-core/chat/hooks/useAiConfigured';
import { CHAT_APP_ID } from '@rambleraptor/homestead-core/chat/hooks/useConversations';
import { useAppFlag } from '@rambleraptor/homestead-core/settings/hooks/useAppFlag';

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

/**
 * - `agentic`: the assistant's conversation under a strip of widget chips.
 * - `classic`: the widget stack, with an Ask box into a new conversation.
 */
export type HomeMode = 'agentic' | 'classic';

/**
 * Which home `/dashboard` shows the signed-in person, or `undefined` while the
 * flag is still loading — callers show nothing until then, so neither home
 * flashes before the other. A conversation's address shows the conversation
 * whichever home this is.
 */
export function useHomeMode(): HomeMode | undefined {
  const classic = useAppFlag<boolean>('dashboard', 'classic_home');
  if (classic.isLoading) return undefined;
  return classic.value === true ? 'classic' : 'agentic';
}
