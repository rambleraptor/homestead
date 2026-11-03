/**
 * A tool call on a resource, as a reply shows it: the card as its face (the
 * app's chat card for the action, else the generic one), the AI Elements
 * status badge, and a Details toggle that opens the raw parameters and
 * result underneath — so nothing the JSON showed is lost. MCP and search
 * tools don't come here; `ChatMessage` keeps the plain header for them.
 */

import { Suspense } from 'react';
import { ChevronDownIcon } from 'lucide-react';
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
import { cardActionOf, cardMode, chatCardFor, toolOutcome, type CardOwner } from '../cards';
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
  const { result, error } = toolOutcome(part);
  const props: ChatCardProps = {
    resource: owner.def,
    action,
    mode: mode ?? cardMode(part),
    input: (part.input ?? {}) as Record<string, unknown>,
    result,
    error,
  };
  const generic = <GenericActionCard app={owner.app} {...props} />;
  const custom = chatCardFor(owner, action);
  if (!custom) return generic;
  const Card = getLazyComponent(custom.component);
  return (
    <Suspense fallback={generic}>
      <Card {...props} />
    </Suspense>
  );
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
