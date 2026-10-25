/**
 * Which home the signed-in person gets: the assistant-first agentic home, or
 * the classic widget stack. One rule, read everywhere it matters — the
 * dashboard itself, the Chat screen (which sends people with the agentic home
 * there, since it holds their conversations), and the top bar's Chat icon.
 *
 * The agentic home is for someone the assistant can serve: the
 * `dashboard.agentic_home` flag on for them, an AI provider configured, and
 * Chat among the apps they can use.
 */

import { getAppById } from '@rambleraptor/homestead-core/apps/registry';
import { useAppVisible } from '@rambleraptor/homestead-core/apps/useAppVisibility';
import { useAiConfigured } from '@rambleraptor/homestead-core/chat/hooks/useAiConfigured';
import { CHAT_APP_ID } from '@rambleraptor/homestead-core/chat/hooks/useConversations';
import { useAppFlag } from '@rambleraptor/homestead-core/settings/hooks/useAppFlag';

export type HomeMode = 'agentic' | 'classic';

/** The home's address; it is a new conversation on the agentic home. */
export const HOME_PATH = '/dashboard';

/** A conversation's address on the agentic home. */
export const homeConversationPath = (conversationId: string) =>
  `${HOME_PATH}/c/${conversationId}`;

/**
 * The person's home, or `undefined` while that can't be known yet (the flag
 * still loading, or the server still asked whether AI is configured). Callers
 * render nothing until then, so neither home flashes before the other.
 */
export function useHomeMode(): HomeMode | undefined {
  const agentic = useAppFlag<boolean>('dashboard', 'agentic_home');
  const configured = useAiConfigured();
  const isVisible = useAppVisible();
  const chatApp = getAppById(CHAT_APP_ID);
  const canChat = !!chatApp && isVisible(chatApp);

  // Until the flag has loaded it reads as off.
  if (agentic.isLoading) return undefined;
  if (agentic.value !== true || !canChat) return 'classic';
  if (configured === undefined) return undefined;
  return configured ? 'agentic' : 'classic';
}

/**
 * Whether the top bar shows the Chat screen's icon: not for someone whose
 * home is the assistant. Lazily loaded by the chat app's config
 * (`web.topBarVisible`), hence the default export.
 */
export default function useChatInTopBar(): boolean {
  return useHomeMode() === 'classic';
}
