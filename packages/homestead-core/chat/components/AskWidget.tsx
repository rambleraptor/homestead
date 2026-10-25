/**
 * The dashboard's way into the assistant: a composer that hands its message to
 * the Chat screen, which sends it as the first message of a new conversation
 * (see `../handoff`). One chat, reached from wherever people already are.
 *
 * Hidden until the server says an AI provider is configured, so an instance
 * without one never shows a box that can't answer.
 */

import type { FileUIPart } from 'ai';
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
import {
  ATTACHMENT_ERRORS,
  ATTACHMENT_TYPES,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS,
} from '../attachment-limits';
import { handOff } from '../handoff';
import { useAiConfigured } from '../hooks/useAiConfigured';
import { availableStarters } from '../starters';
import { ComposerAttachments } from './ComposerAttachments';

export function AskWidget() {
  const configured = useAiConfigured();
  const navigate = useNavigate();
  const toast = useToast();

  if (configured !== true) return null;

  const ask = (text: string, files: FileUIPart[] = []) => {
    if (!text.trim() && files.length === 0) return;
    handOff({ text, files });
    navigate('/chat');
  };
  const starters = availableStarters().slice(0, 2);

  return (
    <section className="space-y-3" data-testid="ask-widget" aria-label="Ask Homestead">
      <PromptInput
        onSubmit={({ text, files }) => ask(text, files)}
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
            placeholder="Ask Homestead…"
            aria-label="Ask Homestead"
            data-testid="ask-input"
            className="min-h-12"
          />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools>
            <Sparkles className="ml-2 size-4 text-gray-400" aria-hidden />
            <PromptInputActionAddAttachments label="Attach photos or PDFs" data-testid="ask-attach" />
          </PromptInputTools>
          <PromptInputSubmit status="ready" data-testid="ask-send" />
        </PromptInputFooter>
      </PromptInput>
      {starters.length > 0 && (
        <Suggestions data-testid="ask-suggestions">
          {starters.map((text) => (
            <Suggestion key={text} suggestion={text} onClick={(s) => ask(s)} />
          ))}
        </Suggestions>
      )}
    </section>
  );
}
