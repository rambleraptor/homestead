import { useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { History, MessageCircle } from 'lucide-react';
import type { AppRouteProps } from '@rambleraptor/homestead-core/apps/types';
import { Card } from '@rambleraptor/homestead-core/shared/components/Card';
import { PageHeader } from '@rambleraptor/homestead-core/shared/components/PageHeader';
import { Button } from '@rambleraptor/homestead-core/shared/components/ui/button';
import { cn } from '@rambleraptor/homestead-core/shared/lib/utils';
import { useFillPage } from '@rambleraptor/homestead-core/layout/pageFill';
import {
  HOME_PATH,
  homeConversationPath,
  useHomeMode,
} from '@rambleraptor/homestead-core/dashboard/homeMode';
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

/**
 * `/chat` (a new conversation) and `/chat/:id` (an existing one). Someone whose
 * home is the assistant (`useHomeMode`) holds their conversations there, so
 * they're sent to the same conversation on the home instead. Decided before
 * the screen mounts, so nothing here (a handed-off message) runs for them.
 */
export function ChatHome({ params }: AppRouteProps) {
  const mode = useHomeMode();
  if (mode === undefined) return null;
  if (mode === 'agentic') {
    const id = params?.id;
    return <Navigate to={id ? homeConversationPath(id) : HOME_PATH} replace />;
  }
  return <ChatScreen params={params} />;
}

function ChatScreen({ params }: AppRouteProps) {
  // The screen fills the main area, so the text bar is docked at the bottom
  // and only the conversation scrolls.
  useFillPage();
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

  if (chat.notConfigured) {
    return (
      <div className="mx-auto min-h-0 w-full max-w-7xl flex-1 overflow-y-auto px-4 py-6 lg:px-6 lg:py-8">
        <NotConfigured />
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col gap-4 px-4 pt-6 pb-4 lg:px-6 lg:pt-8 lg:pb-6">
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
