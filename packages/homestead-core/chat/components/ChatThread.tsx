/**
 * One conversation: its messages and the composer, as a column that fills its
 * parent. The home puts it under the widget strip. The page owns
 * `useConversation` (and so where a new conversation's id goes); this only
 * renders it.
 */

import { useMemo, useRef } from 'react';
import { findImportPreview } from '../importPreview';
import { OFFLINE_EMPTY_DESCRIPTION, OFFLINE_PLACEHOLDER } from '../offline';
import { ChatCardProvider, type ChatCardContext } from '../cardContext';
import { MessageCircle, WifiOff } from 'lucide-react';
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
import { ErrorBoundary, RenderError } from '@rambleraptor/homestead-core/shared/components/ErrorBoundary';
import { QueryError } from '@rambleraptor/homestead-core/shared/components/QueryError';
import { useToast } from '@rambleraptor/homestead-core/shared/components/ToastProvider';
import { useOnlineStatus } from '@rambleraptor/homestead-core/shared/hooks/useOnlineStatus';
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
  // Offline, the thread is read-only: what's saved on the device stays on
  // screen, and the composer waits (keeping whatever is typed in it).
  const { isOffline } = useOnlineStatus();
  const blocked = missing || isOffline;
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
              isOffline ? (
                // Not saved on this device, and no way to fetch it: say so
                // rather than spin until the connection returns.
                <ConversationEmptyState
                  icon={<WifiOff className="size-10" />}
                  title="This conversation isn't on this device"
                  description="You're offline. It will open when you reconnect."
                  data-testid="chat-history-offline"
                />
              ) : (
                <ConversationEmptyState data-testid="chat-loading">
                  <Loader className="text-muted-foreground" aria-label="Opening the conversation" />
                </ConversationEmptyState>
              )
            ) : (
              <ConversationEmptyState
                icon={isOffline ? <WifiOff className="size-10" /> : <MessageCircle className="size-10" />}
                title={empty.title}
                description={isOffline ? OFFLINE_EMPTY_DESCRIPTION : empty.description}
              />
            )
          ) : (
            messages.map((message, i) => (
              // A message that can't render says so in its place; the
              // conversation around it, and the composer, stay usable.
              <ErrorBoundary
                key={message.id}
                resetKey={message}
                fallback={(error) => (
                  <RenderError
                    compact
                    error={error}
                    title="Couldn’t show this message"
                    data-testid="chat-message-render-error"
                  />
                )}
              >
                <ChatMessage
                  conversationId={conversationId}
                  message={message}
                  stored={chat.storedById.get(message.id)}
                  streaming={busy && i === messages.length - 1 && message.role === 'assistant'}
                  onAnswerApproval={chat.answerApproval}
                  busy={busy || isOffline}
                  findPreview={(previewId) => findImportPreview(messages, previewId)}
                />
              </ErrorBoundary>
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
      {isOffline && messages.length > 0 && (
        <p
          className="flex items-center justify-center gap-1.5 text-muted-foreground text-xs"
          data-testid="chat-offline"
        >
          <WifiOff className="size-3.5" aria-hidden />
          You&rsquo;re offline. The assistant will answer once you reconnect.
        </p>
      )}
      {messages.length === 0 && !busy && !conversationId && !isOffline && starters.length > 0 && (
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
            placeholder={isOffline ? OFFLINE_PLACEHOLDER : placeholder}
            aria-label="Message the assistant"
            data-testid="chat-input"
            disabled={blocked}
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
              disabled={blocked}
              data-testid="chat-attach"
            />
          </PromptInputTools>
          <PromptInputSubmit
            status={chat.remoteRunning ? 'streaming' : status}
            onStop={chat.canStop ? () => void chat.stop() : undefined}
            disabled={blocked || (busy && !chat.canStop)}
            data-testid="chat-send"
          />
        </PromptInputFooter>
      </PromptInput>
    </div>
  </div>
    </ChatCardProvider>
  );
}
