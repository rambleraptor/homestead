import { CopyIcon } from 'lucide-react';
import { isStaticToolUIPart, type ToolUIPart } from 'ai';
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from '@rambleraptor/homestead-core/shared/components/ai-elements/message';
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from '@rambleraptor/homestead-core/shared/components/ai-elements/tool';
import { useToast } from '@rambleraptor/homestead-core/shared/components/ToastProvider';
import { toolAction } from '../hooks/useConversation';
import type { HomesteadUIMessage, StoredChatMessage } from '../types';

/**
 * Markdown images in a reply render as their alt text and are never fetched.
 * The model writes the URL, and a prompt hidden in a document it read could
 * have it put private data in one — an image would send it the moment it
 * rendered. (Links ask before opening; Streamdown's link safety is on.)
 */
const replyComponents = {
  img: ({ alt }: { alt?: string }) => (
    <span className="text-muted-foreground">[{alt || 'image'}]</span>
  ),
};

/** The text of a message, for copying. */
function messageText(message: HomesteadUIMessage): string {
  return message.parts
    .filter((p) => p.type === 'text')
    .map((p) => p.text)
    .join('\n\n');
}

/**
 * A tool the assistant ran: the resource it touched and the action, with what
 * it sent and got back behind a disclosure.
 */
function ToolCall({ part }: { part: ToolUIPart }) {
  const resource = part.type.slice('tool-'.length);
  const action = toolAction(part.input);
  return (
    <Tool data-testid="chat-tool-call">
      <ToolHeader
        type={part.type}
        state={part.state}
        title={action ? `${resource} · ${action}` : resource}
      />
      <ToolContent>
        <ToolInput input={part.input} />
        <ToolOutput output={part.output} errorText={part.errorText} />
      </ToolContent>
    </Tool>
  );
}

export interface ChatMessageProps {
  message: HomesteadUIMessage;
  /** The stored record behind it, once storage has it. */
  stored?: StoredChatMessage;
  /** This message is the one streaming now. */
  streaming: boolean;
}

export function ChatMessage({ message, stored, streaming }: ChatMessageProps) {
  const toast = useToast();
  const isUser = message.role === 'user';
  const text = messageText(message);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      toast.error(err);
    }
  };

  return (
    <Message from={message.role} data-testid={`chat-message-${message.role}`}>
      <MessageContent>
        {message.parts.map((part, i) => {
          if (part.type === 'text') {
            return isUser ? (
              <p key={i} className="whitespace-pre-wrap break-words">
                {part.text}
              </p>
            ) : (
              <MessageResponse key={i} isAnimating={streaming} components={replyComponents}>
                {part.text}
              </MessageResponse>
            );
          }
          if (isStaticToolUIPart(part)) return <ToolCall key={part.toolCallId} part={part} />;
          return null;
        })}
        {stored?.status === 'error' && (
          <p className="text-destructive" role="alert" data-testid="chat-message-error">
            {stored.error || 'The assistant ran into a problem.'}
          </p>
        )}
        {stored?.status === 'cancelled' && (
          <p className="text-muted-foreground italic" data-testid="chat-message-stopped">
            Stopped
          </p>
        )}
      </MessageContent>
      {!isUser && !streaming && text && (
        <MessageActions>
          <MessageAction tooltip="Copy" label="Copy reply" onClick={() => void copy()}>
            <CopyIcon className="size-3.5" />
          </MessageAction>
        </MessageActions>
      )}
    </Message>
  );
}
