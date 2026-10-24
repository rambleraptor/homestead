/**
 * The chat assistant's stored conversations.
 *
 * A `conversation` is one thread; its `chat-message`s are the turns, in `seq`
 * order. The server owns the history: a client sends only its new message and
 * the turn runner (`core/server/chat/turns.ts`) rebuilds the model's context
 * from these rows, writes the user's message, and fills in the assistant's at
 * each step of the turn — so a turn survives a closed tab, and every device
 * sees it through the change feed.
 *
 * Access: a conversation is private to whoever started it (`access: private`),
 * and its messages inherit that through their parent (parent access
 * inheritance), so sharing a conversation later shares its messages with it.
 *
 * Chat's own tools never see these (`modelTools.chat: false` — the assistant
 * reading or deleting its transcripts mid-turn would be nonsense); MCP clients
 * do, so "what did we talk about last week" works from Claude Desktop.
 */

import type { ResourceDefinition } from '../resources/types';

export const CONVERSATIONS = 'conversations';
export const CHAT_MESSAGES = 'chat-messages';

export const chatResources: ResourceDefinition[] = [
  {
    singular: 'conversation',
    plural: CONVERSATIONS,
    description: 'One thread with the household assistant.',
    user_settable_create: true,
    access: { model: 'private' },
    // A conversation nobody has written to in 60 days is deleted, messages and all.
    retention: { days: 60, field: 'last_message_at' },
    modelTools: { chat: false },
    fields: {
      title: { type: 'string', description: 'Shown in the conversation list.' },
      status: {
        type: 'string',
        enum: ['idle', 'running'],
        default: 'idle',
        description: 'running while a turn is in flight; one turn at a time.',
      },
      last_message_at: {
        type: 'string',
        format: 'date-time',
        description: 'When the latest message was written (UTC).',
      },
      created_by: {
        type: 'string',
        reference: { resource: 'user' },
        description: 'Who started the conversation.',
      },
    },
    customMethods: {
      cancel: {
        target: 'item',
        description: 'Stop the turn running in this conversation, if any.',
        load: () => import('./methods/cancel'),
      },
    },
  },
  {
    singular: 'chat-message',
    plural: CHAT_MESSAGES,
    description: 'One message in a conversation: what a person asked, or what the assistant did and said.',
    parents: ['conversation'],
    // Client-chosen ids: a retried send hits a conflict instead of a duplicate.
    user_settable_create: true,
    fields: {
      seq: {
        type: 'integer',
        required: true,
        description: 'Position in the conversation, from 1. Timestamps tie within a second.',
      },
      role: { type: 'string', enum: ['user', 'assistant'], required: true },
      content: { type: 'string', description: 'The plain text of the message.' },
      parts: {
        type: 'array',
        items: { type: 'object' },
        description:
          'AI SDK UI message parts — text, tool calls with their (capped) outputs — ' +
          'so the UI renders stored history the way it renders a live stream.',
      },
      status: {
        type: 'string',
        enum: ['streaming', 'complete', 'error', 'cancelled'],
        default: 'complete',
      },
      error: { type: 'string', description: 'Why the turn failed, when status is error.' },
      usage: { type: 'object', description: 'Token counts for this turn (assistant messages).' },
    },
  },
];
