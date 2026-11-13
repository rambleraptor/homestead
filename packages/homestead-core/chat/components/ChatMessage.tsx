import type { ReactNode } from 'react';
import { CopyIcon } from 'lucide-react';
import { isStaticToolUIPart, type FileUIPart, type ToolUIPart } from 'ai';
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from '@rambleraptor/homestead-core/shared/components/ai-elements/message';
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '@rambleraptor/homestead-core/shared/components/ai-elements/reasoning';
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from '@rambleraptor/homestead-core/shared/components/ai-elements/tool';
import { ErrorBoundary, RenderError } from '@rambleraptor/homestead-core/shared/components/ErrorBoundary';
import { useToast } from '@rambleraptor/homestead-core/shared/components/ToastProvider';
import { toolAction } from '../hooks/useConversation';
import { useMcpToolLabel } from '../hooks/useMcpToolLabel';
import { groupParts, ownerForTool, rollsUp } from '../cards';
import { MessageAttachments } from './MessageAttachments';
import { ApprovalCard } from './ApprovalCard';
import { ReplyRating } from './ReplyRating';
import type { BulkImportPreview } from '@rambleraptor/homestead-client';
import { ReadRollup, ResourceToolCall } from './ChatCard';
import { ReplyLink, replyRehypePlugins, replyUrlTransform } from './ChatValue';
import { plainReplyText } from '../values';
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
  // Typed values (`[12 Oak St](homestead:address)`) render by type; the rest
  // are ordinary links. See `../values`.
  a: ReplyLink,
};

/**
 * What the model thought before answering, as one block: a step can carry
 * several reasoning parts, and one disclosure reads better than one per part.
 * Empty while the model has nothing to show (most providers send none).
 */
function reasoningText(message: HomesteadUIMessage): string {
  return message.parts
    .filter((p) => p.type === 'reasoning')
    .map((p) => p.text)
    .filter((text) => text.trim() !== '')
    .join('\n\n');
}

/** The text of a message, for copying: typed values read as plain values. */
function messageText(message: HomesteadUIMessage): string {
  return plainReplyText(
    message.parts
      .filter((p) => p.type === 'text')
      .map((p) => p.text)
      .join('\n\n'),
  );
}

/**
 * A tool the assistant ran. A call on one of Homestead's resources is a card
 * (`./ChatCard`); an outside MCP tool or the search shows the tool's name and
 * the action, with what it sent and got back behind a disclosure.
 */
function ToolCall({ part }: { part: ToolUIPart }) {
  const mcp = useMcpToolLabel(part.type);
  const owner = ownerForTool(part.type);
  if (owner && !mcp) return <ResourceToolCall part={part} owner={owner} />;
  const resource = part.type.slice('tool-'.length);
  const action = toolAction(part.input);
  const title = mcp ? `${mcp.server} · ${mcp.tool}` : action ? `${resource} · ${action}` : resource;
  return (
    <Tool data-testid="chat-tool-call">
      <ToolHeader type={part.type} state={part.state} title={title} data-testid="chat-tool-toggle" />
      <ToolContent>
        <ToolInput input={part.input} />
        <ToolOutput output={part.output} errorText={part.errorText} />
      </ToolContent>
    </Tool>
  );
}

/**
 * One piece of a reply, on its own: a card or a stretch of Markdown that
 * throws while rendering says so in its place, and the rest of the reply (and
 * the page) stays. `resetKey` is the part itself — a new one arrives with
 * every streamed update and when storage replaces the live turn, so a part
 * that failed half-written gets another go once there is more of it.
 */
function ReplyPart({ resetKey, children }: { resetKey: unknown; children: ReactNode }) {
  return (
    <ErrorBoundary
      resetKey={resetKey}
      fallback={(error) => (
        <RenderError
          compact
          error={error}
          title="Couldn’t show this part of the reply"
          data-testid="chat-part-error"
        />
      )}
    >
      {children}
    </ErrorBoundary>
  );
}

export interface ChatMessageProps {
  /** The conversation it belongs to, once it has one. */
  conversationId: string | null;
  message: HomesteadUIMessage;
  /** The stored record behind it, once storage has it. */
  stored?: StoredChatMessage;
  /** This message is the one streaming now. */
  streaming: boolean;
  /** Answer a tool call waiting on the person; without it, the wait just shows. */
  onAnswerApproval?: (approvalId: string, approved: boolean) => Promise<void>;
  /** A turn is running, so a waiting call can't be answered yet. */
  busy?: boolean;
  /** Look up an earlier bulk-import preview, for an approval about importing it. */
  findPreview?: (previewId: string) => BulkImportPreview | null;
}

export function ChatMessage({
  conversationId,
  message,
  stored,
  streaming,
  onAnswerApproval,
  busy,
  findPreview,
}: ChatMessageProps) {
  const toast = useToast();
  const isUser = message.role === 'user';
  const text = messageText(message);
  const reasoning = isUser ? '' : reasoningText(message);
  // Open while the thinking is still arriving; it closes itself once the
  // reply proper starts.
  const reasoningStreaming = streaming && message.parts.at(-1)?.type === 'reasoning';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      toast.error(err);
    }
  };

  return (
    <Message from={message.role} data-testid={`chat-message-${message.role}`}>
      {isUser && (
        <MessageAttachments
          conversationId={conversationId}
          messageId={message.id}
          stored={stored?.attachments}
          local={message.parts.filter((p): p is FileUIPart => p.type === 'file')}
        />
      )}
      <MessageContent className={isUser && !text ? 'hidden' : undefined}>
        {(reasoning || reasoningStreaming) && (
          <Reasoning isStreaming={reasoningStreaming} data-testid="chat-reasoning">
            <ReasoningTrigger />
            <ReasoningContent>{reasoning}</ReasoningContent>
          </Reasoning>
        )}
        {groupParts(message.parts, (part) => isStaticToolUIPart(part) && rollsUp(part)).map((group) => {
          if (group.kind === 'reads') {
            return (
              <ReplyPart key={`reads-${group.index}`} resetKey={group.parts.at(-1)}>
                <ReadRollup parts={group.parts as ToolUIPart[]} />
              </ReplyPart>
            );
          }
          const { part, index: i } = group;
          if (part.type === 'text') {
            return isUser ? (
              <p key={i} className="whitespace-pre-wrap break-words">
                {part.text}
              </p>
            ) : (
              <ReplyPart key={i} resetKey={part}>
                <MessageResponse
                  isAnimating={streaming}
                  components={replyComponents}
                  rehypePlugins={replyRehypePlugins}
                  urlTransform={replyUrlTransform}
                >
                  {part.text}
                </MessageResponse>
              </ReplyPart>
            );
          }
          if (isStaticToolUIPart(part)) {
            return (
              <ReplyPart key={part.toolCallId} resetKey={part}>
                {part.state === 'approval-requested' && onAnswerApproval ? (
                  <ApprovalCard
                    part={part}
                    onAnswer={onAnswerApproval}
                    disabled={busy}
                    findPreview={findPreview}
                  />
                ) : (
                  <ToolCall part={part} />
                )}
              </ReplyPart>
            );
          }
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
      {!isUser && !streaming && (text || (conversationId && stored)) && (
        <MessageActions className="flex-wrap">
          {text && (
            <MessageAction tooltip="Copy" label="Copy reply" onClick={() => void copy()}>
              <CopyIcon className="size-3.5" />
            </MessageAction>
          )}
          {conversationId && stored && stored.status !== 'streaming' && (
            <ReplyRating conversationId={conversationId} messageId={stored.id} rating={stored.rating} />
          )}
        </MessageActions>
      )}
    </Message>
  );
}
