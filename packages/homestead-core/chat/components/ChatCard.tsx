/**
 * A tool call on a resource, as a reply shows it: the card as its face (the
 * app's chat card for the action, else the generic one), the AI Elements
 * status badge, and a Details toggle that opens the raw parameters and
 * result underneath — so nothing the JSON showed is lost. MCP and search
 * tools don't come here; `ChatMessage` keeps the plain header for them.
 */

import { Suspense } from 'react';
import { ChevronDownIcon, SearchIcon } from 'lucide-react';
import type { ToolUIPart } from 'ai';
import type { ChatCardProps } from '@rambleraptor/homestead-core/apps/types';
import { getLazyComponent } from '@rambleraptor/homestead-core/apps/lazy';
import {
  getStatusBadge,
  Tool,
  ToolContent,
  ToolInput,
  ToolOutput,
} from '@rambleraptor/homestead-core/shared/components/ai-elements/tool';
import { Button } from '@rambleraptor/homestead-core/shared/components/ui/button';
import { CollapsibleTrigger } from '@rambleraptor/homestead-core/shared/components/ui/collapsible';
import { resourceLabel } from '@rambleraptor/homestead-core/resources/display';
import { Shimmer } from '@rambleraptor/homestead-core/shared/components/ai-elements/shimmer';
import { ownerOf } from '@rambleraptor/homestead-core/records/owners';
import {
  cardActionOf,
  cardMode,
  chatCardFor,
  ownerForTool,
  toolOutcome,
  type CardOwner,
} from '../cards';
import { GenericActionCard } from './GenericActionCard';

export interface CardFaceProps {
  part: ToolUIPart;
  owner: CardOwner;
  /** Override the mode the part's state implies (the approval card shows `proposed`). */
  mode?: ChatCardProps['mode'];
}

/** The card alone: what the call did, in the person's terms. */
export function CardFace({ part, owner, mode }: CardFaceProps) {
  const action = cardActionOf(part.input);
  if (!action) {
    // The arguments are still streaming in, so not even the action is known yet.
    return (
      <Shimmer as="span" className="font-medium text-sm">
        {`Working with ${resourceLabel(owner.def, 'plural').toLowerCase()}…`}
      </Shimmer>
    );
  }
  const { result, error, previous } = toolOutcome(part);
  const props: ChatCardProps = {
    resource: owner.def,
    action,
    mode: mode ?? cardMode(part),
    input: (part.input ?? {}) as Record<string, unknown>,
    result,
    error,
    ...(previous ? { previous } : {}),
  };
  const custom = chatCardFor(owner, action);
  if (!custom) return <GenericActionCard app={owner.app} {...props} />;
  const Card = getLazyComponent(custom.component);
  // The app's card is wrapped in the same test id and attributes the generic
  // one carries, so every card is found the same way.
  return (
    <div
      className="min-w-0 text-sm"
      data-testid={`chat-card-${owner.def.singular}`}
      data-action={action}
      data-mode={props.mode}
    >
      <Suspense fallback={<GenericActionCard app={owner.app} marked={false} {...props} />}>
        <Card {...props} />
      </Suspense>
    </div>
  );
}

/**
 * The generic card for a chat card's props: what an app's own card renders for
 * the modes it doesn't draw itself (running, failed…), inside the wrapper that
 * already marks it.
 */
export function GenericChatCard(props: ChatCardProps) {
  const owner = ownerOf(props.resource.singular);
  if (!owner) return null;
  return <GenericActionCard app={owner.app} marked={false} {...props} />;
}

/** The card in the transcript, with its status and the Details disclosure. */
export function ResourceToolCall({ part, owner }: { part: ToolUIPart; owner: CardOwner }) {
  const mode = cardMode(part);
  // A failed call is `output-available` with `{ error }`: badge it as the error it is.
  const badgeState = mode === 'failed' ? 'output-error' : part.state;
  return (
    <Tool data-testid="chat-tool-call">
      <div className="flex items-start gap-2 p-3">
        <div className="min-w-0 flex-1">
          <CardFace part={part} owner={owner} />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {getStatusBadge(badgeState)}
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Details" data-testid="chat-tool-toggle">
              <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
            </Button>
          </CollapsibleTrigger>
        </div>
      </div>
      <ToolContent>
        <ToolInput input={part.input} />
        <ToolOutput output={part.output} errorText={part.errorText} />
      </ToolContent>
    </Tool>
  );
}

/**
 * A run of reads in one reply, folded into a single quiet line — "Looked at
 * people and gift cards" — with each read's card behind it. Looking things up
 * is how the assistant works, not what it did, so it shouldn't crowd out the
 * answer or the changes it made.
 */
export function ReadRollup({ parts }: { parts: ToolUIPart[] }) {
  const labels = [
    ...new Set(
      parts
        .map((part) => ownerForTool(part.type))
        .filter((owner): owner is CardOwner => owner !== undefined)
        .map((owner) => resourceLabel(owner.def, 'plural').toLowerCase()),
    ),
  ];
  const named =
    labels.length <= 1 ? (labels[0] ?? '') : `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}`;
  return (
    <Tool data-testid="chat-tool-rollup">
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-4 p-3" data-testid="chat-tool-rollup-toggle">
        <span className="flex items-center gap-2 text-muted-foreground text-sm">
          <SearchIcon className="size-4" aria-hidden />
          Looked at {named}
        </span>
        <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <ToolContent className="space-y-2">
        {parts.map((part) => {
          const owner = ownerForTool(part.type);
          return owner ? <ResourceToolCall key={part.toolCallId} part={part} owner={owner} /> : null;
        })}
      </ToolContent>
    </Tool>
  );
}

