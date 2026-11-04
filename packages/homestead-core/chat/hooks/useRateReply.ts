import { useMutation, useQueryClient } from '@tanstack/react-query';
import { rateReply } from '../api';
import type { ReplyRating } from '../types';
import { messagesKey } from './useConversation';

export interface RateReplyVars {
  messageId: string;
  rating: ReplyRating | null;
  note?: string;
}

/**
 * Thumbs up or down on a reply in `conversationId` (`chat-messages/{id}:rate`),
 * then reread the conversation so the reply shows its rating. A failure toasts
 * through the global mutation handler.
 */
export function useRateReply(conversationId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ messageId, rating, note }: RateReplyVars) => {
      if (!conversationId) throw new Error('This reply isn’t saved yet');
      return rateReply(conversationId, messageId, rating, note);
    },
    onSettled: () =>
      conversationId ? queryClient.invalidateQueries({ queryKey: messagesKey(conversationId) }) : undefined,
  });
}
