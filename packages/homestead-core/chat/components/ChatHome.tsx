import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { History, MessageCircle } from 'lucide-react';
import type { AppRouteProps } from '@rambleraptor/homestead-core/apps/types';
import { Card } from '@rambleraptor/homestead-core/shared/components/Card';
import { PageHeader } from '@rambleraptor/homestead-core/shared/components/PageHeader';
import { Button } from '@rambleraptor/homestead-core/shared/components/ui/button';
import { cn } from '@rambleraptor/homestead-core/shared/lib/utils';
import { useConversation } from '../hooks/useConversation';
import { useConversations } from '../hooks/useConversations';
import { takeHandOff } from '../handoff';
import { availableStarters } from '../starters';
import { ChatThread } from './ChatThread';
import { ConversationList } from './ConversationList';

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

        <ChatThread
          chat={chat}
          conversationId={conversationId}
          starters={availableStarters()}
          className={cn('md:flex', showList ? 'hidden' : 'flex')}
        />
      </div>
    </div>
  );
}
