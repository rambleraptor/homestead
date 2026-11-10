/**
 * The classic dashboard's way into the assistant: a composer whose message
 * starts a new conversation. The response names the conversation before the
 * reply arrives, and the page moves to it (`/dashboard/c/<id>`), where the
 * reply streams in — the chat outlives the route change (`useConversation`).
 *
 * Shown only when the assistant can serve this person, so an instance without
 * an AI provider never shows a box that can't answer. Offline it stays, but
 * waits: it says the assistant needs a connection and keeps what's typed.
 */

import { useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
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
import {
  Suggestion,
  Suggestions,
} from '@rambleraptor/homestead-core/shared/components/ai-elements/suggestion';
import { useToast } from '@rambleraptor/homestead-core/shared/components/ToastProvider';
import { useOnlineStatus } from '@rambleraptor/homestead-core/shared/hooks/useOnlineStatus';
import {
  ATTACHMENT_ERRORS,
  ATTACHMENT_TYPES,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS,
} from '@rambleraptor/homestead-core/chat/attachment-limits';
import { useConversation } from '@rambleraptor/homestead-core/chat/hooks/useConversation';
import { ComposerAttachments } from '@rambleraptor/homestead-core/chat/components/ComposerAttachments';
import { OFFLINE_PLACEHOLDER } from '@rambleraptor/homestead-core/chat/offline';
import { availableStarters } from '@rambleraptor/homestead-core/chat/starters';
import { usePrefillComposer } from '@rambleraptor/homestead-core/chat/hooks/usePrefillComposer';
import { homeConversationPath, useAssistantAvailability } from '../home';
import { useAskPrefill } from '../hooks/useAskPrefill';

export function AskBox() {
  const assistant = useAssistantAvailability();
  if (assistant !== 'available') return null;
  return <AskComposer />;
}

function AskComposer() {
  const navigate = useNavigate();
  const toast = useToast();
  const onCreated = useCallback(
    (id: string) => navigate(homeConversationPath(id)),
    [navigate],
  );
  const chat = useConversation(null, { onCreated });
  const { isOffline } = useOnlineStatus();
  const starters = isOffline ? [] : availableStarters().slice(0, 2);
  const composer = useRef<HTMLElement>(null);
  usePrefillComposer(composer, useAskPrefill());

  return (
    <section className="space-y-3" data-testid="ask-widget" aria-label="Ask Homestead" ref={composer}>
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
            placeholder={isOffline ? OFFLINE_PLACEHOLDER : 'Ask Homestead…'}
            aria-label="Ask Homestead"
            data-testid="ask-input"
            disabled={isOffline}
            className="min-h-12"
          />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools>
            <Sparkles className="ml-2 size-4 text-gray-400" aria-hidden />
            <PromptInputActionAddAttachments
              label="Attach photos or PDFs"
              disabled={isOffline}
              data-testid="ask-attach"
            />
          </PromptInputTools>
          <PromptInputSubmit
            status={chat.busy ? 'submitted' : 'ready'}
            disabled={isOffline}
            data-testid="ask-send"
          />
        </PromptInputFooter>
      </PromptInput>
      {starters.length > 0 && (
        <Suggestions data-testid="ask-suggestions">
          {starters.map((text) => (
            <Suggestion
              key={text}
              suggestion={text}
              // A failed send already raised a toast.
              onClick={(s) => void chat.send(s).catch(() => {})}
            />
          ))}
        </Suggestions>
      )}
    </section>
  );
}
