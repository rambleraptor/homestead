/**
 * One conversation: its messages and the composer, as a column that fills its
 * parent. The home puts it under the widget strip. The page owns
 * `useConversation` (and so where a new conversation's id goes); this only
 * renders it.
 */

import { useMemo, useRef } from 'react';
import { findImportPreview } from '../importPreview';
import { ChatCardProvider, type ChatCardContext } from '../cardContext';
import { MessageCircle } from 'lucide-react';
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@rambleraptor/homestead-core/shared/components/ai-elements/conversation';
import { Loader } from '@rambleraptor/homestead-core/shared/components/ai-elements/loader';
import { Message, MessageContent } from '@rambleraptor/homestead-core/shared/components/ai-elements/message';
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputBody,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from '@rambleraptor/homestead-core/shared/components/ai-elements/prompt-input';
import { Shimmer } from '@rambleraptor/homestead-core/shared/components/ai-elements/shimmer';
import {
  Suggestion,
  Suggestions,
} from '@rambleraptor/homestead-core/shared/components/ai-elements/suggestion';
import { QueryError } from '@rambleraptor/homestead-core/shared/components/QueryError';
import { useToast } from '@rambleraptor/homestead-core/shared/components/ToastProvider';
import { cn } from '@rambleraptor/homestead-core/shared/lib/utils';
import {
  ATTACHMENT_ERRORS,
  ATTACHMENT_TYPES,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS,
} from '../attachment-limits';
import type { useConversation } from '../hooks/useConversation';
import { usePrefillComposer } from '../hooks/usePrefillComposer';
import type { HomesteadUIMessage } from '../types';
import { ChatMessage } from './ChatMessage';
import { ComposerAttachments } from './ComposerAttachments';

/** Whether the reply text is already arriving, so no "thinking" row is needed. */
function isAnswering(last: HomesteadUIMessage | undefined): boolean {
  const part = last?.role === 'assistant' ? last.parts.at(-1) : undefined;
  return part?.type === 'text' && part.text !== '';
}

export interface ChatThreadProps {
  chat: ReturnType<typeof useConversation>;
  /** The stored conversation shown, once there is one. */
  conversationId: string | null;
  /** Prompts offered on an empty new conversation. */
  starters?: string[];
  /** What an empty new conversation says. */
  empty?: { title: string; description: string };
  placeholder?: string;
  /** Text to put in the composer, focused and unsent (a `?ask=` link). */
  draft?: string;
  /** Leave off the card frame (border, background, shadow): the thread is the page. */
  bare?: boolean;
  className?: string;
}

const DEFAULT_EMPTY = {
  title: 'Start a conversation',
  description: 'Ask about anything in your household, or have the assistant change it.',
};

export function ChatThread({
  chat,
  conversationId,
  starters = [],
  empty = DEFAULT_EMPTY,
  placeholder = 'Message the assistant…',
  draft,
  bare = false,
  className,
}: ChatThreadProps) {
  const toast = useToast();
  const { messages, status, busy } = chat;
  const last = messages.at(-1);
  const showThinking = busy && !isAnswering(last);
  const missing = chat.history.isError;
  const composer = useRef<HTMLDivElement>(null);
  usePrefillComposer(composer, draft);

  // What a card in a reply can reach: a follow-up in this conversation.
  const { send } = chat;
  const cardContext = useMemo<ChatCardContext>(
    () => ({ conversationId, busy, send: (text: string) => send(text) }),
    [conversationId, busy, send],
  );

  return (
    <ChatCardProvider value={cardContext}>
    <div
      className={cn(
        'min-h-0 min-w-0 flex-1 flex-col',
        !bare && 'rounded-xl border border-gray-100 bg-surface-white shadow-sm',
        className,
      )}
    >
    {missing ? (
      <div className="flex h-full items-center justify-center p-4">
        <QueryError
          error={chat.history.error}
          onRetry={() => void chat.history.refetch()}
          title="Couldn’t open this conversation"
          className="w-full max-w-md"
          data-testid="chat-history-error"
        />
      </div>
    ) : (
      <Conversation className="min-h-0" data-testid="chat-messages">
        <ConversationContent>
          {messages.length === 0 && !busy ? (
            conversationId && chat.history.isPending ? (
              <ConversationEmptyState data-testid="chat-loading">
                <Loader className="text-muted-foreground" aria-label="Opening the conversation" />
              </ConversationEmptyState>
            ) : (
              <ConversationEmptyState
                icon={<MessageCircle className="size-10" />}
                title={empty.title}
                description={empty.description}
              />
            )
          ) : (
            messages.map((message, i) => (
              <ChatMessage
                key={message.id}
                conversationId={conversationId}
                message={message}
                stored={chat.storedById.get(message.id)}
                streaming={busy && i === messages.length - 1 && message.role === 'assistant'}
                onAnswerApproval={chat.answerApproval}
                busy={busy}
                findPreview={(previewId) => findImportPreview(messages, previewId)}
              />
            ))
          )}
          {showThinking && (
            <Message from="assistant">
              <MessageContent>
                <div data-testid="chat-pending" aria-label="The assistant is working">
                  <Shimmer>{chat.remoteRunning ? 'Working in another window…' : 'Thinking…'}</Shimmer>
                </div>
              </MessageContent>
            </Message>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
    )}

    <div className="space-y-3 p-3" ref={composer}>
      {messages.length === 0 && !busy && !conversationId && starters.length > 0 && (
        <Suggestions data-testid="chat-suggestions">
          {starters.map((text) => (
            <Suggestion
              key={text}
              suggestion={text}
              onClick={(text) => void chat.send(text).catch(() => {})}
            />
          ))}
        </Suggestions>
      )}
      <PromptInput
        onSubmit={({ text, files }) => chat.send(text, files)}
        accept={ATTACHMENT_TYPES.join(',')}
        multiple
        maxFiles={MAX_ATTACHMENTS}
        maxFileSize={MAX_ATTACHMENT_BYTES}
        onError={(err) => toast.error(ATTACHMENT_ERRORS[err.code])}
      >
        <PromptInputHeader className="empty:hidden">
          <ComposerAttachments />
        </PromptInputHeader>
        <PromptInputBody>
          <PromptInputTextarea
            placeholder={placeholder}
            aria-label="Message the assistant"
            data-testid="chat-input"
            disabled={missing}
            onKeyDown={(e) => {
              // Mid-reply, Enter waits: the draft stays put rather than
              // being sent into a conversation that can't take it yet.
              if (busy && e.key === 'Enter' && !e.shiftKey) e.preventDefault();
            }}
          />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools>
            <PromptInputActionAddAttachments
              label="Attach photos or PDFs"
              disabled={missing}
              data-testid="chat-attach"
            />
          </PromptInputTools>
          <PromptInputSubmit
            status={chat.remoteRunning ? 'streaming' : status}
            onStop={chat.canStop ? () => void chat.stop() : undefined}
            disabled={missing || (busy && !chat.canStop)}
            data-testid="chat-send"
          />
        </PromptInputFooter>
      </PromptInput>
    </div>
  </div>
    </ChatCardProvider>
  );
}
