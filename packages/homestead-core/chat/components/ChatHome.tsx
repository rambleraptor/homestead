import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { History, MessageCircle } from 'lucide-react';
import type { AppRouteProps } from '@rambleraptor/homestead-core/apps/types';
import { Card } from '@rambleraptor/homestead-core/shared/components/Card';
import { PageHeader } from '@rambleraptor/homestead-core/shared/components/PageHeader';
import { Button } from '@rambleraptor/homestead-core/shared/components/ui/button';
import { cn } from '@rambleraptor/homestead-core/shared/lib/utils';
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@rambleraptor/homestead-core/shared/components/ai-elements/conversation';
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
import { useConversation } from '../hooks/useConversation';
import { useConversations } from '../hooks/useConversations';
import type { HomesteadUIMessage } from '../types';
import { useToast } from '@rambleraptor/homestead-core/shared/components/ToastProvider';
import {
  ATTACHMENT_ERRORS,
  ATTACHMENT_TYPES,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS,
} from '../attachment-limits';
import { takeHandOff } from '../handoff';
import { availableStarters } from '../starters';
import { ChatMessage } from './ChatMessage';
import { ComposerAttachments } from './ComposerAttachments';
import { ConversationList } from './ConversationList';

/** Whether the reply text is already arriving, so no "thinking" row is needed. */
function isAnswering(last: HomesteadUIMessage | undefined): boolean {
  const part = last?.role === 'assistant' ? last.parts.at(-1) : undefined;
  return part?.type === 'text' && part.text !== '';
}

function NotConfigured() {
  return (
    <div className="space-y-6">
      <PageHeader title="Chat" subtitle="Your household assistant" />
      <Card>
        <div className="py-12 text-center">
          <MessageCircle className="mx-auto mb-4 h-16 w-16 text-gray-300" />
          <p className="text-gray-600">Chat isn't configured</p>
          <p className="mt-2 text-sm text-gray-500">
            Configure the `ai` block in homestead.config.ts to enable the assistant.
          </p>
        </div>
      </Card>
    </div>
  );
}

/** `/chat` (a new conversation) and `/chat/:id` (an existing one). */
export function ChatHome({ params }: AppRouteProps) {
  const conversationId = params?.id || null;
  const navigate = useNavigate();
  const toast = useToast();
  const onCreated = useCallback(
    (id: string) => navigate(`/chat/${id}`, { replace: true }),
    [navigate],
  );
  const chat = useConversation(conversationId, { onCreated });
  const conversations = useConversations();
  // Phones have no room for the list beside the thread; it takes the thread's place.
  const [showList, setShowList] = useState(false);
  const title = conversationId
    ? conversations.data?.find((c) => c.id === conversationId)?.title
    : undefined;

  // A message written elsewhere (the dashboard's ask box) starts a new chat
  // here. Taken once, so a re-render, reload or back button never resends it.
  const { send } = chat;
  useEffect(() => {
    if (conversationId) return;
    const handed = takeHandOff();
    if (handed) void send(handed.text, handed.files).catch(() => {});
  }, [conversationId, send]);

  if (chat.notConfigured) return <NotConfigured />;

  const { messages, status, busy } = chat;
  const last = messages.at(-1);
  const showThinking = busy && !isAnswering(last);
  const starters = availableStarters();
  const missing = chat.history.isError;

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col space-y-4">
      <PageHeader
        title={title || 'Chat'}
        subtitle="Ask the assistant to look up or change your household data"
        actions={
          <Button
            variant="outline"
            size="sm"
            className="gap-2 md:hidden"
            aria-pressed={showList}
            onClick={() => setShowList((v) => !v)}
          >
            <History className="size-4" />
            {showList ? 'Back to chat' : 'Conversations'}
          </Button>
        }
      />

      <div className="flex min-h-0 flex-1 gap-4">
        <ConversationList
          activeId={conversationId}
          onDeletedActive={() => navigate('/chat', { replace: true })}
          className={cn('shrink-0 md:flex md:w-60', showList ? 'flex w-full' : 'hidden')}
        />

        <div
          className={cn(
            'min-h-0 min-w-0 flex-1 flex-col rounded-xl border border-gray-100 bg-surface-white shadow-sm md:flex',
            showList ? 'hidden' : 'flex',
          )}
        >
          {missing ? (
            <ConversationEmptyState
              role="alert"
              title="Couldn't open this conversation"
              description={chat.history.error.message}
            />
          ) : (
            <Conversation className="min-h-0" data-testid="chat-messages">
              <ConversationContent>
                {messages.length === 0 && !busy ? (
                  conversationId && chat.history.isPending ? null : (
                    <ConversationEmptyState
                      icon={<MessageCircle className="size-10" />}
                      title="Start a conversation"
                      description="Ask about anything in your household, or have the assistant change it."
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

          <div className="space-y-3 p-3">
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
                  placeholder="Message the assistant…"
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
      </div>
    </div>
  );
}
