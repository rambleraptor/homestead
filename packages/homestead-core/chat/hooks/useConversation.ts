/**
 * One conversation with the assistant: its history, the live turn, and stop.
 *
 * Built on the AI SDK's `useChat` over a transport that speaks the stored-turn
 * protocol (`../api`): the client sends only its new message, the server owns
 * the history. What's on screen is the chat's messages — streamed live during
 * this tab's own turn, otherwise loaded from storage and reloaded whenever the
 * change feed reports a write to the conversation (a turn on another device,
 * or the end of this one).
 *
 * The chat behind each conversation lives outside React (a session, below), so
 * a turn keeps streaming across a route change. That matters on the first
 * message of a new conversation: the response names the conversation before
 * the reply arrives, the page moves to `/dashboard/c/<id>`, and the remounted page
 * picks up the same chat mid-stream.
 */

import { useCallback, useEffect, useMemo } from 'react';
import { Chat, useChat } from '@ai-sdk/react';
import type { FileUIPart } from 'ai';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useResourceEvents } from '@rambleraptor/homestead-core/api/remoteChanges';
import { authStore } from '@rambleraptor/homestead-core/api/aepbase';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { useToast } from '@rambleraptor/homestead-core/shared/components/ToastProvider';
import {
  cancelTurn,
  ChatNotConfiguredError,
  createChatTransport,
  listMessages,
  toUiMessage,
} from '../api';
import { CONVERSATIONS } from '../resources';
import type { HomesteadUIMessage, StoredChatMessage } from '../types';
import { CHAT_APP_ID } from './useConversations';

// ─────────────────────────────── sessions ───────────────────────────────

interface Session {
  chat: Chat<HomesteadUIMessage>;
  conversationId: string | null;
  /** Who it belongs to: a shared device can change hands mid-turn. */
  userId: string;
  /**
   * This tab's last finished reply, until storage has caught up with it — a
   * read taken mid-turn would otherwise briefly show it half-written.
   */
  settling?: string;
  /** Set by the mounted page: where a new conversation should be shown. */
  onConversation?: (id: string) => void;
  /** Set by the mounted page: what to refresh when a turn ends. */
  queryClient?: QueryClient;
}

/** Sessions by user and conversation (`''` for one not yet created). */
const sessions = new Map<string, Session>();

const keyOf = (userId: string, conversationId: string | null) =>
  `${userId}/${conversationId ?? ''}`;

function isBusy(chat: Chat<HomesteadUIMessage>): boolean {
  return chat.status === 'submitted' || chat.status === 'streaming';
}

/** The verb a per-resource tool call carried, or '' for a tool without one. */
export function toolAction(input: unknown): string {
  const action = (input as { action?: unknown } | null)?.action;
  return typeof action === 'string' ? action : '';
}

/**
 * Whether a finished turn may have changed household data: a successful
 * create/update/delete, or a `:verb` custom method (side effects unless
 * declared GET — the client can't tell, so it errs toward refetching).
 */
export function changedData(message: HomesteadUIMessage): boolean {
  return message.parts.some((part) => {
    if (!part.type.startsWith('tool-') || !('state' in part)) return false;
    if (part.state !== 'output-available') return false;
    const action = toolAction(part.input);
    return (
      action === 'create' || action === 'update' || action === 'delete' || action.startsWith(':')
    );
  });
}

function messagesKey(conversationId: string) {
  return [...queryKeys.app(CHAT_APP_ID).resource('chat-message').all(), conversationId] as const;
}

function createSession(userId: string, conversationId: string | null): Session {
  const session: Session = { userId, conversationId } as Session;
  session.chat = new Chat<HomesteadUIMessage>({
    // Message ids become record ids, which must be lowercase.
    generateId: () => crypto.randomUUID(),
    transport: createChatTransport({
      conversationId: () => session.conversationId,
      onConversation: (id) => {
        if (session.conversationId === id) return;
        const draftKey = keyOf(userId, null);
        session.conversationId = id;
        sessions.set(keyOf(userId, id), session);
        if (sessions.get(draftKey) === session) sessions.delete(draftKey);
        session.onConversation?.(id);
      },
    }),
    onFinish: ({ message, isError }) => {
      if (!isError && message.role === 'assistant') session.settling = message.id;
      const qc = session.queryClient;
      if (!qc) return;
      // The tools ran with the user's own token, so what they changed must
      // refetch wherever it's shown. Every app's reads key under `['app', …]`.
      if (changedData(message)) void qc.invalidateQueries({ queryKey: ['app'] });
      // Adopt the stored turn (its final status, a cancel or error note).
      else if (session.conversationId) {
        void qc.invalidateQueries({ queryKey: messagesKey(session.conversationId) });
      }
    },
  });
  return session;
}

function sessionFor(userId: string, conversationId: string | null): Session {
  const key = keyOf(userId, conversationId);
  let session = sessions.get(key);
  if (!session) {
    session = createSession(userId, conversationId);
    sessions.set(key, session);
  }
  return session;
}

