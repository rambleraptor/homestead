/**
 * Shared shapes for the chat app.
 *
 * Types only — imported by both the client (`chat/api.ts`, hooks) and the
 * server (`server/chat/`), so nothing here may carry a runtime import.
 */

import type { UIMessage } from 'ai';
import type { FileDescriptor } from '@rambleraptor/homestead-client';

/**
 * One tool invocation, as the chat executor reports it: what ran and how it
 * came out.
 */
export interface ChatToolCall {
  /**
   * Tool name. One tool per resource, named for it (`gift_cards`); the verb
   * is `args.action` (`list`, `get`, `create`, `update`, `delete`, or a
   * `:verb` custom method). The semantic search tool is the one exception.
   */
  tool: string;
  args: Record<string, unknown>;
  ok: boolean;
  /** aepbase response on success. */
  result?: unknown;
  /** Error message on failure. */
  error?: string;
}

/** `POST /api/chat`: one new message, into a conversation or a new one. */
export interface ChatTurnRequest {
  /** Omit to start a new conversation. */
  conversation_id?: string;
  /** The client picks the id, so a retried send is a conflict, not a duplicate. */
  message: { id: string; text: string };
}

/** What the turn's stream carries on its start event. */
export interface ChatMessageMetadata {
  conversationId: string;
  messageId: string;
}

/** A chat message as the UI and the AI SDK handle it. */
export type HomesteadUIMessage = UIMessage<ChatMessageMetadata>;

/** A `conversation` record. */
export interface Conversation {
  id: string;
  title?: string;
  status?: 'idle' | 'running';
  last_message_at?: string;
  created_by?: string;
  create_time?: string;
  update_time?: string;
}

/** A stored `chat-message` record. */
export interface StoredChatMessage {
  id: string;
  seq: number;
  role: 'user' | 'assistant';
  content?: string;
  parts?: HomesteadUIMessage['parts'];
  status?: 'streaming' | 'complete' | 'error' | 'cancelled';
  error?: string;
  /** Files attached to a person's message. */
  attachments?: FileDescriptor[];
}
