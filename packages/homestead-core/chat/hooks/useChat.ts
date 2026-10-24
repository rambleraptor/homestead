/**
 * Ephemeral chat state. The transcript lives in component state only —
 * a reload starts a fresh conversation (no aepbase persistence).
 */

import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ChatNotConfiguredError, sendChat } from '../api';
import type { ChatMessage, ChatToolCall } from '../types';

export interface UiChatMessage extends ChatMessage {
  /** Tool activity behind an assistant reply, for display. */
  toolCalls?: ChatToolCall[];
}

/** The verb a per-resource tool call carried, or '' for a tool without one. */
export function toolAction(call: Pick<ChatToolCall, 'args'>): string {
  const action = call.args?.action;
  return typeof action === 'string' ? action : '';
}

/**
 * True when a tool call may have mutated aepbase: a create/update/delete
 * action, or a `:verb` custom method (which has side effects unless declared
 * GET — the client can't tell, so it errs toward refetching). `list`/`get`
 * and the search tool leave the cache untouched. Tool names are the resource
 * (see server/chat/per-resource.ts); the verb is `args.action`.
 */
function isMutation(call: ChatToolCall): boolean {
  if (!call.ok) return false;
  const action = toolAction(call);
  return (
    action === 'create' || action === 'update' || action === 'delete' || action.startsWith(':')
  );
}

export function useChat() {
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<UiChatMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);

  const send = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || pending) return;

      const userMessage: UiChatMessage = { role: 'user', content };
      const transcript = [...messages, userMessage];
      setMessages(transcript);
      setPending(true);
      setError(null);

      try {
        // Server only needs role/content; toolCalls are display-only.
        const response = await sendChat(
          transcript.map(({ role, content: c }) => ({ role, content: c })),
        );
        setMessages([
          ...transcript,
          {
            role: 'assistant',
            content: response.reply,
            toolCalls: response.toolCalls,
          },
        ]);
        // Chat mutates aepbase with the user's own token, so any data it
        // changed must invalidate the feature apps' cached queries —
        // otherwise the change only appears after a manual refresh. Every
        // app's read hook keys under `['app', ...]` (see queryKeys.app),
        // so one prefix invalidation refetches whatever is on screen.
        if (response.toolCalls.some(isMutation)) {
          void queryClient.invalidateQueries({ queryKey: ['app'] });
        }
      } catch (err) {
        // Keep the transcript (including the unanswered user message) so
        // the user can see what failed and retry.
        if (err instanceof ChatNotConfiguredError) {
          setNotConfigured(true);
        } else {
          setError(err instanceof Error ? err.message : 'Something went wrong');
        }
      } finally {
        setPending(false);
      }
    },
    [messages, pending, queryClient],
  );

  return { messages, pending, error, notConfigured, send };
}