/** Drop a conversation's session (after it is deleted). */
export function forgetConversation(conversationId: string): void {
  const key = keyOf(authStore.model?.id ?? '', conversationId);
  const session = sessions.get(key);
  if (session && !isBusy(session.chat)) sessions.delete(key);
}

// ─────────────────────────────── the hook ───────────────────────────────

export interface UseConversationOptions {
  /** Called when the first message of a new conversation creates it. */
  onCreated?: (conversationId: string) => void;
}

export function useConversation(conversationId: string | null, options: UseConversationOptions = {}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const userId = authStore.model?.id ?? '';
  const session = useMemo(() => sessionFor(userId, conversationId), [userId, conversationId]);
  const { messages, status, error, sendMessage, setMessages, clearError, stop } = useChat({
    chat: session.chat,
  });
  const { onCreated } = options;

  useEffect(() => {
    // Re-registered on every mount: a remount (React's dev double-mount
    // included) may follow a cleanup that dropped the idle session.
    const key = keyOf(session.userId, session.conversationId);
    if (!sessions.has(key)) sessions.set(key, session);
    session.queryClient = queryClient;
    session.onConversation = onCreated;
    return () => {
      session.onConversation = undefined;
      // An idle chat is rebuilt from storage next time; a streaming one is
      // kept so its turn survives the route change.
      const key = keyOf(session.userId, session.conversationId);
      if (!isBusy(session.chat) && sessions.get(key) === session) sessions.delete(key);
    };
  }, [session, queryClient, onCreated]);

  // History from storage — on open, and again on every write the change feed
  // reports. Never applied over this tab's own live turn.
  const history = useQuery<StoredChatMessage[], Error>({
    queryKey: messagesKey(conversationId ?? ''),
    queryFn: () => listMessages(conversationId!),
    enabled: !!conversationId,
  });
  const stored = history.data;
  const localBusy = status === 'submitted' || status === 'streaming';
  const settled = stored?.find((m) => m.id === session.settling);
  const awaitingStore = !!session.settling && (!settled || settled.status === 'streaming');

  useEffect(() => {
    if (!stored || localBusy || awaitingStore) return;
    session.settling = undefined;
    setMessages(stored.map(toUiMessage));
  }, [session, stored, localBusy, awaitingStore, setMessages]);

  useResourceEvents(['chat-message', 'conversation'], (change) => {
    if (!conversationId) return;
    const path = `${CONVERSATIONS}/${conversationId}`;
    if (change.path !== path && !change.path.startsWith(`${path}/`)) return;
    void queryClient.invalidateQueries({ queryKey: messagesKey(conversationId) });
  });

  // A send that failed before its turn started: say why, and put the screen
  // back to what is stored (the unsent message comes off it).
  const notConfigured = error instanceof ChatNotConfiguredError;
  useEffect(() => {
    if (!error || notConfigured) return;
    toast.error(error);
    clearError();
    if (conversationId) {
      void queryClient.invalidateQueries({ queryKey: messagesKey(conversationId) });
    } else {
      setMessages([]);
    }
  }, [error, notConfigured, toast, clearError, conversationId, queryClient, setMessages]);

  /** Per-message storage state (status, error), by id. */
  const storedById = useMemo(
    () => new Map((stored ?? []).map((m) => [m.id, m])),
    [stored],
  );

  // A turn running somewhere else — another tab or device, or one this tab
  // started before a reload.
  const remoteRunning = !localBusy && !awaitingStore && stored?.at(-1)?.status === 'streaming';
  const busy = localBusy || remoteRunning;

  /** Send a message, with any files. Rejects if the turn could not start, or can't yet. */
  const send = useCallback(
    async (text: string, files: FileUIPart[] = []) => {
      const trimmed = text.trim();
      if (!trimmed && files.length === 0) return;
      if (isBusy(session.chat) || remoteRunning) {
        throw new Error('wait for the current reply to finish');
      }
      await sendMessage(files.length > 0 ? { text: trimmed, files } : { text: trimmed });
      if (session.chat.status === 'error') throw session.chat.error;
    },
    [session, sendMessage, remoteRunning],
  );

  /** Stop the running turn: here, and on the server, where it would otherwise finish. */
  const stopTurn = useCallback(async () => {
    void stop();
    const id = session.conversationId;
    if (!id) return;
    try {
      await cancelTurn(id);
    } catch (err) {
      toast.error(err);
    }
  }, [session, stop, toast]);

  return {
    messages,
    /** The AI SDK chat status for this tab's own turn. */
    status,
    /** This tab's turn, or one running elsewhere. */
    busy,
    remoteRunning,
    /** Stop is possible once the server has named the conversation. */
    canStop: busy && !!session.conversationId,
    storedById,
    history,
    notConfigured,
    send,
    stop: stopTurn,
  };
}
