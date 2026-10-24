import { useState } from 'react';
import { Check, MessageCircle, Send, Sparkles, User, Wrench, X } from 'lucide-react';
import { Card } from '@rambleraptor/homestead-core/shared/components/Card';
import { Button } from '@rambleraptor/homestead-core/shared/components/Button';
import { PageHeader } from '@rambleraptor/homestead-core/shared/components/PageHeader';
import { Input } from '@rambleraptor/homestead-core/shared/components/ui/input';
import {
  Avatar,
  AvatarFallback,
} from '@rambleraptor/homestead-core/shared/components/ui/avatar';
import {
  Bubble,
  BubbleContent,
} from '@rambleraptor/homestead-core/shared/components/ui/bubble';
import {
  Marker,
  MarkerContent,
  MarkerIcon,
} from '@rambleraptor/homestead-core/shared/components/ui/marker';
import {
  Message,
  MessageAvatar,
  MessageContent,
} from '@rambleraptor/homestead-core/shared/components/ui/message';
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from '@rambleraptor/homestead-core/shared/components/ui/message-scroller';
import { toolAction, useChat, type UiChatMessage } from '../hooks/useChat';
import type { ChatToolCall } from '../types';

/**
 * A tool the assistant invoked, shown as a status marker in the transcript:
 * the resource it touched and, when the call carried one, the action.
 */
function ToolMarker({ call }: { call: ChatToolCall }) {
  const action = toolAction(call);
  return (
    <Marker
      className={call.ok ? undefined : 'text-destructive'}
      title={call.ok ? undefined : call.error}
    >
      <MarkerIcon>
        <Wrench />
      </MarkerIcon>
      <MarkerContent>
        {call.ok ? 'Used' : 'Failed'} <span className="font-medium">{call.tool}</span>
        {action ? (
          <>
            {' · '}
            <span className="font-medium" data-testid="chat-tool-action">
              {action}
            </span>
          </>
        ) : null}
        {!call.ok && call.error ? ` — ${call.error}` : null}
      </MarkerContent>
      {call.ok ? (
        <Check className="size-3.5 shrink-0" aria-hidden="true" />
      ) : (
        <X className="size-3.5 shrink-0" aria-hidden="true" />
      )}
    </Marker>
  );
}

/** Animated three-dot "assistant is typing" indicator. */
function TypingDots() {
  return (
    <div
      className="flex items-center gap-1 py-1"
      data-testid="chat-pending"
      aria-label="Assistant is typing"
    >
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="size-2 rounded-full bg-muted-foreground/60 animate-bounce"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </div>
  );
}

function ChatMessage({ message }: { message: UiChatMessage }) {
  const isUser = message.role === 'user';
  return (
    <Message align={isUser ? 'end' : 'start'}>
      <MessageAvatar>
        <Avatar>
          <AvatarFallback
            className={isUser ? 'bg-primary text-primary-foreground' : undefined}
          >
            {isUser ? (
              <User className="size-4" aria-hidden="true" />
            ) : (
              <Sparkles className="size-4" aria-hidden="true" />
            )}
          </AvatarFallback>
        </Avatar>
      </MessageAvatar>
      <MessageContent>
        {!isUser && message.toolCalls && message.toolCalls.length > 0 && (
          <div className="flex flex-col gap-1">
            {message.toolCalls.map((call, i) => (
              <ToolMarker key={i} call={call} />
            ))}
          </div>
        )}
        <Bubble variant={isUser ? 'default' : 'muted'}>
          <BubbleContent className="whitespace-pre-wrap">
            {message.content}
          </BubbleContent>
        </Bubble>
      </MessageContent>
    </Message>
  );
}

/** Assistant row that shows the typing indicator while a reply is pending. */
function PendingMessage() {
  return (
    <Message align="start">
      <MessageAvatar>
        <Avatar>
          <AvatarFallback>
            <Sparkles className="size-4" aria-hidden="true" />
          </AvatarFallback>
        </Avatar>
      </MessageAvatar>
      <MessageContent>
        <Bubble variant="muted">
          <BubbleContent>
            <TypingDots />
          </BubbleContent>
        </Bubble>
      </MessageContent>
    </Message>
  );
}

export function ChatHome() {
  const { messages, pending, error, notConfigured, send } = useChat();
  const [draft, setDraft] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || pending) return;
    void send(draft);
    setDraft('');
  };

  if (notConfigured) {
    return (
      <div className="space-y-6">
        <PageHeader title="Chat" subtitle="Your household assistant" />
        <Card>
          <div className="text-center py-12">
            <MessageCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-600">Chat isn't configured</p>
            <p className="text-sm text-gray-500 mt-2">
              Configure the `ai` block in homestead.config.ts to enable the
              assistant.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  const isEmpty = messages.length === 0 && !pending;

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] space-y-4">
      <PageHeader
        title="Chat"
        subtitle="Ask the assistant to look up or change your household data"
      />

      {/* Card's inner CardContent isn't a flex container, so the chat
          column uses a plain styled div to let the message list stretch. */}
      <div className="flex-1 flex flex-col min-h-0 bg-surface-white border border-gray-100 rounded-xl shadow-sm p-4">
        {isEmpty ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <MessageCircle className="w-16 h-16 text-gray-300 mb-4" />
            <p className="text-gray-600">Start a conversation</p>
            <p className="text-sm text-gray-500 mt-2">
              Try "What's on my todo list?" or "Add milk to the grocery list"
            </p>
          </div>
        ) : (
          <MessageScrollerProvider autoScroll>
            <MessageScroller className="min-h-0 flex-1">
              <MessageScrollerViewport
                className="py-1"
                data-testid="chat-messages"
              >
                <MessageScrollerContent className="gap-6 px-1">
                  {messages.map((message, i) => (
                    <MessageScrollerItem
                      key={i}
                      messageId={String(i)}
                      scrollAnchor={message.role === 'user'}
                    >
                      <ChatMessage message={message} />
                    </MessageScrollerItem>
                  ))}
                  {pending && (
                    <MessageScrollerItem messageId="pending">
                      <PendingMessage />
                    </MessageScrollerItem>
                  )}
                  {error && (
                    <MessageScrollerItem messageId="error">
                      <Marker
                        variant="border"
                        className="text-destructive"
                        role="alert"
                      >
                        <MarkerContent className="whitespace-pre-wrap break-words">
                          {error}
                        </MarkerContent>
                      </Marker>
                    </MessageScrollerItem>
                  )}
                </MessageScrollerContent>
              </MessageScrollerViewport>
              <MessageScrollerButton />
            </MessageScroller>
          </MessageScrollerProvider>
        )}

        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2 pt-3 mt-3 border-t border-gray-100"
        >
          <Input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Message the assistant…"
            disabled={pending}
            data-testid="chat-input"
            className="flex-1"
          />
          <Button
            type="submit"
            disabled={pending || !draft.trim()}
            data-testid="chat-send"
          >
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
